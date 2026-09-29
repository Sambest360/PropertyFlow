-- Tenant isolation and privilege hardening.
-- Apply after 011a_public_rpc_stopgap.sql. This file replaces the same two
-- marketplace RPC signatures (boolean -> jsonb) and does not drop 011a.
-- Apply with database/postgres/ops/011/apply.sh (single transaction, fail-fast locks).
-- Do not run this file on its own against production.
-- This file is not run by `npm run db:migrate` (that script only applies 001).
--
-- Fixes:
--   * SELECT policies that let every landlord, tenant, and contractor read every agency's rows
--   * users self-update that could set role = SUPER_ADMIN or frontend_role / permissions
--   * agency staff inserting a SUPER_ADMIN row
--   * password_hash readable by the authenticated role
--   * anon marketplace RPCs returning full user, building, and unit rows
--   * landlords reading every user in the agency, including ID documents

-- ---------------------------------------------------------------------------
-- Stop privilege escalation on public.users
-- ---------------------------------------------------------------------------
-- PostgREST logs in as `authenticator` and then SET ROLE to the JWT role
-- (anon, authenticated, or service_role). SET ROLE changes current_user.
-- session_user stays `authenticator` for every API role, so it cannot tell
-- them apart. This trigger is SECURITY INVOKER so current_user is that
-- SET ROLE target. A SECURITY DEFINER body would see the function owner and
-- the anon/authenticated check would never match.
-- The JWT role claim is a second signal and cannot widen a client session:
-- if current_user is anon or authenticated, or the claim says so, privilege
-- columns stay locked. service_role, and a direct admin session with no
-- client JWT, still pass through (Hono API, migrations, service key).

CREATE OR REPLACE FUNCTION public.users_count_unscoped()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*) FROM public.users;
$$;

REVOKE ALL ON FUNCTION public.users_count_unscoped() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.users_count_unscoped() TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_user_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  jwt_role text;
  caller text;
BEGIN
  jwt_role := nullif(btrim(coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    CASE
      WHEN nullif(current_setting('request.jwt.claims', true), '') IS NULL THEN NULL
      ELSE nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    END
  )), '');
  caller := current_user;

  IF caller = 'service_role'
     OR (
       caller NOT IN ('anon', 'authenticated')
       AND coalesce(jwt_role, '') NOT IN ('anon', 'authenticated')
     )
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'SUPER_ADMIN'
       AND NOT is_super_admin()
       AND public.users_count_unscoped() > 0 THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    RETURN NEW;
  END IF;

  IF is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Self-service edits keep identity, access, and verification decisions.
  -- Privileged keys are removed from the incoming metadata and copied back from
  -- the stored row so a caller cannot add an "approved" verification that was not there.
  NEW.role := OLD.role;
  NEW.client_id := OLD.client_id;
  NEW.auth_user_id := OLD.auth_user_id;
  NEW.active := OLD.active;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
    - 'frontend_role' - 'enabledPermissions' - 'verification';
  NEW.metadata := NEW.metadata || jsonb_build_object(
    'frontend_role', COALESCE(OLD.metadata->>'frontend_role', OLD.role)
  );
  IF OLD.metadata ? 'enabledPermissions' THEN
    NEW.metadata := NEW.metadata || jsonb_build_object(
      'enabledPermissions', OLD.metadata->'enabledPermissions'
    );
  END IF;
  IF OLD.metadata ? 'verification' THEN
    NEW.metadata := NEW.metadata || jsonb_build_object(
      'verification', OLD.metadata->'verification'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- The trigger runs as the invoker, so the API roles that can write users need EXECUTE.
-- PUBLIC does not. Default privileges already granted the three API roles; grant
-- them explicitly so a database without those defaults still fires the trigger.
REVOKE ALL ON FUNCTION public.protect_user_privileged_columns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.protect_user_privileged_columns() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS protect_user_privileged_columns ON users;
CREATE TRIGGER protect_user_privileged_columns
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_privileged_columns();

DROP POLICY IF EXISTS users_insert_admin ON users;
CREATE POLICY users_insert_admin ON users
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (
      is_agency_staff()
      AND client_id IS NOT NULL
      AND client_id = current_app_client_id()
      AND role <> 'SUPER_ADMIN'
    )
  );

