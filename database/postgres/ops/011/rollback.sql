-- Restore the pre-011 policies, functions, triggers, and grants.
-- Definitions are the ones left by migrations 001-010 (latest writer wins):
--   users policies and table grants: 002_supabase_auth.sql
--   tenant SELECT policies: 003_rls_bootstrap.sql
--   get_public_marketplace_bootstrap: 007_public_marketplace_rooms.sql
--   get_public_marketplace_bootstrap_lite: 008_public_marketplace_lite.sql
--
-- Run once after a committed 011, via rollback.sh (one transaction, ON_ERROR_STOP).
-- Safe to run a second time: new 011 objects are dropped if present, and the
-- restored objects are created with DROP/CREATE OR REPLACE.
-- This does not restore a hand-edited production catalog. It restores the repo.

-- ---------------------------------------------------------------------------
-- Policies 011 added
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS users_select_portfolio ON users;
DROP POLICY IF EXISTS notifications_own_select ON notifications;
DROP POLICY IF EXISTS payments_party_select ON payments;
DROP POLICY IF EXISTS bookings_applicant_select ON bookings;
DROP POLICY IF EXISTS documents_own_select ON documents;
DROP POLICY IF EXISTS threads_participant_select ON message_threads;
DROP POLICY IF EXISTS messages_participant_select ON messages;
DROP POLICY IF EXISTS units_public_read ON units;
DROP POLICY IF EXISTS units_tenant_linked ON units;
DROP POLICY IF EXISTS units_contractor_linked ON units;
DROP POLICY IF EXISTS buildings_public_read ON buildings;
DROP POLICY IF EXISTS viewing_slots_public_read ON viewing_slots;
DROP POLICY IF EXISTS applications_insert_applicant ON applications;
DROP POLICY IF EXISTS applications_update_applicant ON applications;
DROP POLICY IF EXISTS messages_insert_own ON messages;

-- ---------------------------------------------------------------------------
-- users policies and trigger from 002 (011 replaced insert, dropped self-agency)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS users_insert_admin ON users;
CREATE POLICY users_insert_admin ON users
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR is_agency_staff());

DROP POLICY IF EXISTS users_select_self_agency ON users;
CREATE POLICY users_select_self_agency ON users
  FOR SELECT TO authenticated
  USING (
    client_id IS NOT NULL
    AND client_id = current_app_client_id()
  );

DROP TRIGGER IF EXISTS protect_user_privileged_columns ON users;
DROP FUNCTION IF EXISTS public.protect_user_privileged_columns();

-- Column privileges 011 added, then the table SELECT 002 granted.
REVOKE SELECT (
  id, auth_user_id, client_id, email, first_name, last_name, phone, role, active,
  avatar_url, metadata, created_at, updated_at
) ON TABLE public.users FROM authenticated;
GRANT SELECT ON TABLE public.users TO authenticated;

-- ---------------------------------------------------------------------------
-- Wide SELECT policies from 003_rls_bootstrap.sql
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'buildings', 'units', 'rooms', 'internal_assets', 'leads', 'applications',
    'leases', 'bookings', 'viewing_slots', 'payments', 'documents',
    'maintenance_tickets', 'message_threads', 'messages', 'notifications',
    'suite_alerts', 'client_lookup_configs', 'client_subscriptions', 'invoices'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_select ON %I FOR SELECT TO authenticated
       USING (is_super_admin() OR client_id = current_app_client_id()
              OR current_app_user_role() IN (''LANDLORD'', ''END_USER'', ''CONTRACTOR''))',
      tbl, tbl
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS event_log_select ON event_log;
CREATE POLICY event_log_select ON event_log
  FOR SELECT TO authenticated
  USING (is_super_admin() OR client_id = current_app_client_id()
         OR current_app_user_role() IN ('LANDLORD', 'END_USER', 'CONTRACTOR'));

-- ---------------------------------------------------------------------------
-- Marketplace RPCs as of 007 and 008. Helpers exist only after 011.
-- Replace the RPCs first so DROP FUNCTION is not blocked by a dependency.
-- ---------------------------------------------------------------------------

-- Restored verbatim from 007_public_marketplace_rooms.sql
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
    'clients', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.created_at DESC) FROM public_units u), '[]'::jsonb),
    'rooms', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name) FROM unit_rooms r), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
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

-- Restored verbatim from 008_public_marketplace_lite.sql
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
    WHERE u.status_config_key IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER')
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
    JOIN unit_buildings b ON b.id = pu.building_id
  )
  SELECT jsonb_build_object(
    'clients', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(
        (to_jsonb(b) - 'images')
        || jsonb_build_object('images', jsonb_build_array(b.images->0))
        ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(
        (to_jsonb(u) - 'images')
        || jsonb_build_object('images', CASE WHEN uc.cover IS NOT NULL THEN jsonb_build_array(uc.cover) ELSE '[]'::jsonb END)
        ORDER BY u.created_at DESC)
      FROM public_units u JOIN unit_cover uc ON uc.id = u.id), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
    'entity_id_map', coalesce(
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.entity_type, m.frontend_id)
       FROM entity_id_map m
       WHERE (m.entity_type = 'unit' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'property' AND m.backend_id IN (SELECT id FROM unit_buildings))
          OR (m.entity_type = 'building' AND m.backend_id IN (SELECT id FROM unit_buildings))
          OR (m.entity_type = 'agency' AND m.backend_id IN (SELECT id FROM unit_clients))
          OR (m.entity_type = 'user' AND m.backend_id IN (SELECT id FROM unit_landlords))),
      '[]'::jsonb
    )
  );
$$;

REVOKE ALL ON FUNCTION get_public_marketplace_bootstrap_lite(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_marketplace_bootstrap_lite(boolean) TO anon, authenticated;


DROP FUNCTION IF EXISTS public.marketplace_user_json(users);
DROP FUNCTION IF EXISTS public.marketplace_client_json(clients);
DROP FUNCTION IF EXISTS public.building_has_public_listing(uuid);
DROP FUNCTION IF EXISTS public.viewing_slot_on_public_listing(uuid);
