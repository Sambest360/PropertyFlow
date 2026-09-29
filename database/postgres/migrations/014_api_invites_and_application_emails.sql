-- API invites + idempotent application-received email log.
-- Apply with:
--   psql "$DIRECT_URL" -f database/postgres/migrations/014_api_invites_and_application_emails.sql
--
-- Migration 012 (account takeover) is owned by another stream and is not on
-- this branch. The invites table below is the smallest shape 012 should consume:
--   * pending row created by staff of agency_id (clients.id)
--   * auth_user_id is the GoTrue user id from the service-role invite
--   * token is an alternate redeem key (012 may match either)
--   * role is the frontend role; super_admin is never inserted by the API
--   * consume once: status = 'consumed', consumed_at = now()
-- 012 must not re-link public.users by email match. Link only when
-- email_confirmed_at is not null AND this pending invite matches that auth
-- user id or the redeemed token.
--
-- propertyflow_api is a non-owner login for the Hono pooler connection.
-- Set the password out of band (never commit it):
--   ALTER ROLE propertyflow_api WITH LOGIN PASSWORD '...';
-- DATABASE_URL username is propertyflow_api.<project-ref>, not postgres.

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_key ON users (auth_user_id);

CREATE TABLE IF NOT EXISTS invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(190) NOT NULL,
  role          VARCHAR(40) NOT NULL,
  agency_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  auth_user_id  UUID,
  token         TEXT UNIQUE,
  invited_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'consumed', 'revoked')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at   TIMESTAMPTZ,
  CONSTRAINT invites_pending_has_identity CHECK (
    status <> 'pending' OR auth_user_id IS NOT NULL OR token IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS invites_one_pending_email_agency
  ON invites (lower(email), agency_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS invites_pending_auth_user
  ON invites (auth_user_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS application_email_sends (
  application_id   UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL,
  recipient_email  TEXT NOT NULL,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (application_id, kind)
);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
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
    EXECUTE 'REVOKE ALL ON TABLE public.invites FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.application_email_sends FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.invites FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.application_email_sends FROM authenticated';
  END IF;
END $$;