-- Same-client read without a staff check let every member of an agency read every colleague,
-- including metadata. Staff keep users_select_agency. A landlord sees only END_USER rows
-- that are a tenant or an applicant on a building they own. Applicants and tenants are
-- both role END_USER in this schema.
DROP POLICY IF EXISTS users_select_self_agency ON users;
DROP POLICY IF EXISTS users_select_portfolio ON users;
CREATE POLICY users_select_portfolio ON users
  FOR SELECT TO authenticated
  USING (
    current_app_user_role() = 'LANDLORD'
    AND users.role = 'END_USER'
    AND (
      EXISTS (
        SELECT 1
        FROM leases l
        JOIN units un ON un.id = l.unit_id
        JOIN buildings b ON b.id = un.building_id
        WHERE l.tenant_id = users.id
          AND b.landlord_id = current_app_user_id()
      )
      OR EXISTS (
        SELECT 1
        FROM applications a
        JOIN units un ON un.id = a.unit_id
        JOIN buildings b ON b.id = un.building_id
        WHERE a.applicant_id = users.id
          AND b.landlord_id = current_app_user_id()
      )
    )
  );

REVOKE SELECT ON TABLE public.users FROM authenticated;
GRANT SELECT (
  id, auth_user_id, client_id, email, first_name, last_name, phone, role, active,
  avatar_url, metadata, created_at, updated_at
) ON TABLE public.users TO authenticated;

-- ---------------------------------------------------------------------------
-- Replace the role-wide SELECT policies from 003_rls_bootstrap.sql.
-- Those policies OR'd LANDLORD / END_USER / CONTRACTOR, and Postgres ORs policies,
-- so those roles could read every row of every agency.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl TEXT;
  missing TEXT[] := ARRAY[]::TEXT[];
  tables TEXT[] := ARRAY[
    'buildings', 'units', 'rooms', 'internal_assets', 'leads', 'applications',
    'leases', 'bookings', 'viewing_slots', 'payments', 'documents',
    'maintenance_tickets', 'message_threads', 'messages', 'notifications',
    'suite_alerts', 'client_lookup_configs', 'client_subscriptions', 'invoices',
    'event_log'
  ];
BEGIN
  -- Fail before any policy in this loop is replaced. apply.sh runs this file
  -- in one transaction, so a raise here also rolls back the trigger above.
  FOREACH tbl IN ARRAY tables
  LOOP
    IF to_regclass('public.' || tbl) IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = tbl
           AND column_name = 'client_id'
       )
    THEN
      missing := missing || tbl;
    END IF;
  END LOOP;
  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION
      '011 refused: policy loop tables are not tenant-scoped: %. No policies were changed.',
      missing;
  END IF;

  FOREACH tbl IN ARRAY tables
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_select ON %I FOR SELECT TO authenticated
       USING (is_super_admin() OR (client_id IS NOT NULL AND client_id = current_app_client_id()))',
      tbl, tbl
    );
  END LOOP;
END $$;

-- Portal reads that are actually theirs (the policies above no longer open the whole table).

DROP POLICY IF EXISTS notifications_own_select ON notifications;
CREATE POLICY notifications_own_select ON notifications
  FOR SELECT TO authenticated
  USING (user_id = current_app_user_id());

DROP POLICY IF EXISTS payments_party_select ON payments;
CREATE POLICY payments_party_select ON payments
  FOR SELECT TO authenticated
  USING (party_user_id = current_app_user_id());

DROP POLICY IF EXISTS bookings_applicant_select ON bookings;
CREATE POLICY bookings_applicant_select ON bookings
  FOR SELECT TO authenticated
  USING (applicant_id = current_app_user_id());

DROP POLICY IF EXISTS documents_own_select ON documents;
CREATE POLICY documents_own_select ON documents
  FOR SELECT TO authenticated
  USING (
    uploaded_by = current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM applications a
      WHERE a.id = documents.application_id
        AND a.applicant_id = current_app_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM leases l
      WHERE l.id = documents.lease_id
        AND l.tenant_id = current_app_user_id()
    )
  );

DROP POLICY IF EXISTS threads_participant_select ON message_threads;
CREATE POLICY threads_participant_select ON message_threads
  FOR SELECT TO authenticated
  USING (
    participant_ids ? current_app_user_id()::text
    OR participant_ids ? COALESCE(
      (SELECT u.metadata->>'frontend_id' FROM users u WHERE u.id = current_app_user_id()),
      ''
    )
  );

DROP POLICY IF EXISTS messages_participant_select ON messages;
CREATE POLICY messages_participant_select ON messages
  FOR SELECT TO authenticated
  USING (
    from_user_id = current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM message_threads t
      WHERE t.id = messages.thread_id
        AND (
          t.participant_ids ? current_app_user_id()::text
          OR t.participant_ids ? COALESCE(
            (SELECT u.metadata->>'frontend_id' FROM users u WHERE u.id = current_app_user_id()),
            ''
          )
        )
    )
  );

