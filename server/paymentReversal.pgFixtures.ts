/**
 * Test-only fixtures for the admin reversal pg tests (paymentReversal*.pg.test.ts).
 * Not a test file and not imported by the app. Own identifiers so these
 * files never collide with other pg tests: client uuids a5a1…/b5b1…/c5c1…,
 * FE ids par-*, emails par-*@example.test, subdomains par-a/b/c,
 * x-forwarded-for 10.88.<file>.x. Runs only against a THROWAWAY scratch
 * database (PF_TEST_PG_URL). Never live.
 */
import { expect } from 'vitest'

export const A = 'a5a10000-0000-4000-8000-00000000000a'
export const B = 'b5b10000-0000-4000-8000-00000000000b'
/** Agency C: its agency pack (clients.settings.enabledPermissions) has no payments.manage (T-V30). */
export const C = 'c5c10000-0000-4000-8000-00000000000c'
export const AG = { A: 'par-ag-a', B: 'par-ag-b', C: 'par-ag-c' } as const

const V2_STAFF_LIST = ['payments.view', 'payments.manage', 'reports.view', 'documents.view']
type Seed = { id: string; fe: string; client: string | null; role: string; first: string; last: string; meta?: Record<string, unknown> }
export const USERS = {
  caA1: { id: 'a5a10001-0000-4000-8000-000000000001', fe: 'par-ca-a1', client: A, role: 'AGENCY_ADMIN', first: 'Lerato', last: 'Principal' },
  caA2: { id: 'a5a10001-0000-4000-8000-000000000002', fe: 'par-ca-a2', client: A, role: 'AGENCY_ADMIN', first: 'Naledi', last: 'Principal' },
  aaA: { id: 'a5a10001-0000-4000-8000-000000000003', fe: 'par-aa-a', client: A, role: 'AGENT_ADMIN', first: 'Sipho', last: 'Office' },
  /** agent_admin whose stored list has no payments.manage (T-V2d). */
  aaNoPm: { id: 'a5a10001-0000-4000-8000-000000000004', fe: 'par-aa-nopm', client: A, role: 'AGENT_ADMIN', first: 'Ayanda', last: 'Office', meta: { enabledPermissions: ['payments.view', 'reports.view', 'trust.approve_payout'], permissionsVersion: 2 } },
  /** agent_admin with payments.manage but no trust.approve_payout (T-V2 mutant). */
  aaNoPayout: { id: 'a5a10001-0000-4000-8000-000000000005', fe: 'par-aa-nopayout', client: A, role: 'AGENT_ADMIN', first: 'Kagiso', last: 'Office', meta: { enabledPermissions: V2_STAFF_LIST, permissionsVersion: 2 } },
  /** ground agent with a stored payments.manage (T-V2c). */
  gaA: { id: 'a5a10001-0000-4000-8000-000000000006', fe: 'par-ga-a', client: A, role: 'GROUND_AGENT', first: 'Thabo', last: 'Field', meta: { enabledPermissions: V2_STAFF_LIST, permissionsVersion: 2 } },
  tenA: { id: 'a5a10001-0000-4000-8000-000000000007', fe: 'par-ten-a', client: A, role: 'END_USER', first: 'Thandi', last: 'Tenant' },
  tenA2: { id: 'a5a10001-0000-4000-8000-000000000008', fe: 'par-ten-a2', client: A, role: 'END_USER', first: 'Zanele', last: 'Tenant' },
  llA: { id: 'a5a10001-0000-4000-8000-000000000009', fe: 'par-ll-a', client: A, role: 'LANDLORD', first: 'Pieter', last: 'Owner' },
  caB: { id: 'b5b10001-0000-4000-8000-000000000001', fe: 'par-ca-b', client: B, role: 'AGENCY_ADMIN', first: 'Bongani', last: 'Principal' },
  caC: { id: 'c5c10001-0000-4000-8000-000000000001', fe: 'par-ca-c', client: C, role: 'AGENCY_ADMIN', first: 'Chris', last: 'Principal', meta: { enabledPermissions: V2_STAFF_LIST, permissionsVersion: 2 } },
  aaC: { id: 'c5c10001-0000-4000-8000-000000000002', fe: 'par-aa-c', client: C, role: 'AGENT_ADMIN', first: 'Carla', last: 'Office', meta: { enabledPermissions: V2_STAFF_LIST, permissionsVersion: 2 } },
  superAdmin: { id: 'e5e10001-0000-4000-8000-000000000001', fe: 'par-super', client: null, role: 'SUPER_ADMIN', first: 'Platform', last: 'Support' },
} satisfies Record<string, Seed>
export type UserKey = keyof typeof USERS

