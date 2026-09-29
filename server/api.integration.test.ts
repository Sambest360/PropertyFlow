/**
 * Local Postgres + local SMTP catcher.
 * Does not call hosted Supabase, PayFast, or Mailtrap.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { startSmtpCatcher, type CaughtMail } from './test/smtpCatcher.js'
import { signHs256AccessToken } from './test/signAccessToken.js'

const inviteMock = vi.hoisted(() =>
  vi.fn(async () => ({ userId: crypto.randomUUID() })),
)

vi.mock('./supabase/inviteAuthUser.js', () => ({
  inviteAuthUserByEmail: (email: string) => inviteMock(email),
}))

const AGENCY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const AGENCY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
const ADMIN_A = '11111111-1111-4111-8111-111111111111'
const ADMIN_A_AUTH = '22222222-2222-4222-8222-222222222221'
const AGENT_A = '11111111-1111-4111-8111-111111111112'
const AGENT_A_AUTH = '22222222-2222-4222-8222-222222222222'
const LANDLORD_A = '11111111-1111-4111-8111-111111111113'
const LANDLORD_A_AUTH = '22222222-2222-4222-8222-222222222223'
const ADMIN_B = '11111111-1111-4111-8111-111111111114'
const ADMIN_B_AUTH = '22222222-2222-4222-8222-222222222224'
const APPLICANT = '11111111-1111-4111-8111-111111111115'
const APPLICANT_AUTH = '22222222-2222-4222-8222-222222222225'
const BUILDING = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
const UNIT = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
const APPLICANT_EMAIL = 'applicant.onfile@example.com'
const ISS = 'http://127.0.0.1:54321/auth/v1'
const JWT_SECRET = 'integration-jwt-secret-not-a-real-key'
const DB_NAME = 'propertyflow_api_test'
const API_PASSWORD = 'propertyflow_api_local'

/** Until migration 012 lands, tests create the invites table 012 is expected to own. */
const INVITES_FIXTURE = `
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
`

let app: { request: (input: string, init?: RequestInit) => Promise<Response> }
let admin: pg.Client
let catcher: { port: number; messages: CaughtMail[]; stop: () => Promise<void> }

function psql(sql: string) {
  execFileSync('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    stdio: 'pipe',
  })
}

async function bearer(authUserId: string): Promise<Record<string, string>> {
  const exp = Math.floor(Date.now() / 1000) + 600
  const token = await signHs256AccessToken({
    sub: authUserId,
    secret: JWT_SECRET,
    issuer: ISS,
    exp,
  })
  return { Authorization: `Bearer ${token}` }
}

