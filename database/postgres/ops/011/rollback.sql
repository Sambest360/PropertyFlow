-- Restore the post-011a catalog. 011a stays applied.
-- Steps marked ASSUMES-REPO overwrite objects with the definitions in this
-- file (migrations 001-010 and 011a). They match a database only when that
-- catalog still matches those files.
--
--   users policies and table grants: 002_supabase_auth.sql
--   tenant SELECT policies: 003_rls_bootstrap.sql
--   marketplace RPCs: 011a_public_rpc_stopgap.sql (not 007/008)
--
-- Run once after a committed 011, via rollback.sh (one transaction, ON_ERROR_STOP).
-- Safe to run a second time: new 011 objects are dropped if present, and the
-- restored objects are created with DROP/CREATE OR REPLACE.
-- This does not restore a hand-edited production catalog.

-- ---------------------------------------------------------------------------
-- Objects 011c added. Dropping them does not assume the hosted catalog.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS entity_id_map_guard ON entity_id_map;
DROP FUNCTION IF EXISTS public.entity_id_map_guard();
DROP POLICY IF EXISTS entity_id_map_staff_write ON entity_id_map;
DROP TABLE IF EXISTS application_screening;
DROP TABLE IF EXISTS public_enquiry_hits;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','bookings','payments','invoices','applications','leases','documents']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_staff_write ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_mutate ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_mutate ON %I FOR ALL TO authenticated
       USING (is_super_admin() OR client_id = current_app_client_id())
       WITH CHECK (is_super_admin() OR client_id = current_app_client_id())',
      t, t
    );
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'trust_transactions','trust_allocations','payout_instructions',
    'deposit_holdings','arrears_snapshots','csv_import_batches'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS trust_staff_%1$s ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS trust_read_%1$s ON %1$I', t);
    EXECUTE format(
      'CREATE POLICY trust_read_%1$s ON %1$I FOR SELECT TO authenticated USING (true)',
      t
    );
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'users', 'clients',
    'buildings', 'units', 'rooms', 'internal_assets', 'leads', 'applications',
    'leases', 'bookings', 'viewing_slots', 'payments', 'documents',
    'maintenance_tickets', 'message_threads', 'messages', 'notifications',
    'suite_alerts', 'client_lookup_configs', 'client_subscriptions', 'invoices',
    'event_log', 'entity_id_map'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

ALTER VIEW v_unit_summary RESET (security_invoker);
ALTER VIEW v_unit_search_cards RESET (security_invoker);
ALTER VIEW v_ticket_kanban RESET (security_invoker);
ALTER VIEW v_application_pipeline RESET (security_invoker);
ALTER VIEW v_billing_usage RESET (security_invoker);

DROP POLICY IF EXISTS entity_id_map_select ON entity_id_map;
CREATE POLICY entity_id_map_select ON entity_id_map
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS entity_id_map_mutate ON entity_id_map;
CREATE POLICY entity_id_map_mutate ON entity_id_map
  FOR ALL TO authenticated
  USING (is_super_admin() OR is_agency_staff())
  WITH CHECK (is_super_admin() OR is_agency_staff());

ALTER TABLE entity_id_map DROP COLUMN IF EXISTS client_id;

-- ---------------------------------------------------------------------------
-- Policies 011 added. Dropping them does not assume the hosted catalog.
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
-- ASSUMES-REPO: users_insert_admin and users_select_self_agency are recreated
-- from 002_supabase_auth.sql. A dashboard edit of either policy is overwritten.
-- Dropping the 011 trigger does not assume the hosted catalog.
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

-- ASSUMES-REPO: 002 granted SELECT on the whole users table to authenticated.
-- This puts that grant back. It does not restore a narrower column grant that
-- production may have added by hand.
REVOKE SELECT (
  id, auth_user_id, client_id, email, first_name, last_name, phone, role, active,
  avatar_url, metadata, created_at, updated_at
) ON TABLE public.users FROM authenticated;
GRANT SELECT ON TABLE public.users TO authenticated;

-- ---------------------------------------------------------------------------
-- ASSUMES-REPO: wide SELECT policies from 003_rls_bootstrap.sql, including
-- event_log_select below. Any hosted edit of these policies is overwritten.
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
-- ASSUMES-REPO: marketplace RPCs are recreated from 011a_public_rpc_stopgap.sql.
-- Same signatures as 011 (boolean -> jsonb). A hosted edit of 011a is overwritten.
-- The 008 lite bug (property ids joined to buildings) is still in 011a. Keep it.
-- Helpers exist only after 011. Replace the RPCs first so DROP FUNCTION is safe.
-- ---------------------------------------------------------------------------

