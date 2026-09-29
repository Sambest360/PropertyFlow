-- Idempotent application-received email log and the non-owner API role.
-- Apply with:
--   psql "$DIRECT_URL" -f database/postgres/migrations/015_api_application_emails.sql
--
-- The invites table is owned by migration 012 (account takeover). This file
-- does not create or alter it.
--
-- propertyflow_api is a non-owner login for the Hono pooler connection.
-- Set the password out of band (never commit it):
--   ALTER ROLE propertyflow_api WITH LOGIN PASSWORD '...';
-- DATABASE_URL username is propertyflow_api.<project-ref>, not postgres.

CREATE TABLE IF NOT EXISTS application_email_sends (
  application_id   UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL,
  recipient_email  TEXT NOT NULL,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (application_id, kind)
);

ALTER TABLE application_email_sends ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'propertyflow_api') THEN
    CREATE ROLE propertyflow_api
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  ELSE
    ALTER ROLE propertyflow_api NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  END IF;
END $$;

GRANT USAGE, CREATE ON SCHEMA public TO propertyflow_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO propertyflow_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO propertyflow_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO propertyflow_api;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.application_email_sends FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.application_email_sends FROM authenticated';
  END IF;
END $$;