export const BLD = { A: 'a5a10002-0000-4000-8000-000000000001', B: 'b5b10002-0000-4000-8000-000000000001', C: 'c5c10002-0000-4000-8000-000000000001' }
export const UNIT = { A: 'a5a10003-0000-4000-8000-000000000001', B: 'b5b10003-0000-4000-8000-000000000001', C: 'c5c10003-0000-4000-8000-000000000001' }
export const PROP = { A: 'par-p-a', B: 'par-p-b', C: 'par-p-c' }
export const APP_A = 'a5a10004-0000-4000-8000-000000000001'
export const APP_A_FE = 'par-app-a'
export const LEASE_A = 'a5a10005-0000-4000-8000-000000000001'

/** Test-only password fixture, built at runtime (not a credential). */
export const TEST_FIXTURE_PW = ['par', 'fixture', 'pw'].join('-')

type Q = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>
export type App = { request: (path: string, init?: RequestInit) => Promise<Response> }

export async function cleanup(q: Q) {
  const clients = [A, B, C]
  await q(`DELETE FROM notifications WHERE client_id = ANY($1::uuid[]) OR user_id IN (SELECT id FROM users WHERE email LIKE 'par-%@example.test')`, [clients])
  await q(`DELETE FROM event_log WHERE client_id = ANY($1::uuid[]) OR actor_user_id = $2::uuid`, [clients, USERS.superAdmin.id])
  await q(`DELETE FROM payments WHERE client_id = ANY($1::uuid[])`, [clients])
  await q(`DELETE FROM leases WHERE client_id = ANY($1::uuid[])`, [clients])
  await q(`DELETE FROM applications WHERE client_id = ANY($1::uuid[])`, [clients])
  await q(`DELETE FROM entity_id_map WHERE frontend_id LIKE 'par-%'`)
  await q(`DELETE FROM units WHERE client_id = ANY($1::uuid[])`, [clients])
  await q(`DELETE FROM buildings WHERE client_id = ANY($1::uuid[])`, [clients])
  await q(`DELETE FROM users WHERE email LIKE 'par-%@example.test'`)
  await q(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [clients])
}

