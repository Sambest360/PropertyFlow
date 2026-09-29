import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * Auth-to-profile takeover tests against a local Postgres cluster.
 * Does not read DATABASE_URL and does not connect to hosted Supabase.
 *
 * Requires peer-authenticated `psql` and a local server. The database
 * `propertyflow_auth_link` is dropped and recreated.
 */
const DB = 'propertyflow_auth_link'
const ROOT = '/workspace'

function psql(database: string, sql: string): string {
  return execFileSync(
    'psql',
    ['-v', 'ON_ERROR_STOP=1', '-d', database, '-f', '-'],
    { encoding: 'utf8', input: sql, cwd: ROOT },
  )
}

function psqlFile(database: string, file: string): string {
  return execFileSync(
    'psql',
    ['-v', 'ON_ERROR_STOP=1', '-d', database, '-f', file],
    { encoding: 'utf8', cwd: ROOT },
  )
}

const AUTH_STUB = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    CASE
      WHEN NULLIF(current_setting('request.jwt.claims', true), '') IS NULL THEN NULL
      ELSE (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    END
  )::uuid
$$;
CREATE TABLE auth.users (
  instance_id uuid,
  id uuid PRIMARY KEY,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  confirmation_token varchar(255) NOT NULL DEFAULT '',
  recovery_token varchar(255) NOT NULL DEFAULT '',
  email_change_token_new varchar(255) NOT NULL DEFAULT '',
  email_change varchar(255) NOT NULL DEFAULT '',
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_sso_user boolean NOT NULL DEFAULT false,
  created_at timestamptz,
  updated_at timestamptz
);
-- Same shape as GoTrue: unique on email, case-sensitive, non-SSO only.
CREATE UNIQUE INDEX users_email_partial_key ON auth.users (email) WHERE is_sso_user = false;
`

function rebuildDatabase(): void {
  psql(
    'postgres',
    `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
      END IF;
    END $$;
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '${DB}' AND pid <> pg_backend_pid();
    `,
  )
  psql('postgres', `DROP DATABASE IF EXISTS ${DB};`)
  psql('postgres', `CREATE DATABASE ${DB};`)
  psql(DB, AUTH_STUB)
  psqlFile(DB, 'database/postgres/schema.sql')
  for (const file of [
    'database/postgres/migrations/002_supabase_auth.sql',
    'database/postgres/migrations/004_ensure_user_profile.sql',
    'database/postgres/migrations/009_fix_auth_user_profile_sync.sql',
    'database/postgres/migrations/012_auth_link_hardening.sql',
  ]) {
    psqlFile(DB, file)
  }
}

describe('auth link hardening (local postgres)', () => {
  it('closes email re-link takeover, consumes invites once, and never grants super admin', () => {
    rebuildDatabase()
    const verify = psqlFile(DB, 'database/postgres/migrations/012_auth_link_hardening_verify.sql')
    expect(verify).toContain('ROLLBACK')

    psqlFile(DB, 'database/postgres/migrations/012_auth_link_hardening.sql')
    psqlFile(DB, 'database/postgres/migrations/012_auth_link_hardening_verify.sql')

    psqlFile(DB, 'database/postgres/migrations/012_auth_link_hardening_rollback.sql')
    const reopened = psql(
      DB,
      `
      BEGIN;
      INSERT INTO public.clients (id, company_name, subdomain, status)
      VALUES ('a1111111-1111-4111-8111-111111111111', 'Agency A', 'agency-a', 'active');
      INSERT INTO public.users (email, password_hash, first_name, last_name, role, client_id, auth_user_id)
      VALUES (
        'victim-rollback@example.com', 'legacy-hash', 'Vera', 'Victim',
        'AGENCY_ADMIN', 'a1111111-1111-4111-8111-111111111111', NULL
      );
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, confirmation_token, recovery_token,
        email_change_token_new, email_change,
        raw_app_meta_data, raw_user_meta_data, is_sso_user, created_at, updated_at
      ) VALUES (
        'abababab-abab-4bab-8bab-abababababab',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        'victim-rollback@example.com', 'attacker-hash',
        NULL, '', '', '', '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"first_name":"Adam","last_name":"Attacker"}'::jsonb,
        false, NOW(), NOW()
      );
      DO $$
      DECLARE
        v_auth UUID;
        v_role TEXT;
      BEGIN
        SELECT auth_user_id, role INTO v_auth, v_role
        FROM public.users WHERE email = 'victim-rollback@example.com';
        IF v_auth IS DISTINCT FROM 'abababab-abab-4bab-8bab-abababababab' OR v_role IS DISTINCT FROM 'AGENCY_ADMIN' THEN
          RAISE EXCEPTION 'rollback did not restore email re-link (auth=% role=%)', v_auth, v_role;
        END IF;
      END $$;
      ROLLBACK;
      `,
    )
    expect(reopened).toContain('ROLLBACK')

    psqlFile(DB, 'database/postgres/migrations/012_auth_link_hardening.sql')
    psqlFile(DB, 'database/postgres/migrations/012_auth_link_hardening_verify.sql')
  }, 120_000)
})