DROP POLICY IF EXISTS units_public_read ON units;
CREATE POLICY units_public_read ON units
  FOR SELECT TO authenticated
  USING (
    status_config_key IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE')
    AND lower(coalesce(listing_type, '')) <> 'not_listed'
  );

DROP POLICY IF EXISTS units_tenant_linked ON units;
CREATE POLICY units_tenant_linked ON units
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM applications a
      WHERE a.unit_id = units.id AND a.applicant_id = current_app_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM leases l
      WHERE l.unit_id = units.id AND l.tenant_id = current_app_user_id()
    )
  );

DROP POLICY IF EXISTS units_contractor_linked ON units;
CREATE POLICY units_contractor_linked ON units
  FOR SELECT TO authenticated
  USING (
    current_app_user_role() = 'CONTRACTOR'
    AND EXISTS (
      SELECT 1 FROM maintenance_tickets t
      WHERE t.unit_id = units.id AND t.contractor_id = current_app_user_id()
    )
  );

-- These checks read units from inside a buildings/viewing_slots policy.
-- Inlining the EXISTS applies units RLS, and units_landlord_read reads buildings,
-- which Postgres rejects as infinite recursion. SECURITY DEFINER bypasses RLS
-- for the lookup only. Callers still need EXECUTE.
CREATE OR REPLACE FUNCTION public.building_has_public_listing(p_building_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM units u
    WHERE u.building_id = p_building_id
      AND u.status_config_key IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE')
      AND lower(coalesce(u.listing_type, '')) <> 'not_listed'
  );
$$;

CREATE OR REPLACE FUNCTION public.viewing_slot_on_public_listing(p_slot_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM viewing_slots vs
    JOIN units u ON u.id = vs.unit_id
    WHERE vs.id = p_slot_id
      AND u.status_config_key IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE')
      AND lower(coalesce(u.listing_type, '')) <> 'not_listed'
  );
$$;

-- Policies call these as the signed-in user, so authenticated keeps EXECUTE.
-- anon and service_role do not. REVOKE FROM PUBLIC alone leaves the default-privilege grants.
REVOKE ALL ON FUNCTION public.building_has_public_listing(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.viewing_slot_on_public_listing(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.building_has_public_listing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.viewing_slot_on_public_listing(uuid) TO authenticated;

DROP POLICY IF EXISTS buildings_public_read ON buildings;
CREATE POLICY buildings_public_read ON buildings
  FOR SELECT TO authenticated
  USING (public.building_has_public_listing(id));

DROP POLICY IF EXISTS viewing_slots_public_read ON viewing_slots;
CREATE POLICY viewing_slots_public_read ON viewing_slots
  FOR SELECT TO authenticated
  USING (public.viewing_slot_on_public_listing(id));

DROP POLICY IF EXISTS applications_insert_applicant ON applications;
CREATE POLICY applications_insert_applicant ON applications
  FOR INSERT TO authenticated
  WITH CHECK (applicant_id = current_app_user_id());

DROP POLICY IF EXISTS applications_update_applicant ON applications;
CREATE POLICY applications_update_applicant ON applications
  FOR UPDATE TO authenticated
  USING (applicant_id = current_app_user_id())
  WITH CHECK (
    applicant_id = current_app_user_id()
    AND status NOT IN ('APPROVED', 'LEASED')
  );

DROP POLICY IF EXISTS messages_insert_own ON messages;
CREATE POLICY messages_insert_own ON messages
  FOR INSERT TO authenticated
  WITH CHECK (from_user_id = current_app_user_id());

-- ---------------------------------------------------------------------------
-- Public marketplace RPCs: explicit column allow-list. Never to_jsonb a row.
-- ---------------------------------------------------------------------------

-- Stable landlord key for the guest mapper. Email, phone, and password_hash stay
-- out. verification.status is copied with -> only when that key is stored.
-- A missing status is omitted. It is not filled in as 'approved' (the listing
-- filter still treats a missing status as approved for inclusion only).
CREATE OR REPLACE FUNCTION public.marketplace_user_json(u users)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'landlord_id', u.id,
    'display_name', trim(concat_ws(' ', u.first_name, u.last_name)),
    'client_id', u.client_id,
    'role', u.role,
    'active', u.active,
    'metadata', CASE
      WHEN jsonb_typeof(u.metadata->'verification') = 'object'
           AND (u.metadata->'verification') ? 'status'
           AND jsonb_typeof(u.metadata->'verification'->'status') <> 'null'
      THEN jsonb_build_object(
        'verification', jsonb_build_object(
          'status', u.metadata->'verification'->'status'
        )
      )
    END
  ));