export async function seedBase(q: Q) {
  await q(
    `INSERT INTO clients (id, company_name, subdomain, settings) VALUES
       ($1::uuid, 'PAR Agency A', 'par-a', '{}'::jsonb),
       ($2::uuid, 'PAR Agency B', 'par-b', '{}'::jsonb),
       ($3::uuid, 'PAR Agency C', 'par-c', $4::jsonb)`,
    [A, B, C, JSON.stringify({ enabledPermissions: ['payments.view', 'reports.view', 'documents.view', 'users.manage'], permissionsVersion: 2 })],
  )
  await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid), ('agency', $3, $4::uuid), ('agency', $5, $6::uuid)`, [AG.A, A, AG.B, B, AG.C, C])
  const { hashPassword } = await import('./auth.js')
  const hash = await hashPassword(TEST_FIXTURE_PW)
  for (const u of Object.values(USERS) as Seed[]) {
    await q(
      `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, TRUE, $8::jsonb)`,
      [u.id, u.client, `${u.fe}@example.test`, hash, u.first, u.last, u.role, JSON.stringify({ mustChangePassword: false, ...(u.meta ?? {}) })],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [u.fe, u.id])
  }
  for (const k of ['A', 'B', 'C'] as const) {
    const client = k === 'A' ? A : k === 'B' ? B : C
    await q(
      `INSERT INTO buildings (id, client_id, name, address, city, province, landlord_id) VALUES ($1::uuid, $2::uuid, $3, '9 Par St', 'Gqeberha', 'EC', $4::uuid)`,
      [BLD[k], client, `PAR ${k}`, k === 'A' ? USERS.llA.id : null],
    )
    await q(
      `INSERT INTO units (id, building_id, client_id, unit_number, title, listing_type, rent) VALUES ($1::uuid, $2::uuid, $3::uuid, '4', $4, 'RENT', 8500)`,
      [UNIT[k], BLD[k], client, `Par ${k} Unit 4`],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('property', $1, $2::uuid)`, [PROP[k], UNIT[k]])
  }
  await q(
    `INSERT INTO applications (id, client_id, unit_id, reference_code) VALUES ($1::uuid, $2::uuid, $3::uuid, 'PAR-APP-1')`,
    [APP_A, A, UNIT.A],
  )
  await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('application', $1, $2::uuid)`, [APP_A_FE, APP_A])
  await q(
    `INSERT INTO leases (id, client_id, unit_id, lease_reference, start_date, rent_amount) VALUES ($1::uuid, $2::uuid, $3::uuid, 'PAR-L-1', DATE '2026-01-01', 8500)`,
    [LEASE_A, A, UNIT.A],
  )
}

/** Per-test reset: payments, audit rows and notices of the three agencies. */
export async function resetRows(q: Q) {
  const clients = [A, B, C]
  await q(`DELETE FROM notifications WHERE client_id = ANY($1::uuid[]) OR user_id IN (SELECT id FROM users WHERE email LIKE 'par-%@example.test')`, [clients])
  await q(`DELETE FROM event_log WHERE client_id = ANY($1::uuid[]) OR actor_user_id = $2::uuid`, [clients, USERS.superAdmin.id])
  await q(`DELETE FROM payments WHERE client_id = ANY($1::uuid[])`, [clients])
  await q(`DELETE FROM entity_id_map WHERE entity_type = 'payment' AND frontend_id LIKE 'par-%'`)
}

let seq = 0
export type PaymentSeed = {
  client?: string
  status?: 'PAID' | 'DUE' | 'CANCELLED' | 'OVERDUE'
  /** ISO instant; default now (same SAST month) for PAID rows. */
  paidAt?: string | null
  dueDate?: string
  party?: UserKey | null
  type?: string
  amount?: number
  paidAmount?: number | null
  method?: string | null
  reference?: string | null
  leaseId?: string | null
  applicationId?: string | null
  recordedBy?: UserKey | null
}
export type SeededPayment = { uuid: string; fe: string; updatedAt: string }

export async function seedPayment(q: Q, s: PaymentSeed = {}): Promise<SeededPayment> {
  seq += 1
  const uuid = `a5a1f000-0000-4000-8000-${String(seq).padStart(12, '0')}`
  const fe = `par-pay-${seq}`
  const client = s.client ?? A
  const unit = client === A ? UNIT.A : client === B ? UNIT.B : UNIT.C
  const status = s.status ?? 'PAID'
  const paid = status === 'PAID'
  const party = s.party === undefined ? 'tenA' : s.party
  await q(
    `INSERT INTO payments (id, client_id, unit_id, lease_id, application_id, party_user_id, party_name, payment_type, amount, paid_amount,
                           status, due_date, paid_at, method, reference, recorded_by)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, 'Thandi Tenant', $7, $8, $9, $10, $11::date, $12::timestamptz, $13, $14, $15::uuid)`,
    [
      uuid, client, unit, s.leaseId ?? null, s.applicationId ?? null, party ? USERS[party].id : null,
      s.type ?? 'RENT', s.amount ?? 8500,
      s.paidAmount === undefined ? (paid ? s.amount ?? 8500 : null) : s.paidAmount,
      status, s.dueDate ?? new Date().toISOString().slice(0, 10),
      s.paidAt === undefined ? (paid ? new Date().toISOString() : null) : s.paidAt,
      s.method === undefined ? (paid ? 'EFT' : null) : s.method,
      s.reference === undefined ? (paid ? 'FNB-REF-0042-7781' : null) : s.reference,
      s.recordedBy === undefined ? (paid ? USERS.caA1.id : null) : s.recordedBy ? USERS[s.recordedBy].id : null,
    ],
  )
  await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('payment', $1, $2::uuid)`, [fe, uuid])
  return { uuid, fe, updatedAt: await updatedAt(q, uuid) }
}

