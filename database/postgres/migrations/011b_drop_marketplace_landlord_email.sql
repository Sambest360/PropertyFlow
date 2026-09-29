-- 011b: drop landlord email from the public marketplace user projection.
--
-- Apply only together with the frontend that keys guest landlords on
-- landlord_id and landlord_name (src/lib/supabase/mapGuestMarketplace.ts).
-- 011 keeps email so the current mapper still works. This file does not
-- change policies, triggers, or the other marketplace columns.
--
-- Same function signature as 011. Safe to run more than once.
-- Run after 011_tenant_isolation.sql. Do not run it before 011.

BEGIN;

CREATE OR REPLACE FUNCTION public.marketplace_user_json(u users)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', u.id,
    'landlord_id', u.id,
    'landlord_name', trim(concat_ws(' ', u.first_name, u.last_name)),
    'client_id', u.client_id,
    'first_name', u.first_name,
    'last_name', u.last_name,
    'role', u.role,
    'active', u.active,
    'metadata', NULLIF(jsonb_strip_nulls(jsonb_build_object(
      'frontend_id', CASE
        WHEN u.metadata ? 'frontend_id'
             AND jsonb_typeof(u.metadata->'frontend_id') <> 'null'
        THEN u.metadata->'frontend_id'
      END,
      'frontend_role', CASE
        WHEN u.metadata ? 'frontend_role'
             AND jsonb_typeof(u.metadata->'frontend_role') <> 'null'
        THEN u.metadata->'frontend_role'
      END,
      'verification', CASE
        WHEN jsonb_typeof(u.metadata->'verification') = 'object'
             AND (u.metadata->'verification') ? 'status'
             AND jsonb_typeof(u.metadata->'verification'->'status') <> 'null'
        THEN jsonb_build_object('status', u.metadata->'verification'->'status')
      END
    )), '{}'::jsonb)
  ));
$$;

REVOKE ALL ON FUNCTION public.marketplace_user_json(users) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