beforeAll(async () => {
  psql(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ubuntu') THEN
      CREATE ROLE ubuntu SUPERUSER LOGIN;
    END IF;
  END $$;`)

  admin = new pg.Client({ host: '/var/run/postgresql', user: 'ubuntu', database: 'postgres' })
  await admin.connect()
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [DB_NAME],
  )
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`)
  await admin.query(`CREATE DATABASE ${DB_NAME} OWNER ubuntu`)
  await admin.end()

  admin = new pg.Client({ host: '/var/run/postgresql', user: 'ubuntu', database: DB_NAME })
  await admin.connect()
  const root = process.cwd()
  await admin.query(readFileSync(resolve(root, 'database/postgres/schema.sql'), 'utf8'))
  await admin.query(
    readFileSync(resolve(root, 'database/postgres/migrations/015_api_application_emails.sql'), 'utf8'),
  )
  await admin.query(
    readFileSync(resolve(root, 'database/postgres/migrations/015_api_application_emails_verify.sql'), 'utf8'),
  )
  await admin.query(INVITES_FIXTURE)
  await admin.query(`ALTER ROLE propertyflow_api WITH LOGIN PASSWORD '${API_PASSWORD}'`)
  await admin.query(`GRANT CONNECT ON DATABASE ${DB_NAME} TO propertyflow_api`)
  await admin.query(
    `INSERT INTO clients (id, company_name, subdomain, status) VALUES
       ($1::uuid, 'Agency A', 'agency-a', 'active'),
       ($2::uuid, 'Agency B', 'agency-b', 'active')`,
    [AGENCY_A, AGENCY_B],
  )
  await admin.query(
    `INSERT INTO users (
       id, auth_user_id, client_id, email, password_hash, first_name, last_name, role, active, metadata
     ) VALUES
       ($1::uuid, $2::uuid, $3::uuid, 'admin-a@example.com', 'x', 'Admin', 'A', 'AGENCY_ADMIN', TRUE, $4::jsonb),
       ($5::uuid, $6::uuid, $3::uuid, 'agent-a@example.com', 'x', 'Agent', 'A', 'GROUND_AGENT', TRUE, $7::jsonb),
       ($8::uuid, $9::uuid, $3::uuid, 'landlord-a@example.com', 'x', 'Landlord', 'A', 'LANDLORD', TRUE, $10::jsonb),
       ($11::uuid, $12::uuid, $13::uuid, 'admin-b@example.com', 'x', 'Admin', 'B', 'AGENCY_ADMIN', TRUE, $14::jsonb),
       ($15::uuid, $16::uuid, $3::uuid, $17, 'x', 'Onfile', 'Applicant', 'END_USER', TRUE, $18::jsonb)`,
    [
      ADMIN_A,
      ADMIN_A_AUTH,
      AGENCY_A,
      JSON.stringify({ frontend_id: ADMIN_A, frontend_role: 'client_admin' }),
      AGENT_A,
      AGENT_A_AUTH,
      JSON.stringify({ frontend_id: AGENT_A, frontend_role: 'ground_agent' }),
      LANDLORD_A,
      LANDLORD_A_AUTH,
      JSON.stringify({ frontend_id: LANDLORD_A, frontend_role: 'landlord' }),
      ADMIN_B,
      ADMIN_B_AUTH,
      AGENCY_B,
      JSON.stringify({ frontend_id: ADMIN_B, frontend_role: 'client_admin' }),
      APPLICANT,
      APPLICANT_AUTH,
      APPLICANT_EMAIL,
      JSON.stringify({ frontend_id: APPLICANT, frontend_role: 'tenant' }),
    ],
  )
  await admin.query(
    `INSERT INTO buildings (id, client_id, name, address, city, province)
     VALUES ($1::uuid, $2::uuid, 'Test House', '1 Main', 'Gqeberha', 'Eastern Cape')`,
    [BUILDING, AGENCY_A],
  )
  await admin.query(
    `INSERT INTO units (id, building_id, client_id, unit_number, title)
     VALUES ($1::uuid, $2::uuid, $3::uuid, '1', 'Harbour Flat')`,
    [UNIT, BUILDING, AGENCY_A],
  )

  catcher = await startSmtpCatcher()
  process.env.PF_SKIP_SERVE = '1'
  process.env.DATABASE_URL = `postgresql://propertyflow_api:${API_PASSWORD}@127.0.0.1:5432/${DB_NAME}`
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET
  process.env.SUPABASE_JWT_ISS = ISS
  process.env.SUPABASE_JWT_AUD = 'authenticated'
  delete process.env.SUPABASE_JWKS_URL
  delete process.env.PF_LOCAL_API_AUTH
  delete process.env.SUPABASE_URL
  delete process.env.MAILTRAP_API_KEY
  process.env.MAILTRAP_TRANSPORT = 'smtp'
  process.env.MAILTRAP_SMTP_HOST = '127.0.0.1'
  process.env.MAILTRAP_SMTP_PORT = String(catcher.port)
  process.env.MAILTRAP_SMTP_USER = 'catcher'
  process.env.MAILTRAP_SMTP_PASS = 'catcher'
  process.env.MAILTRAP_FROM_EMAIL = 'hello@example.com'
  process.env.MAILTRAP_FROM_NAME = 'PropertyFlow'
  process.env.AUTH_SECRET = 'integration-legacy-secret'

  const mod = await import('./index.js')
  app = mod.default
}, 120_000)

afterAll(async () => {
  await catcher?.stop()
  const db = await import('./db.js')
  await db.pool?.end()
  await admin?.end()
})