$$;

CREATE OR REPLACE FUNCTION public.marketplace_building_json(b buildings, p_cover_only boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', b.id,
    'client_id', b.client_id,
    'landlord_id', b.landlord_id,
    'name', b.name,
    'address', b.address,
    'suburb', b.suburb,
    'city', b.city,
    'province', b.province,
    'grading', b.grading,
    'solar_capacity_kw', b.solar_capacity_kw,
    'has_borehole', b.has_borehole,
    'lat', b.lat,
    'lng', b.lng,
    'place_id', b.place_id,
    'formatted_address', b.formatted_address,
    'geocoded_at', b.geocoded_at,
    'images', CASE
      WHEN p_cover_only THEN jsonb_build_array(b.images -> 0)
      ELSE COALESCE(b.images, '[]'::jsonb)
    END,
    'created_at', b.created_at
  );
$$;

CREATE OR REPLACE FUNCTION public.marketplace_unit_json(u units, p_images jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', u.id,
    'client_id', u.client_id,
    'building_id', u.building_id,
    'agent_id', u.agent_id,
    'unit_number', u.unit_number,
    'title', u.title,
    'square_meters', u.square_meters,
    'bedrooms', u.bedrooms,
    'bathrooms', u.bathrooms,
    'parking', u.parking,
    'listing_type', u.listing_type,
    'price', u.price,
    'rent', u.rent,
    'status_config_key', u.status_config_key,
    'description', u.description,
    'amenities', COALESCE(u.amenities, '[]'::jsonb),
    'images', COALESCE(p_images, '[]'::jsonb),
    'featured', u.featured,
    'lat', u.lat,
    'lng', u.lng,
    'place_id', u.place_id,
    'formatted_address', u.formatted_address,
    'geocoded_at', u.geocoded_at,
    'created_at', u.created_at
  );
$$;

CREATE OR REPLACE FUNCTION public.marketplace_room_json(r rooms)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'unit_id', r.unit_id,
    'name', r.name,
    'beds', r.beds,
    'baths', r.baths,
    'area_sqm', r.area_sqm,
    'room_kind', r.room_kind
  );
$$;

CREATE OR REPLACE FUNCTION public.marketplace_entity_json(m entity_id_map)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'entity_type', m.entity_type,
    'backend_id', m.backend_id,
    'frontend_id', m.frontend_id
  );
$$;

CREATE OR REPLACE FUNCTION public.marketplace_client_json(c clients)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'company_name', c.company_name,
    'subdomain', c.subdomain,
    'status', c.status,
    'city', c.city,
    'created_at', c.created_at,
    -- -> keeps JSON booleans. ->> would turn false into the string 'false',
    -- which the guest mapper treats as truthy and then drops the agency.
    'settings', jsonb_strip_nulls(jsonb_build_object(
      'frontend_id', c.settings->'frontend_id',
      'isGlobalConfigClient', c.settings->'isGlobalConfigClient'
    ))
  );
$$;