export async function updatedAt(q: Q, uuid: string): Promise<string> {
  const r = await q<{ updated_at: Date }>(`SELECT updated_at FROM payments WHERE id = $1::uuid`, [uuid])
  return r[0]!.updated_at.toISOString()
}

export type PaymentDbRow = {
  status: string
  paid_at: Date | null
  paid_amount: string | null
  method: string | null
  reference: string | null
  recorded_by: string | null
  amount: string
}
export async function paymentRow(q: Q, uuid: string): Promise<PaymentDbRow | undefined> {
  return (await q<PaymentDbRow>(
    `SELECT status, paid_at, paid_amount::text AS paid_amount, method, reference, recorded_by::text AS recorded_by, amount::text AS amount
       FROM payments WHERE id = $1::uuid`,
    [uuid],
  ))[0]
}

export type AuditRow = { id: string; event_type: string; actor_user_id: string | null; client_id: string | null; payload: Record<string, unknown> }
export async function audits(q: Q, uuid: string): Promise<AuditRow[]> {
  return q<AuditRow>(
    `SELECT id::text AS id, event_type, actor_user_id::text AS actor_user_id, client_id::text AS client_id, payload
       FROM event_log WHERE subject_type = 'payment' AND subject_id = $1::uuid
        AND event_type IN ('payment_reversed_by_admin', 'payment_reopened') ORDER BY created_at`,
    [uuid],
  )
}

export type NoticeRow = { user_id: string; title: string; body: string; email_status: string | null; emailed: boolean }
export async function notices(q: Q, withEmailCols = true): Promise<NoticeRow[]> {
  return q<NoticeRow>(
    `SELECT user_id::text AS user_id, title, body, ${withEmailCols ? "email_status, emailed_at IS NOT NULL AS emailed" : 'NULL AS email_status, FALSE AS emailed'}
       FROM notifications WHERE client_id = ANY($1::uuid[]) AND resource_type = 'payment' ORDER BY title, user_id`,
    [[A, B, C]],
  )
}

export function makeClient(getApp: () => App, tokens: Partial<Record<UserKey, string>>, ipPrefix: string) {
  async function login(key: UserKey, n: number): Promise<string> {
    const res = await getApp().request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ipPrefix}.${n}` },
      body: JSON.stringify({ email: `${USERS[key].fe}@example.test`, password: TEST_FIXTURE_PW }),
    })
    expect(res.status, `login ${key}`).toBe(200)
    return ((await res.json()) as { token: string }).token
  }
  async function call(
    method: string,
    path: string,
    who: UserKey | null,
    body?: Record<string, unknown>,
    extraHeaders: Record<string, string> = {},
  ) {
    const headers: Record<string, string> = { 'content-type': 'application/json', ...extraHeaders }
    if (who) headers.Authorization = `Bearer ${tokens[who]}`
    const res = await getApp().request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { status: res.status, code: (json?.code as string | undefined) ?? null, json }
  }
  return { login, call }
}