-- Restored from 011a_public_rpc_stopgap.sql (post-011a, not 007/008).
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
    'clients', coalesce((SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'company_name', c.company_name,
          'subdomain', c.subdomain,
          'status', c.status,
          'city', c.city,
          'created_at', c.created_at,
          'settings', jsonb_strip_nulls(jsonb_build_object(
            'frontend_id', c.settings->'frontend_id',
            'isGlobalConfigClient', c.settings->'isGlobalConfigClient'
          ))
        ) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(to_jsonb(b) - 'notes' ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.created_at DESC) FROM public_units u), '[]'::jsonb),
    'rooms', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name) FROM unit_rooms r), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'client_id', u.client_id,
          'email', u.email,
          'first_name', u.first_name,
          'last_name', u.last_name,
          'role', u.role,
          'active', u.active,
          'metadata', jsonb_strip_nulls(jsonb_build_object(
            'frontend_id', u.metadata->'frontend_id',
            'frontend_role', u.metadata->'frontend_role',
            'verification', CASE WHEN jsonb_typeof(u.metadata->'verification') = 'object'
              THEN jsonb_build_object('status', u.metadata->'verification'->'status') END
          ))
        ) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
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
    'clients', coalesce((SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'company_name', c.company_name,
          'subdomain', c.subdomain,
          'status', c.status,
          'city', c.city,
          'created_at', c.created_at,
          'settings', jsonb_strip_nulls(jsonb_build_object(
            'frontend_id', c.settings->'frontend_id',
            'isGlobalConfigClient', c.settings->'isGlobalConfigClient'
          ))
        ) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(
        (to_jsonb(b) - 'images' - 'notes')
        || jsonb_build_object('images', jsonb_build_array(b.images->0))
        ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(
        (to_jsonb(u) - 'images')
        || jsonb_build_object('images', CASE WHEN uc.cover IS NOT NULL THEN jsonb_build_array(uc.cover) ELSE '[]'::jsonb END)
        ORDER BY u.created_at DESC)
      FROM public_units u JOIN unit_cover uc ON uc.id = u.id), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'client_id', u.client_id,
          'email', u.email,
          'first_name', u.first_name,
          'last_name', u.last_name,
          'role', u.role,
          'active', u.active,
          'metadata', jsonb_strip_nulls(jsonb_build_object(
            'frontend_id', u.metadata->'frontend_id',
            'frontend_role', u.metadata->'frontend_role',
            'verification', CASE WHEN jsonb_typeof(u.metadata->'verification') = 'object'
              THEN jsonb_build_object('status', u.metadata->'verification'->'status') END
          ))
        ) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
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

REVOKE ALL ON FUNCTION get_public_marketplace_bootstrap(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_marketplace_bootstrap(boolean) TO anon, authenticated;
REVOKE ALL ON FUNCTION get_public_marketplace_bootstrap_lite(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_marketplace_bootstrap_lite(boolean) TO anon, authenticated;

-- Dropping helpers that exist only after 011. This does not assume the hosted catalog.
DROP FUNCTION IF EXISTS public.marketplace_user_json(users);
DROP FUNCTION IF EXISTS public.marketplace_client_json(clients);
DROP FUNCTION IF EXISTS public.marketplace_building_json(buildings, boolean);
DROP FUNCTION IF EXISTS public.marketplace_unit_json(units, jsonb);
DROP FUNCTION IF EXISTS public.marketplace_room_json(rooms);
DROP FUNCTION IF EXISTS public.marketplace_entity_json(entity_id_map);
DROP FUNCTION IF EXISTS public.users_count_unscoped();
DROP FUNCTION IF EXISTS public.building_has_public_listing(uuid);
DROP FUNCTION IF EXISTS public.viewing_slot_on_public_listing(uuid);

-- 011c replaced the enquiry RPC and the profile sync. Put the 005 and 009
-- bodies back. 009 still contains the email re-link; that fix is migration 012.
\ir ../../migrations/005_public_listing_enquiry.sql
\ir ../../migrations/009_fix_auth_user_profile_sync.sql

GRANT ALL ON FUNCTION public.admin_update_user_verification(text, text, text) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.approve_application(text, jsonb) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.sync_auth_user_profile(uuid) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.handle_new_auth_user() TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.ensure_user_profile() TO anon, authenticated, service_role;
