-- Tenant isolation and privilege hardening.
-- Apply with database/postgres/ops/011/apply.sh (single transaction, fail-fast locks).
-- Do not run this file on its own against production.
-- This file is not run by `npm run db:migrate` (that script only applies 001).
--
-- Fixes:
--   * SELECT policies that let every landlord, tenant, and contractor read every agency's rows
--   * users self-update that could set role = SUPER_ADMIN or frontend_role / permissions
--   * agency staff inserting a SUPER_ADMIN row
--   * password_hash readable by the authenticated role
--   * anon marketplace RPCs returning full user rows (password hashes, ID documents)

-- ---------------------------------------------------------------------------
-- Stop privilege escalation on public.users
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_user_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Direct connections (Hono API, migrations, service role) are not end-user JWTs.
  IF auth.uid() IS NULL AND current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'SUPER_ADMIN'
       AND NOT is_super_admin()
       AND (SELECT COUNT(*) FROM users) > 0 THEN
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
-- including metadata. Staff keep users_select_agency. Landlords keep their own portfolio.
DROP POLICY IF EXISTS users_select_self_agency ON users;
DROP POLICY IF EXISTS users_select_portfolio ON users;
CREATE POLICY users_select_portfolio ON users
  FOR SELECT TO authenticated
  USING (
    current_app_user_role() = 'LANDLORD'
    AND client_id IS NOT NULL
    AND client_id = current_app_client_id()
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
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'buildings', 'units', 'rooms', 'internal_assets', 'leads', 'applications',
    'leases', 'bookings', 'viewing_slots', 'payments', 'documents',
    'maintenance_tickets', 'message_threads', 'messages', 'notifications',
    'suite_alerts', 'client_lookup_configs', 'client_subscriptions', 'invoices',
    'event_log'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;
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

REVOKE ALL ON FUNCTION public.building_has_public_listing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.viewing_slot_on_public_listing(uuid) FROM PUBLIC;
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
-- Public marketplace RPCs: listing fields only. Never password_hash or documents.
-- ---------------------------------------------------------------------------

-- Listing identity only. password_hash, email, and metadata (including a reduced
-- metadata object) are omitted: anon can call this projection through the
-- marketplace RPCs. Guest id mapping still has entity_id_map.
CREATE OR REPLACE FUNCTION public.marketplace_user_json(u users)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', u.id,
    'client_id', u.client_id,
    'first_name', u.first_name,
    'last_name', u.last_name,
    'role', u.role,
    'active', u.active
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
    'settings', jsonb_build_object(
      'frontend_id', c.settings->>'frontend_id',
      'isGlobalConfigClient', c.settings->>'isGlobalConfigClient'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.marketplace_user_json(users) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.marketplace_client_json(clients) FROM PUBLIC;

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
    'buildings', coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.created_at DESC) FROM public_units u), '[]'::jsonb),
    'rooms', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name) FROM unit_rooms r), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(marketplace_user_json(u) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
    'entity_id_map', coalesce(
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.entity_type, m.frontend_id)
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
    'buildings', coalesce((SELECT jsonb_agg(
        (to_jsonb(b) - 'images')
        || jsonb_build_object('images', jsonb_build_array(b.images->0))
        ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(
        (to_jsonb(u) - 'images')
        || jsonb_build_object('images', CASE WHEN uc.cover IS NOT NULL THEN jsonb_build_array(uc.cover) ELSE '[]'::jsonb END)
        ORDER BY u.created_at DESC)
      FROM public_units u JOIN unit_cover uc ON uc.id = u.id), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(marketplace_user_json(u) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
    'entity_id_map', coalesce(
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.entity_type, m.frontend_id)
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

REVOKE ALL ON FUNCTION get_public_marketplace_bootstrap(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_marketplace_bootstrap(boolean) TO anon, authenticated;
REVOKE ALL ON FUNCTION get_public_marketplace_bootstrap_lite(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_marketplace_bootstrap_lite(boolean) TO anon, authenticated;