describe('invites against local Postgres', () => {
  it('rejects a missing token', async () => {
    const res = await app.request('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@example.com', role: 'tenant', agency_id: AGENCY_A }),
    })
    expect(res.status).toBe(401)
    expect(inviteMock).not.toHaveBeenCalled()
  })

  it('rejects a cross-agency invite', async () => {
    inviteMock.mockClear()
    const res = await app.request('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await bearer(ADMIN_A_AUTH)) },
      body: JSON.stringify({ email: 'cross@example.com', role: 'tenant', agency_id: AGENCY_B }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { message: string }
    expect(body.message).toMatch(/Staff of this agency/)
    expect(inviteMock).not.toHaveBeenCalled()
    const rows = await admin.query(`SELECT 1 FROM invites WHERE email = 'cross@example.com'`)
    expect(rows.rowCount).toBe(0)
  })

  it('rejects role escalation and super admin grants', async () => {
    inviteMock.mockClear()
    const escalated = await app.request('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await bearer(AGENT_A_AUTH)) },
      body: JSON.stringify({ email: 'boss@example.com', role: 'client_admin', agency_id: AGENCY_A }),
    })
    expect(escalated.status).toBe(403)
    expect(((await escalated.json()) as { message: string }).message).toMatch(/above your own/)

    const banned = await app.request('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await bearer(ADMIN_A_AUTH)) },
      body: JSON.stringify({ email: 'root@example.com', role: 'super_admin', agency_id: AGENCY_A }),
    })
    expect(banned.status).toBe(403)
    expect(((await banned.json()) as { message: string }).message).toMatch(/super admin/)
    expect(inviteMock).not.toHaveBeenCalled()
  })

  it('rejects a caller who is not staff', async () => {
    inviteMock.mockClear()
    const res = await app.request('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await bearer(LANDLORD_A_AUTH)) },
      body: JSON.stringify({ email: 'tenant@example.com', role: 'tenant', agency_id: AGENCY_A }),
    })
    expect(res.status).toBe(403)
    expect(inviteMock).not.toHaveBeenCalled()
  })

  it('creates a pending invite and returns the auth user id', async () => {
    inviteMock.mockClear()
    const res = await app.request('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await bearer(ADMIN_A_AUTH)) },
      body: JSON.stringify({
        email: 'New.Person@example.com',
        role: 'ground_agent',
        agency_id: AGENCY_A,
      }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { user_id: string }
    expect(inviteMock).toHaveBeenCalledWith('new.person@example.com')
    const invited = (await inviteMock.mock.results[0]?.value) as { userId: string }
    expect(body.user_id).toBe(invited.userId)
    const rows = await admin.query<{
      role: string
      status: string
      agency_id: string
      invited_by: string
      auth_user_id: string
      token: string
    }>(
      `SELECT role, status, agency_id::text, invited_by::text, auth_user_id::text, token
       FROM invites WHERE lower(email) = 'new.person@example.com'`,
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]).toMatchObject({
      role: 'ground_agent',
      status: 'pending',
      agency_id: AGENCY_A,
      invited_by: ADMIN_A,
      auth_user_id: body.user_id,
    })
    expect(rows.rows[0].token.length).toBeGreaterThan(20)
  })
})

describe('application received email', () => {
  async function createApplication(id: string) {
    return app.request('/api/persist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await bearer(ADMIN_A_AUTH)) },
      body: JSON.stringify({
        resource: 'application',
        action: 'upsert',
        id,
        data: {
          id,
          agencyId: AGENCY_A,
          propertyId: UNIT,
          applicantUserId: APPLICANT,
          email: 'spoof@evil.test',
          applicantName: 'Spoof Name',
          stage: 'Submitted',
          referenceCode: id,
          type: 'Rental',
        },
      }),
    })
  }

  function messagesFor(reference: string) {
    return catcher.messages.filter(
      (message) =>
        message.raw.includes(reference) &&
        message.raw.toLowerCase().includes(APPLICANT_EMAIL) &&
        message.raw.includes('Your application has been received'),
    )
  }

  it('sends one email to the applicant on file and ignores a repeat create', async () => {
    const first = await createApplication('APP-email-1')
    expect(first.status, await first.clone().text()).toBe(200)
    const second = await createApplication('APP-email-1')
    expect(second.status).toBe(200)
    expect(messagesFor('APP-email-1')).toHaveLength(1)
    expect(catcher.messages.some((message) => message.raw.includes('spoof@evil.test'))).toBe(false)

    const created = await createApplication('APP-email-2')
    expect(created.status, await created.clone().text()).toBe(200)
    const [left, right] = await Promise.all([
      createApplication('APP-email-2'),
      createApplication('APP-email-2'),
    ])
    expect(left.status).toBe(200)
    expect(right.status).toBe(200)
    expect(messagesFor('APP-email-2')).toHaveLength(1)

    const existing = await admin.query<{ id: string }>(
      `SELECT id::text AS id FROM applications WHERE reference_code = 'APP-email-1'`,
    )
    await admin.query(
      `DELETE FROM application_email_sends WHERE application_id = $1::uuid`,
      [existing.rows[0].id],
    )
    const before = messagesFor('APP-email-1').length
    const { deliverApplicationReceivedEmail } = await import('./applicationEmail.js')
    await Promise.all([
      deliverApplicationReceivedEmail(existing.rows[0].id),
      deliverApplicationReceivedEmail(existing.rows[0].id),
    ])
    expect(messagesFor('APP-email-1').length - before).toBe(1)

    const logged = await admin.query<{ n: string; recipient_email: string }>(
      `SELECT count(*)::text AS n, recipient_email
       FROM application_email_sends
       WHERE kind = 'application_received'
       GROUP BY recipient_email`,
    )
    expect(logged.rows).toEqual([{ n: '2', recipient_email: APPLICANT_EMAIL }])
  })

  it('no longer exposes POST /api/notify/application-received', async () => {
    const res = await app.request('/api/notify/application-received', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await bearer(ADMIN_A_AUTH)) },
      body: JSON.stringify({ email: APPLICANT_EMAIL }),
    })
    expect(res.status).toBe(404)
  })
})