-- Internal projections. Supabase default privileges grant EXECUTE to anon,
-- authenticated, and service_role, so REVOKE FROM PUBLIC is not enough.
REVOKE ALL ON FUNCTION public.marketplace_user_json(users) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.marketplace_client_json(clients) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.marketplace_building_json(buildings, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.marketplace_unit_json(units, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.marketplace_room_json(rooms) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.marketplace_entity_json(entity_id_map) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION get_public_marketplace_bootstrap(p_lite boolean DEFAULT true)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH lim AS (
    SELECT CASE WHEN p_lite THEN 60 ELSE 250 END AS n
  ),
  public_units AS (
    SELECT u.*
    FROM units u
    JOIN buildings b ON b.id = u.building_id
    LEFT JOIN users ll ON ll.id = b.landlord_id
    WHERE u.status_config_key IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE')
      AND lower(coalesce(u.listing_type, 'rent')) <> 'not_listed'
      AND coalesce(ll.metadata->'verification'->>'status', 'approved') NOT IN ('pending', 'rejected')
    ORDER BY u.featured DESC NULLS LAST, u.created_at DESC, u.id DESC
    LIMIT (SELECT n FROM lim)
  ),
  unit_buildings AS (
    SELECT DISTINCT b.*
    FROM buildings b
    JOIN public_units pu ON pu.building_id = b.id
  ),
  unit_clients AS (
    SELECT DISTINCT c.*
    FROM clients c
    JOIN public_units pu ON pu.client_id = c.id
    WHERE coalesce(c.settings->>'isGlobalConfigClient', 'false') <> 'true'
  ),
  unit_landlords AS (
    SELECT DISTINCT ll.*
    FROM users ll
    JOIN unit_buildings ub ON ub.landlord_id = ll.id
  ),
  unit_rooms AS (
    SELECT r.*
    FROM rooms r
    JOIN public_units pu ON pu.id = r.unit_id
  )
  SELECT jsonb_build_object(
    'clients', coalesce((SELECT jsonb_agg(marketplace_client_json(c) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(marketplace_building_json(b, false) ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(marketplace_unit_json(u, u.images) ORDER BY u.created_at DESC) FROM public_units u), '[]'::jsonb),
    'rooms', coalesce((SELECT jsonb_agg(marketplace_room_json(r) ORDER BY r.name) FROM unit_rooms r), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(marketplace_user_json(u) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
    'entity_id_map', coalesce(
      (SELECT jsonb_agg(marketplace_entity_json(m) ORDER BY m.entity_type, m.frontend_id)
       FROM entity_id_map m
       WHERE (m.entity_type = 'unit' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'property' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'building' AND m.backend_id IN (SELECT id FROM unit_buildings))
          OR (m.entity_type = 'agency' AND m.backend_id IN (SELECT id FROM unit_clients))
          OR (m.entity_type = 'user' AND m.backend_id IN (SELECT id FROM unit_landlords))),
      '[]'::jsonb
    )
  );
$$;

CREATE OR REPLACE FUNCTION get_public_marketplace_bootstrap_lite(p_lite boolean DEFAULT true)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH lim AS (
    SELECT CASE WHEN p_lite THEN 60 ELSE 250 END AS n
  ),
  public_units AS (
    SELECT u.*
    FROM units u
    JOIN buildings b ON b.id = u.building_id
    LEFT JOIN users ll ON ll.id = b.landlord_id
    WHERE u.status_config_key IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE')
      AND lower(coalesce(u.listing_type, 'rent')) <> 'not_listed'
      AND coalesce(ll.metadata->'verification'->>'status', 'approved') NOT IN ('pending', 'rejected')
    ORDER BY u.featured DESC NULLS LAST, u.created_at DESC, u.id DESC
    LIMIT (SELECT n FROM lim)
  ),
  unit_buildings AS (
    SELECT DISTINCT b.*
    FROM buildings b
    JOIN public_units pu ON pu.building_id = b.id
  ),
  unit_clients AS (
    SELECT DISTINCT c.*
    FROM clients c
    JOIN public_units pu ON pu.client_id = c.id
    WHERE coalesce(c.settings->>'isGlobalConfigClient', 'false') <> 'true'
  ),
  unit_landlords AS (
    SELECT DISTINCT ll.*
    FROM users ll
    JOIN unit_buildings ub ON ub.landlord_id = ll.id
  ),
  unit_cover AS (
    SELECT pu.id,
           coalesce(pu.images->0, b.images->0) AS cover
    FROM public_units pu
    JOIN buildings b ON b.id = pu.building_id
  )
  SELECT jsonb_build_object(
    'clients', coalesce((SELECT jsonb_agg(marketplace_client_json(c) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(marketplace_building_json(b, true) ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(
        marketplace_unit_json(
          u,
          CASE WHEN uc.cover IS NOT NULL THEN jsonb_build_array(uc.cover) ELSE '[]'::jsonb END
        )
        ORDER BY u.created_at DESC)
      FROM public_units u JOIN unit_cover uc ON uc.id = u.id), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(marketplace_user_json(u) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
    'entity_id_map', coalesce(
      (SELECT jsonb_agg(marketplace_entity_json(m) ORDER BY m.entity_type, m.frontend_id)
       FROM entity_id_map m
       WHERE (m.entity_type = 'unit' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'property' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'building' AND m.backend_id IN (SELECT id FROM unit_buildings))
          OR (m.entity_type = 'agency' AND m.backend_id IN (SELECT id FROM unit_clients))
          OR (m.entity_type = 'user' AND m.backend_id IN (SELECT id FROM unit_landlords))),
      '[]'::jsonb
    )
  );
$$;

-- Same signature and grants as 011a. Do not revoke anon/authenticated here:
-- CREATE OR REPLACE keeps the privileges 011a left, including the service_role
-- grant that Supabase default privileges add and 011a does not remove.
REVOKE ALL ON FUNCTION get_public_marketplace_bootstrap(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_marketplace_bootstrap(boolean) TO anon, authenticated;
REVOKE ALL ON FUNCTION get_public_marketplace_bootstrap_lite(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_marketplace_bootstrap_lite(boolean) TO anon, authenticated;
