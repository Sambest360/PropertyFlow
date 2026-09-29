-- 015 rollback. Drops the application email log and the API role.
-- Does not touch invites (owned by migration 012).
-- Run as the same role that applied 015 so default privileges can be revoked.

BEGIN;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM propertyflow_api;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM propertyflow_api;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM propertyflow_api;
REVOKE ALL ON SCHEMA public FROM propertyflow_api;

DO $$
BEGIN
  EXECUTE format(
    'REVOKE ALL PRIVILEGES ON DATABASE %I FROM propertyflow_api',
    current_database()
  );
END $$;

DROP TABLE IF EXISTS public.application_email_sends;

DROP ROLE IF EXISTS propertyflow_api;

COMMIT;
