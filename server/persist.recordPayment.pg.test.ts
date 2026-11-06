import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A2 record-a-payment (Ruling 30): red tests T-R1–T-R16, T-R19–T-R26 on
 * origin/main 20e2c0a9. Own ids so this file never shares a row with
 * persist.ledgerAuth.pg.test.ts (a017…) or persist.ledgerSliceA.pg.test.ts
 * (e017…): clients c0a2… / d0a2…, FE ids *-a2r-*, payments PAY-a2r-*,
 * login XFF 10.91.0.x.
 *
 * Real Hono app (PF_SKIP_SERVE=1), real /api/auth/login sessions, NODE_ENV
 * production (no demo actor), real Postgres from PF_TEST_PG_URL (throwaway
 * scratch database only). T-R19 / T-R24 add a CHECK constraint; T-R14 races
 * two saves. Run this file on its own (--no-file-parallelism).
 */
const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  process.env.AUTH_SECRET = ['a2', 'record', 'payment', 'test'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})

const TEST_FIXTURE_PW = ['test', 'fixture', 'pw'].join('-')
const TZ = 'Africa/Johannesburg'
const A = 'c0a20000-0000-4000-8000-00000000000a'
const B = 'd0a20000-0000-4000-8000-00000000000b'
const AG_A = 'ag-a2r-a'
const AG_B = 'ag-a2r-b'
const u = (agency: 'c' | 'd', n: number) =>
  `${agency}0a20001-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const USERS = {
  adminA: { id: u('c', 1), fe: 'u-a2r-admin-a', client: A as string | null, role: 'AGENT_ADMIN', meta: {} },
  groundA: { id: u('c', 2), fe: 'u-a2r-ground-a', client: A as string | null, role: 'GROUND_AGENT', meta: {} },
  tenA: { id: u('c', 3), fe: 'u-a2r-tenant-a', client: A as string | null, role: 'END_USER', meta: {} },
  tenOther: { id: u('c', 4), fe: 'u-a2r-tenant-o', client: A as string | null, role: 'END_USER', meta: {} },
  llA: { id: u('c', 5), fe: 'u-a2r-ll-a', client: A as string | null, role: 'LANDLORD', meta: {} },
  superAdmin: { id: u('c', 6), fe: 'u-a2r-super', client: null as string | null, role: 'SUPER_ADMIN', meta: {} },
  applicantA: { id: u('c', 7), fe: 'u-a2r-appl-a', client: A as string | null, role: 'END_USER', meta: {} },
  tenB: { id: u('d', 1), fe: 'u-a2r-tenant-b', client: B as string | null, role: 'END_USER', meta: {} },
  llB: { id: u('d', 2), fe: 'u-a2r-ll-b', client: B as string | null, role: 'LANDLORD', meta: {} },
  adminB: { id: u('d', 3), fe: 'u-a2r-admin-b', client: B as string | null, role: 'AGENT_ADMIN', meta: {} },
} as const
type UserKey = keyof typeof USERS
const BLD_A = 'c0a20003-0000-4000-8000-000000000001'
const BLD_B = 'd0a20003-0000-4000-8000-000000000001'
const UNIT = {
  a1: { id: 'c0a20002-0000-4000-8000-000000000001', fe: 'p-a2r-a1', client: A, agent: USERS.groundA.id },
  b1: { id: 'd0a20002-0000-4000-8000-000000000001', fe: 'p-a2r-b1', client: B, agent: null as string | null },
} as const
const APP = {
  a1: { id: 'c0a20005-0000-4000-8000-000000000001', fe: 'APP-a2r-A1', client: A, unit: UNIT.a1.id, applicant: USERS.applicantA.id, agent: USERS.groundA.id },
  a2: { id: 'c0a20005-0000-4000-8000-000000000002', fe: 'APP-a2r-A2', client: A, unit: UNIT.a1.id, applicant: USERS.applicantA.id, agent: USERS.groundA.id },
  a3: { id: 'c0a20005-0000-4000-8000-000000000003', fe: 'APP-a2r-A3', client: A, unit: UNIT.a1.id, applicant: USERS.applicantA.id, agent: USERS.groundA.id },
  a4: { id: 'c0a20005-0000-4000-8000-000000000004', fe: 'APP-a2r-A4', client: A, unit: UNIT.a1.id, applicant: USERS.applicantA.id, agent: USERS.groundA.id },
  other: { id: 'c0a20005-0000-4000-8000-000000000005', fe: 'APP-a2r-AO', client: A, unit: UNIT.a1.id, applicant: USERS.applicantA.id, agent: USERS.groundA.id },
  b1: { id: 'd0a20005-0000-4000-8000-000000000001', fe: 'APP-a2r-B1', client: B, unit: UNIT.b1.id, applicant: USERS.tenB.id, agent: null as string | null },
} as const
const LEASE = {
  a1: { id: 'c0a20006-0000-4000-8000-000000000001', fe: 'ten-a2r-A1', client: A, unit: UNIT.a1.id, tenant: USERS.tenA.id, start: '2026-01-01', end: '2026-03-31' },
  a2: { id: 'c0a20006-0000-4000-8000-000000000002', fe: 'ten-a2r-A2', client: A, unit: UNIT.a1.id, tenant: USERS.tenA.id, start: '2026-04-01', end: '2026-06-30' },
  a3: { id: 'c0a20006-0000-4000-8000-000000000003', fe: 'ten-a2r-A3', client: A, unit: UNIT.a1.id, tenant: USERS.tenA.id, start: '2026-07-01', end: '2026-09-30' },
  other: { id: 'c0a20006-0000-4000-8000-000000000004', fe: 'ten-a2r-AO', client: A, unit: UNIT.a1.id, tenant: USERS.tenOther.id, start: '2026-10-01', end: '2026-12-31' },
  b1: { id: 'd0a20006-0000-4000-8000-000000000001', fe: 'ten-a2r-B1', client: B, unit: UNIT.b1.id, tenant: USERS.tenB.id, start: '2026-01-01', end: '2026-12-31' },
} as const
type PaySeed = {
  id: string
  fe: string
  client: string
  unit: string
  party: string
  partyFe: string
  app: string | null
  lease: string | null
  amount: number
}
const PAY = {
  a: { id: 'c0a20004-0000-4000-8000-000000000001', fe: 'PAY-a2r-a', client: A, unit: UNIT.a1.id, party: USERS.tenA.id, partyFe: USERS.tenA.fe, app: APP.a1.id, lease: LEASE.a1.id, amount: 20000 },
  relatedApp: { id: 'c0a20004-0000-4000-8000-000000000002', fe: 'PAY-a2r-relApp', client: A, unit: UNIT.a1.id, party: USERS.tenA.id, partyFe: USERS.tenA.fe, app: APP.a1.id, lease: null, amount: 15000 },
  relatedLease: { id: 'c0a20004-0000-4000-8000-000000000003', fe: 'PAY-a2r-relLease', client: A, unit: UNIT.a1.id, party: USERS.tenOther.id, partyFe: USERS.tenOther.fe, app: APP.a2.id, lease: LEASE.a1.id, amount: 18000 },
  samePartyDiffAmt: { id: 'c0a20004-0000-4000-8000-000000000004', fe: 'PAY-a2r-partyDiff', client: A, unit: UNIT.a1.id, party: USERS.tenA.id, partyFe: USERS.tenA.fe, app: APP.a3.id, lease: LEASE.a2.id, amount: 12000 },
  samePartySameAmt: { id: 'c0a20004-0000-4000-8000-000000000005', fe: 'PAY-a2r-partySame', client: A, unit: UNIT.a1.id, party: USERS.tenA.id, partyFe: USERS.tenA.fe, app: APP.a4.id, lease: LEASE.a3.id, amount: 20000 },
  unrelated: { id: 'c0a20004-0000-4000-8000-000000000006', fe: 'PAY-a2r-unrel', client: A, unit: UNIT.a1.id, party: USERS.tenOther.id, partyFe: USERS.tenOther.fe, app: APP.other.id, lease: LEASE.other.id, amount: 20000 },
  spare: { id: 'c0a20004-0000-4000-8000-000000000007', fe: 'PAY-a2r-spare', client: A, unit: UNIT.a1.id, party: USERS.tenOther.id, partyFe: USERS.tenOther.fe, app: null, lease: null, amount: 20000 },
  b: { id: 'd0a20004-0000-4000-8000-000000000001', fe: 'PAY-a2r-b', client: B, unit: UNIT.b1.id, party: USERS.tenB.id, partyFe: USERS.tenB.fe, app: APP.b1.id, lease: LEASE.b1.id, amount: 20000 },
} as const satisfies Record<string, PaySeed>

const AUDIT_REQUIRED = [
  'previousStatus',
  'amountCents',
  'paidAmountCents',
  'method',
  'receivedDate',
  'referenceKind',
  'referenceSource',
  'reference',
  'noteTyped',
  'confirmedTenantReport',
  'sharedReferenceCount',
  'duplicateReferenceConfirmed',
  'recordedByRole',
] as const
const AUDIT_OPTIONAL = [
  'amountReason',
  'receivedDateDefaulted',
  'receivedDateReason',
  'duplicateReferenceReason',
  'referenceMasked',
  'originalAmountCents',
  'balancePaymentId',
  'balanceCents',
  'shortfallReason',
  'impersonatedUserId',
] as const
const AUDIT_ALLOWED = new Set<string>([...AUDIT_REQUIRED, ...AUDIT_OPTIONAL])

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function todaySast(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}
function isLuhn(num: string): boolean {
  const d = num.replace(/\D/g, '')
  let sum = 0
  let alt = false
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i])
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}
function withLuhnCheck(digits12: string): string {
  for (let i = 0; i <= 9; i++) {
    const cand = `${digits12}${i}`
    if (isLuhn(cand)) return cand
  }
  throw new Error('no luhn check digit')
}
/** 13-digit SA-ID-shaped value: YYMMDD + sequence + 0 + 8 + Luhn. */
const SA_ID_SHAPED = withLuhnCheck('800101500008')
const CARD_SHAPED = '4111 1111 1111 1111'

type Row = {
  amount: string
  paid_amount: string | null
  status: string
  client_id: string
  unit_id: string | null
  party_user_id: string | null
  lease_id: string | null
  application_id: string | null
  payment_type: string
  paid_at_sast: string | null
  method: string | null
  reference: string | null
  notes: string | null
  due_date: string
  recorded_by: string | null
}
type App = { request: (path: string, init?: RequestInit) => Promise<Response> }

describe.skipIf(!url)('A2 record-a-payment: mark-paid rules via the real app, session and Postgres', () => {
  let db: typeof import('./db.js')
  let app: App
  const tokens: Partial<Record<UserKey, string>> = {}
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)

  const row = async (id: string): Promise<Row | undefined> =>
    (await q<Row>(
      `SELECT amount::text AS amount, paid_amount::text AS paid_amount, status, client_id::text AS client_id,
              unit_id::text AS unit_id, party_user_id::text AS party_user_id,
              lease_id::text AS lease_id, application_id::text AS application_id, payment_type,
              to_char((paid_at AT TIME ZONE 'Africa/Johannesburg')::date, 'YYYY-MM-DD') AS paid_at_sast,
              method, reference, notes, due_date::text AS due_date, recorded_by::text AS recorded_by
         FROM payments WHERE id = $1::uuid`,
      [id],
    ))[0]
  const seededAmount = (n: number) => n.toFixed(2)
  const seededRow = (p: PaySeed): Row => ({
    amount: seededAmount(p.amount),
    paid_amount: null,
    status: 'DUE',
    client_id: p.client,
    unit_id: p.unit,
    party_user_id: p.party,
    lease_id: p.lease,
    application_id: p.app,
    payment_type: 'DEPOSIT',
    paid_at_sast: null,
    method: null,
    reference: null,
    notes: null,
    due_date: '2026-11-01',
    recorded_by: null,
  })
  const events = async (type: string, subject?: string) =>
    q<{ client_id: string | null; subject_id: string | null; actor_user_id: string | null; payload: Record<string, unknown> }>(
      `SELECT client_id::text AS client_id, subject_id::text AS subject_id, actor_user_id::text AS actor_user_id, payload
         FROM event_log WHERE event_type = $1 AND ($2::uuid IS NULL OR subject_id = $2::uuid) ORDER BY created_at`,
      [type, subject ?? null],
    )
  const marked = (id: string) => events('payment_marked_paid', id)
  const dueCount = async (except?: string) =>
    Number(
      (await q<{ n: string }>(
        `SELECT count(*)::text AS n FROM payments WHERE client_id = $1::uuid AND status = 'DUE' AND ($2::uuid IS NULL OR id <> $2::uuid)`,
        [A, except ?? null],
      ))[0]!.n,
    )

  async function cleanup() {
    const clients = [A, B]
    const unitIds = Object.values(UNIT).map((x) => x.id)
    await q(`ALTER TABLE event_log DROP CONSTRAINT IF EXISTS a2rec_no_mark_paid`)
    await q(`DELETE FROM payments WHERE client_id = ANY($1::uuid[]) OR unit_id = ANY($2::uuid[])`, [clients, unitIds])
    await q(`DELETE FROM event_log WHERE client_id = ANY($1::uuid[])`, [clients])
    await q(`DELETE FROM leases WHERE client_id = ANY($1::uuid[])`, [clients])
    await q(`DELETE FROM applications WHERE client_id = ANY($1::uuid[])`, [clients])
    await q(
      `DELETE FROM entity_id_map WHERE frontend_id LIKE 'APP-a2r-%' OR frontend_id LIKE 'PAY-a2r-%' OR frontend_id LIKE 'u-a2r-%'
          OR frontend_id LIKE 'p-a2r-%' OR frontend_id LIKE 'ten-a2r-%' OR frontend_id IN ($1, $2)`,
      [AG_A, AG_B],
    )
    await q(`DELETE FROM units WHERE id = ANY($1::uuid[])`, [unitIds])
    await q(`DELETE FROM buildings WHERE id IN ($1::uuid, $2::uuid)`, [BLD_A, BLD_B])
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [Object.values(USERS).map((x) => x.id)])
    await q(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [clients])
  }

  async function resetLedger() {
    const unitIds = Object.values(UNIT).map((x) => x.id)
    await q(`ALTER TABLE event_log DROP CONSTRAINT IF EXISTS a2rec_no_mark_paid`)
    await q(`DELETE FROM payments WHERE client_id = ANY($1::uuid[]) OR unit_id = ANY($2::uuid[])`, [[A, B], unitIds])
    await q(`DELETE FROM entity_id_map WHERE entity_type = 'payment' AND frontend_id LIKE 'PAY-a2r-%'`)
    await q(`DELETE FROM event_log WHERE client_id = ANY($1::uuid[])`, [[A, B]])
    await q(`DELETE FROM leases WHERE client_id = ANY($1::uuid[])`, [[A, B]])
    await q(`DELETE FROM applications WHERE client_id = ANY($1::uuid[])`, [[A, B]])
    let n = 1
    for (const a of Object.values(APP)) {
      await q(
        `INSERT INTO applications (id, client_id, unit_id, applicant_id, agent_id, reference_code, application_type, status, submitted_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, 'RENTAL', 'UNDER_REVIEW', NOW())`,
        [a.id, a.client, a.unit, a.applicant, a.agent, `A2R-${n++}`],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('application', $1, $2::uuid) ON CONFLICT DO NOTHING`, [a.fe, a.id])
    }
    n = 1
    for (const l of Object.values(LEASE)) {
      await q(
        `INSERT INTO leases (id, client_id, unit_id, tenant_id, lease_reference, status, start_date, end_date, rent_amount)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'ACTIVE', $6::date, $7::date, 10000)`,
        [l.id, l.client, l.unit, l.tenant, `A2R-L-${n++}`, l.start, l.end],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('tenancy', $1, $2::uuid) ON CONFLICT DO NOTHING`, [l.fe, l.id])
    }
    for (const p of Object.values(PAY)) {
      await q(
        `INSERT INTO payments (id, client_id, unit_id, lease_id, application_id, party_user_id, party_name, payment_type, amount, status, due_date)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, 'Tenant', 'DEPOSIT', $7, 'DUE', DATE '2026-11-01')`,
        [p.id, p.client, p.unit, p.lease, p.app, p.party, p.amount],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('payment', $1, $2::uuid)`, [p.fe, p.id])
    }
  }

  async function login(key: UserKey, n: number): Promise<string> {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.91.0.${n}` },
      body: JSON.stringify({ email: `${USERS[key].fe}@example.test`, password: TEST_FIXTURE_PW }),
    })
    expect(res.status, `login ${key}`).toBe(200)
    return ((await res.json()) as { token: string }).token
  }

  async function post(path: string, who: UserKey | null, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = { 'content-type': 'application/json', ...extraHeaders }
    if (who) headers.Authorization = `Bearer ${tokens[who]}`
    const res = await app.request(path, { method: 'POST', headers, body: JSON.stringify(body) })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { status: res.status, code: (json?.code as string | undefined) ?? null, json }
  }
  const persist = (who: UserKey | null, body: Record<string, unknown>, extraHeaders?: Record<string, string>) =>
    post('/api/persist', who, body, extraHeaders)
  const paidData = (p: PaySeed, extra: Record<string, unknown> = {}) => ({
    amount: p.amount,
    status: 'Paid',
    type: 'Deposit',
    partyName: 'Tenant',
    dueDate: '2026-11-01',
    agencyId: p.client === A ? AG_A : AG_B,
    propertyId: p.client === A ? UNIT.a1.fe : UNIT.b1.fe,
    partyUserId: p.partyFe,
    applicationId: Object.values(APP).find((a) => a.id === p.app)?.fe,
    tenancyId: Object.values(LEASE).find((l) => l.id === p.lease)?.fe,
    reference: 'EFT-A2-1',
    method: 'EFT',
    ...extra,
  })
  const mark = (who: UserKey, p: PaySeed, extra: Record<string, unknown> = {}, headers?: Record<string, string>) =>
    persist(who, { resource: 'payment', action: 'upsert', id: p.fe, data: paidData(p, extra) }, headers)

  beforeAll(async () => {
    db = await import('./db.js')
    await cleanup()
    await q(
      `INSERT INTO clients (id, company_name, subdomain) VALUES ($1::uuid, 'A2R Agency A', 'a2r-a'), ($2::uuid, 'A2R Agency B', 'a2r-b')`,
      [A, B],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid), ('agency', $3, $4::uuid)`, [AG_A, A, AG_B, B])
    const { hashPassword } = await import('./auth.js')
    const hash = await hashPassword(TEST_FIXTURE_PW)
    for (const x of Object.values(USERS)) {
      await q(
        `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'A2r', 'Test', $5, TRUE, $6::jsonb)`,
        [x.id, x.client, `${x.fe}@example.test`, hash, x.role, JSON.stringify({ mustChangePassword: false, ...x.meta })],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [x.fe, x.id])
    }
    await q(
      `INSERT INTO buildings (id, client_id, name, address, city, province, landlord_id)
       VALUES ($1::uuid, $2::uuid, 'A2R A', '1 A St', 'Gqeberha', 'EC', $3::uuid), ($4::uuid, $5::uuid, 'A2R B', '1 B St', 'Gqeberha', 'EC', $6::uuid)`,
      [BLD_A, A, USERS.llA.id, BLD_B, B, USERS.llB.id],
    )
    await q(
      `INSERT INTO units (id, building_id, client_id, unit_number, listing_type, rent, agent_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, '1', 'RENT', 10000, $4::uuid), ($5::uuid, $6::uuid, $7::uuid, '1', 'RENT', 10000, NULL)`,
      [UNIT.a1.id, BLD_A, A, UNIT.a1.agent, UNIT.b1.id, BLD_B, B],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('property', $1, $2::uuid), ('property', $3, $4::uuid)`, [
      UNIT.a1.fe, UNIT.a1.id, UNIT.b1.fe, UNIT.b1.id,
    ])
    await resetLedger()
    app = (await import('./index.js')).default as unknown as App
    let ip = 1
    for (const key of ['adminA', 'groundA', 'tenA', 'adminB', 'superAdmin'] as const) tokens[key] = await login(key, ip++)
  })

  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
    await resetLedger()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  afterAll(async () => {
    if (db) await cleanup()
  })

  it('T-R1: paidAmount 0 / -1 / "abc" → 400 PAYMENT_AMOUNT_REQUIRED and the row is unchanged', async () => {
    const before = await row(PAY.a.id)
    const results = []
    for (const paidAmount of [0, -1, 'abc'] as const) {
      const res = await mark('adminA', PAY.a, { paidAmount, reference: 'EFT-A2-AMT' })
      results.push({ paidAmount, status: res.status, code: res.code, same: await row(PAY.a.id) })
    }
    expect(results).toEqual([
      { paidAmount: 0, status: 400, code: 'PAYMENT_AMOUNT_REQUIRED', same: before },
      { paidAmount: -1, status: 400, code: 'PAYMENT_AMOUNT_REQUIRED', same: before },
      { paidAmount: 'abc', status: 400, code: 'PAYMENT_AMOUNT_REQUIRED', same: before },
    ])
  })

  it('T-R2: paidAmount ≠ amount without a reason is 400 PAYMENT_AMOUNT_REASON_REQUIRED; with a reason the save succeeds and the audit has amountReason', async () => {
    const refused = await mark('adminA', PAY.a, { paidAmount: 25000, reference: 'EFT-A2-OV' })
    expect({ status: refused.status, code: refused.code, row: await row(PAY.a.id) }).toEqual({
      status: 400, code: 'PAYMENT_AMOUNT_REASON_REQUIRED', row: seededRow(PAY.a),
    })
    const ok = await mark('adminA', PAY.a, { paidAmount: 25000, amountChangeReason: 'Overpay kept as credit', reference: 'EFT-A2-OV' })
    const audit = await marked(PAY.a.id)
    expect({ status: ok.status, amountReason: audit[0]?.payload?.amountReason, paid: (await row(PAY.a.id))?.paid_amount }).toEqual({
      status: 200, amountReason: 'Overpay kept as credit', paid: '25000.00',
    })
  })

  it('T-R3: no paidAt → today Johannesburg and audit receivedDateDefaulted: true', async () => {
    const res = await mark('adminA', PAY.a, { reference: 'EFT-A2-TODAY' })
    const r = await row(PAY.a.id)
    const audit = await marked(PAY.a.id)
    expect({ status: res.status, paidAt: r?.paid_at_sast, defaulted: audit[0]?.payload?.receivedDateDefaulted, receivedDate: audit[0]?.payload?.receivedDate }).toEqual({
      status: 200, paidAt: todaySast(), defaulted: true, receivedDate: todaySast(),
    })
  })

  it('T-R4: tomorrow Johannesburg → PAYMENT_RECEIVED_DATE_FUTURE; 2026-13-01 → PAYMENT_RECEIVED_DATE_INVALID', async () => {
    const tomorrow = addDaysYmd(todaySast(), 1)
    const future = await mark('adminA', PAY.a, { paidAt: tomorrow, reference: 'EFT-A2-FUT' })
    const invalid = await mark('adminA', PAY.a, { paidAt: '2026-13-01', reference: 'EFT-A2-INV' })
    expect({ future: [future.status, future.code], invalid: [invalid.status, invalid.code], row: await row(PAY.a.id) }).toEqual({
      future: [400, 'PAYMENT_RECEIVED_DATE_FUTURE'], invalid: [400, 'PAYMENT_RECEIVED_DATE_INVALID'], row: seededRow(PAY.a),
    })
  })

  it('T-R5: paidAt before created_at without a reason is 400 PAYMENT_RECEIVED_DATE_REASON_REQUIRED; Paid early / Other+text succeed', async () => {
    await q(`UPDATE payments SET created_at = TIMESTAMPTZ '2026-11-01 08:00:00+02' WHERE id = $1::uuid`, [PAY.a.id])
    const refused = await mark('adminA', PAY.a, { paidAt: '2026-10-15', reference: 'EFT-A2-EARLY' })
    expect({ status: refused.status, code: refused.code, row: await row(PAY.a.id) }).toEqual({
      status: 400, code: 'PAYMENT_RECEIVED_DATE_REASON_REQUIRED', row: { ...seededRow(PAY.a) },
    })
    const otherAlone = await mark('adminA', PAY.a, { paidAt: '2026-10-15', receivedDateReason: 'Other', reference: 'EFT-A2-EARLY' })
    expect({ status: otherAlone.status, code: otherAlone.code }).toEqual({ status: 400, code: 'PAYMENT_RECEIVED_DATE_REASON_REQUIRED' })
    const ok = await mark('adminA', PAY.a, { paidAt: '2026-10-15', receivedDateReason: 'Paid early', reference: 'EFT-A2-EARLY' })
    const audit = await marked(PAY.a.id)
    expect({ status: ok.status, reason: audit[0]?.payload?.receivedDateReason, paidAt: (await row(PAY.a.id))?.paid_at_sast }).toEqual({
      status: 200, reason: 'Paid early', paidAt: '2026-10-15',
    })
    await resetLedger()
    await q(`UPDATE payments SET created_at = TIMESTAMPTZ '2026-11-01 08:00:00+02' WHERE id = $1::uuid`, [PAY.spare.id])
    const otherOk = await mark('adminA', PAY.spare, {
      paidAt: '2026-10-20',
      receivedDateReason: 'Other: standing order on the 25th',
      reference: 'EFT-A2-OTHER',
    })
    expect({ status: otherOk.status, reason: (await marked(PAY.spare.id))[0]?.payload?.receivedDateReason }).toEqual({
      status: 200, reason: 'Other: standing order on the 25th',
    })
  })

  it('T-R6: method missing → PAYMENT_METHOD_INVALID; Card maps to CARD_AT_OFFICE; cash stored as CASH; a DUE create keeps Debit order; non-PAID save ignores paidAt', async () => {
    const missing = await mark('adminA', PAY.a, { method: '', reference: 'EFT-A2-MISS' })
    expect({ missing: [missing.status, missing.code], row: await row(PAY.a.id) }).toEqual({
      missing: [400, 'PAYMENT_METHOD_INVALID'], row: seededRow(PAY.a),
    })
    const card = await mark('adminA', PAY.a, { method: 'Card', reference: 'EFT-A2-CARD' })
    expect({ status: card.status, method: (await row(PAY.a.id))?.method }).toEqual({
      status: 200, method: 'CARD_AT_OFFICE',
    })
    await resetLedger()
    const cash = await mark('adminA', PAY.a, { method: 'cash', reference: 'RCPT-44', notes: 'Cash, receipt 44' })
    expect({ status: cash.status, method: (await row(PAY.a.id))?.method }).toEqual({ status: 200, method: 'CASH' })
    const fe = 'PAY-a2r-debit'
    const created = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: fe,
      data: { id: fe, amount: 5000, status: 'Due', type: 'Rent', partyName: 'Tenant', dueDate: '2026-11-01', agencyId: AG_A, propertyId: UNIT.a1.fe, partyUserId: USERS.tenA.fe, method: 'Debit order' },
    })
    const stored = (await q<{ method: string | null; paid_at_sast: string | null }>(
      `SELECT method, to_char((paid_at AT TIME ZONE 'Africa/Johannesburg')::date, 'YYYY-MM-DD') AS paid_at_sast
         FROM payments p JOIN entity_id_map m ON m.backend_id = p.id AND m.entity_type = 'payment' WHERE m.frontend_id = $1`,
      [fe],
    ))[0]
    expect({ status: created.status, method: stored?.method }).toEqual({ status: 200, method: 'Debit order' })
    const dueEdit = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: PAY.spare.fe,
      data: { amount: 20000, status: 'Due', type: 'Deposit', partyName: 'Tenant', dueDate: '2026-11-01', agencyId: AG_A, propertyId: UNIT.a1.fe, partyUserId: USERS.tenOther.fe, paidAt: '2026-10-01', method: 'EFT' },
    })
    expect({ status: dueEdit.status, paidAt: (await row(PAY.spare.id))?.paid_at_sast }).toEqual({ status: 200, paidAt: null })
  })

  it('T-R7: OTHER with a reference but no fresh note → 400 PAYMENT_METHOD_NOTE_REQUIRED', async () => {
    const res = await mark('adminA', PAY.a, { method: 'OTHER', reference: 'EFT-A2-OTH' })
    expect({ status: res.status, code: res.code, row: await row(PAY.a.id) }).toEqual({
      status: 400, code: 'PAYMENT_METHOD_NOTE_REQUIRED', row: seededRow(PAY.a),
    })
  })

  it('T-R8: CASH with only a stored reference → 400 PAYMENT_PAID_REFERENCE_REQUIRED', async () => {
    await q(`UPDATE payments SET reference = 'OLD-RCPT' WHERE id = $1::uuid`, [PAY.a.id])
    const res = await mark('adminA', PAY.a, { method: 'CASH', reference: 'OLD-RCPT' })
    expect({ status: res.status, code: res.code, statusAfter: (await row(PAY.a.id))?.status, reference: (await row(PAY.a.id))?.reference }).toEqual({
      status: 400, code: 'PAYMENT_PAID_REFERENCE_REQUIRED', statusAfter: 'DUE', reference: 'OLD-RCPT',
    })
  })

  it('T-R9: ref 121 chars or with LF → PAYMENT_REFERENCE_INVALID; card-shaped ref or note → PAYMENT_CARD_NUMBER_REFUSED', async () => {
    const long = await mark('adminA', PAY.a, { reference: 'R'.repeat(121) })
    const lf = await mark('adminA', PAY.a, { reference: 'abc\ndef' })
    const card = await mark('adminA', PAY.a, { reference: CARD_SHAPED })
    const note = await mark('adminA', PAY.a, { reference: '', notes: `slip ${CARD_SHAPED.replace(/ /g, '')}` })
    expect({
      long: [long.status, long.code], lf: [lf.status, lf.code], card: [card.status, card.code], note: [note.status, note.code], row: await row(PAY.a.id),
    }).toEqual({
      long: [400, 'PAYMENT_REFERENCE_INVALID'], lf: [400, 'PAYMENT_REFERENCE_INVALID'],
      card: [400, 'PAYMENT_CARD_NUMBER_REFUSED'], note: [400, 'PAYMENT_CARD_NUMBER_REFUSED'],
      row: seededRow(PAY.a),
    })
  })

  it('T-R10: audit keys are the section-7 allow-list; actor_user_id and recorded_by are the server actor even when the client sends another recordedByUserId; no impersonatedUserId when not impersonating', async () => {
    const res = await mark('adminA', PAY.a, {
      paidAt: todaySast(),
      reference: 'EFT-A2-AUD',
      recordedByUserId: USERS.tenA.fe,
      recordedByName: 'Not The Actor',
    })
    const r = await row(PAY.a.id)
    const audit = await marked(PAY.a.id)
    const payload = audit[0]?.payload ?? {}
    const keys = Object.keys(payload).sort()
    expect({
      status: res.status,
      actor: audit[0]?.actor_user_id,
      recordedBy: r?.recorded_by,
      role: payload.recordedByRole,
      impersonated: payload.impersonatedUserId ?? null,
      extra: keys.filter((k) => !AUDIT_ALLOWED.has(k)),
      missing: AUDIT_REQUIRED.filter((k) => !(k in payload)),
    }).toEqual({
      status: 200,
      actor: USERS.adminA.id,
      recordedBy: USERS.adminA.id,
      role: 'agent_admin',
      impersonated: null,
      extra: [],
      missing: [],
    })
  })

  it('T-R10b: impersonation records the real session actor and a plain impersonatedUserId; a non-plain id is not stored', async () => {
    const headers = { 'X-User-Id': USERS.adminA.fe, 'X-Role': 'agent_admin', 'X-Agency-Id': AG_A }
    const ok = await mark('superAdmin', PAY.a, { paidAt: todaySast(), reference: 'EFT-A2-IMP' }, headers)
    const audit = await marked(PAY.a.id)
    const r = await row(PAY.a.id)
    expect({
      status: ok.status,
      actor: audit[0]?.actor_user_id,
      recordedBy: r?.recorded_by,
      role: audit[0]?.payload?.recordedByRole,
      impersonated: audit[0]?.payload?.impersonatedUserId ?? null,
    }).toEqual({
      status: 200,
      actor: USERS.superAdmin.id,
      recordedBy: USERS.superAdmin.id,
      role: 'super_admin',
      impersonated: USERS.adminA.fe,
    })
    await resetLedger()
    const bad = await mark(
      'superAdmin',
      PAY.spare,
      { paidAt: todaySast(), reference: 'EFT-A2-IMP2' },
      { 'X-User-Id': 'not a valid id!!!', 'X-Role': 'agent_admin', 'X-Agency-Id': AG_A },
    )
    // A non-plain impersonation target should not store impersonatedUserId.
    // If the header fails to impersonate, the save may 403 (super_admin still
    // may write). Either way the stored key must be absent or not the junk id.
    const audit2 = await marked(PAY.spare.id)
    if (bad.status === 200) {
      expect(audit2[0]?.payload?.impersonatedUserId ?? null).toBe(null)
      expect(audit2[0]?.actor_user_id).toBe(USERS.superAdmin.id)
    } else {
      expect(audit2).toEqual([])
    }
  })

  it('T-R11: same reference on the same application, or same lease with a different amount, or same party with a different amount: no 409 and sharedReferenceCount is set', async () => {
    const first = await mark('adminA', PAY.a, { paidAt: todaySast(), reference: 'EFT-SHARED' })
    expect(first.status).toBe(200)
    const byApp = await mark('adminA', PAY.relatedApp, { paidAt: todaySast(), reference: 'EFT-SHARED' })
    expect({ status: byApp.status, count: (await marked(PAY.relatedApp.id))[0]?.payload?.sharedReferenceCount }).toEqual({ status: 200, count: 1 })
    await resetLedger()
    expect((await mark('adminA', PAY.a, { paidAt: todaySast(), reference: 'EFT-SHARED' })).status).toBe(200)
    const byLease = await mark('adminA', PAY.relatedLease, { paidAt: todaySast(), reference: 'EFT-SHARED' })
    expect({ status: byLease.status, code: byLease.code, count: (await marked(PAY.relatedLease.id))[0]?.payload?.sharedReferenceCount }).toEqual({
      status: 200, code: null, count: 1,
    })
    await resetLedger()
    expect((await mark('adminA', PAY.a, { paidAt: todaySast(), reference: 'EFT-SHARED' })).status).toBe(200)
    const byParty = await mark('adminA', PAY.samePartyDiffAmt, { paidAt: todaySast(), reference: 'EFT-SHARED' })
    expect({ status: byParty.status, count: (await marked(PAY.samePartyDiffAmt.id))[0]?.payload?.sharedReferenceCount }).toEqual({
      status: 200, count: 1,
    })
  })

  it('T-R11b: same party + same amount + same received date → 409 PAYMENT_REFERENCE_DUPLICATE', async () => {
    await q(`UPDATE payments SET created_at = TIMESTAMPTZ '2026-10-01 08:00:00+02' WHERE id = ANY($1::uuid[])`, [[PAY.a.id, PAY.samePartySameAmt.id]])
    const a = await mark('adminA', PAY.a, { paidAt: '2026-10-30', receivedDateReason: 'Captured late from statement', reference: 'EFT-DUP-P' })
    const b = await mark('adminA', PAY.samePartySameAmt, { paidAt: '2026-10-30', receivedDateReason: 'Captured late from statement', reference: 'EFT-DUP-P' })
    expect({ first: a.status, second: [b.status, b.code], unchanged: (await row(PAY.samePartySameAmt.id))?.status }).toEqual({
      first: 200, second: [409, 'PAYMENT_REFERENCE_DUPLICATE'], unchanged: 'DUE',
    })
  })

  it('T-R12: unrelated same-agency reference → 409 PAYMENT_REFERENCE_DUPLICATE; confirmDuplicateReference succeeds and the audit records it', async () => {
    const first = await mark('adminA', PAY.a, { paidAt: todaySast(), reference: 'EFT-UNREL' })
    expect(first.status).toBe(200)
    const refused = await mark('adminA', PAY.unrelated, { paidAt: todaySast(), reference: 'EFT-UNREL' })
    const others = (refused.json?.otherPayments as Array<{ id: string }> | undefined) ?? []
    expect({
      status: refused.status,
      code: refused.code,
      count: refused.json?.sharedReferenceCount,
      ids: others.map((o) => o.id),
      foreign: others.some((o) => o.id === PAY.b.fe),
      row: (await row(PAY.unrelated.id))?.status,
    }).toEqual({
      status: 409, code: 'PAYMENT_REFERENCE_DUPLICATE', count: 1, ids: [PAY.a.fe], foreign: false, row: 'DUE',
    })
    const ok = await mark('adminA', PAY.unrelated, { paidAt: todaySast(), reference: 'EFT-UNREL', confirmDuplicateReference: true })
    const audit = await marked(PAY.unrelated.id)
    expect({
      status: ok.status,
      confirmed: audit[0]?.payload?.duplicateReferenceConfirmed,
      count: audit[0]?.payload?.sharedReferenceCount,
    }).toEqual({ status: 200, confirmed: true, count: 1 })
  })

  it('T-R13: the same reference in another agency is not a duplicate; sharedReferenceCount is 0 and no foreign id is returned', async () => {
    const theirs = await mark('adminB', PAY.b, { paidAt: todaySast(), reference: 'EFT-CROSS' })
    expect(theirs.status).toBe(200)
    const ours = await mark('adminA', PAY.a, { paidAt: todaySast(), reference: 'EFT-CROSS' })
    const audit = await marked(PAY.a.id)
    expect({
      status: ours.status,
      count: audit[0]?.payload?.sharedReferenceCount,
      foreign: JSON.stringify(audit[0]?.payload ?? {}).includes(PAY.b.fe) || JSON.stringify(ours.json ?? {}).includes(PAY.b.fe),
    }).toEqual({ status: 200, count: 0, foreign: false })
  })

  it('T-R14: two concurrent unrelated saves with the same new reference: exactly one 409 without the confirm flag', async () => {
    const save = (p: PaySeed) => mark('adminA', p, { paidAt: todaySast(), reference: 'EFT-RACE' })
    const [r1, r2] = await Promise.all([save(PAY.a), save(PAY.unrelated)])
    const outcomes = [[r1.status, r1.code], [r2.status, r2.code]].sort((x, y) => Number(x[0]) - Number(y[0]))
    expect(outcomes).toEqual([[200, null], [409, 'PAYMENT_REFERENCE_DUPLICATE']])
  })

  it('T-R15: a ground agent without payments.manage sending PAID gets 403 PAYMENT_PERMISSION_REQUIRED', async () => {
    const res = await mark('groundA', PAY.a, { paidAt: todaySast(), reference: 'EFT-A2-GND' })
    expect({ status: res.status, code: res.code, row: await row(PAY.a.id) }).toEqual({
      status: 403, code: 'PAYMENT_PERMISSION_REQUIRED', row: seededRow(PAY.a),
    })
  })

  it('T-R16: a tenant proof upload stores uploadedByRole: tenant, writes one payment_proof_reported row, and leaves status unchanged', async () => {
    const res = await persist('tenA', {
      resource: 'payment',
      action: 'upsert',
      id: PAY.a.fe,
      data: {
        amount: 1,
        status: 'Paid',
        type: 'Deposit',
        partyName: 'x',
        reference: 'TENANT-EFT',
        attachments: [{ id: 'att-a2r-1', name: 'slip.png', kind: 'image', mimeType: 'image/png', dataUrl: TINY_PNG, uploadedByName: 'Forged staff', uploadedByRole: 'staff' }],
      },
    })
    const r = await q<{ status: string; reference: string | null; attachments: Array<Record<string, unknown>> }>(
      `SELECT status, reference, attachments FROM payments WHERE id = $1::uuid`,
      [PAY.a.id],
    )
    const proof = await events('payment_proof_reported', PAY.a.id)
    const roles = (r[0]?.attachments ?? []).map((a) => a.uploadedByRole)
    expect({
      status: res.status,
      rowStatus: r[0]?.status,
      reference: r[0]?.reference,
      roles,
      proofCount: proof.length,
      actor: proof[0]?.actor_user_id,
      payload: proof[0]?.payload,
    }).toEqual({
      status: 200,
      rowStatus: 'DUE',
      reference: 'TENANT-EFT',
      roles: ['tenant'],
      proofCount: 1,
      actor: USERS.tenA.id,
      payload: { attachmentCount: 1, referenceProvided: true },
    })
  })

  it('T-R19: an audit insert failure rolls back the status change', async () => {
    await q(`ALTER TABLE event_log ADD CONSTRAINT a2rec_no_mark_paid CHECK (event_type <> 'payment_marked_paid')`)
    try {
      const res = await mark('adminA', PAY.a, { paidAt: todaySast(), reference: 'EFT-A2-FAIL' })
      expect({ refused: res.status >= 400, row: await row(PAY.a.id), audit: await marked(PAY.a.id) }).toEqual({
        refused: true, row: seededRow(PAY.a), audit: [],
      })
    } finally {
      await q(`ALTER TABLE event_log DROP CONSTRAINT IF EXISTS a2rec_no_mark_paid`)
    }
  })

  it('T-R20: tenant proof on PAID or CANCELLED → 409 PAYMENT_TERMINAL and reference/notes/attachments are unchanged', async () => {
    await q(`UPDATE payments SET status = 'PAID', reference = 'STAFF-REF', notes = 'staff note' WHERE id = $1::uuid`, [PAY.a.id])
    const paid = await persist('tenA', {
      resource: 'payment', action: 'upsert', id: PAY.a.fe,
      data: { reference: 'HACKED', notes: 'changed', attachments: [{ id: 'att-x', name: 'x.png', kind: 'image', mimeType: 'image/png', dataUrl: TINY_PNG }] },
    })
    const afterPaid = await q<{ status: string; reference: string | null; notes: string | null; attachments: unknown }>(
      `SELECT status, reference, notes, attachments FROM payments WHERE id = $1::uuid`, [PAY.a.id],
    )
    await q(`UPDATE payments SET status = 'CANCELLED', reference = 'STAFF-REF', notes = 'staff note' WHERE id = $1::uuid`, [PAY.spare.id])
    const cancelled = await persist('tenA', {
      resource: 'payment', action: 'upsert', id: PAY.spare.fe,
      data: { reference: 'HACKED', notes: 'changed' },
    })
    // spare's party is tenOther — tenA cannot update it. Use a cancelled row that belongs to tenA:
    await resetLedger()
    await q(`UPDATE payments SET status = 'CANCELLED', reference = 'STAFF-REF', notes = 'staff note' WHERE id = $1::uuid`, [PAY.a.id])
    const cancelledOwn = await persist('tenA', {
      resource: 'payment', action: 'upsert', id: PAY.a.fe,
      data: { reference: 'HACKED', notes: 'changed' },
    })
    const afterCan = await q<{ status: string; reference: string | null; notes: string | null }>(
      `SELECT status, reference, notes FROM payments WHERE id = $1::uuid`, [PAY.a.id],
    )
    expect({
      paid: [paid.status, paid.code],
      afterPaid: { status: afterPaid[0]?.status, reference: afterPaid[0]?.reference, notes: afterPaid[0]?.notes },
      cancelledOwn: [cancelledOwn.status, cancelledOwn.code],
      afterCan,
    }).toEqual({
      paid: [409, 'PAYMENT_TERMINAL'],
      afterPaid: { status: 'PAID', reference: 'STAFF-REF', notes: 'staff note' },
      cancelledOwn: [409, 'PAYMENT_TERMINAL'],
      afterCan: [{ status: 'CANCELLED', reference: 'STAFF-REF', notes: 'staff note' }],
    })
    expect(cancelled.status === 403 || cancelled.status === 409 || cancelled.status >= 400).toBe(true)
  })

  it('T-R21: an ID-shaped reference is accepted; a card-shaped reference is refused', async () => {
    const idOk = await mark('adminA', PAY.a, { paidAt: todaySast(), reference: SA_ID_SHAPED })
    expect({ status: idOk.status, stored: (await row(PAY.a.id))?.reference }).toEqual({ status: 200, stored: SA_ID_SHAPED })
    const card = await mark('adminA', PAY.spare, { paidAt: todaySast(), reference: CARD_SHAPED.replace(/ /g, '') })
    expect({ status: card.status, code: card.code, row: await row(PAY.spare.id) }).toEqual({
      status: 400, code: 'PAYMENT_CARD_NUMBER_REFUSED', row: seededRow(PAY.spare),
    })
  })

  it('T-R22: an ID-shaped audit reference is the last 4 digits and referenceMasked is true', async () => {
    const res = await mark('adminA', PAY.a, { paidAt: todaySast(), reference: SA_ID_SHAPED })
    const payload = (await marked(PAY.a.id))[0]?.payload ?? {}
    expect({ status: res.status, reference: payload.reference, masked: payload.referenceMasked }).toEqual({
      status: 200, reference: SA_ID_SHAPED.slice(-4), masked: true,
    })
  })

  it('T-R23: ticked shortfall creates a balance DUE row in the same transaction; amounts sum to the original; the balance row keeps the original due date, type, unit, party, lease and application', async () => {
    const dueBefore = await dueCount(PAY.a.id)
    const res = await mark('adminA', PAY.a, {
      paidAt: todaySast(),
      reference: 'EFT-A2-PART',
      paidAmount: 12000,
      amountChangeReason: 'Partial payment',
      createBalanceForShortfall: true,
    })
    const paid = await row(PAY.a.id)
    const extras = await q<Row>(
      `SELECT amount::text AS amount, paid_amount::text AS paid_amount, status, client_id::text AS client_id,
              unit_id::text AS unit_id, party_user_id::text AS party_user_id,
              lease_id::text AS lease_id, application_id::text AS application_id, payment_type,
              to_char((paid_at AT TIME ZONE 'Africa/Johannesburg')::date, 'YYYY-MM-DD') AS paid_at_sast,
              method, reference, notes, due_date::text AS due_date, recorded_by::text AS recorded_by
         FROM payments WHERE client_id = $1::uuid AND id <> $2::uuid AND status = 'DUE' AND amount = 8000`,
      [A, PAY.a.id],
    )
    const audit = await marked(PAY.a.id)
    const balance = extras[0]
    expect({
      status: res.status,
      paidAmount: paid?.amount,
      paidStatus: paid?.status,
      paidReceived: paid?.paid_amount,
      extras: extras.length,
      dueAfter: await dueCount(PAY.a.id),
      sum: Number(paid?.amount) + Number(balance?.amount),
      dueDate: balance?.due_date,
      type: balance?.payment_type,
      unit: balance?.unit_id,
      party: balance?.party_user_id,
      lease: balance?.lease_id,
      application: balance?.application_id,
      originalAmountCents: audit[0]?.payload?.originalAmountCents,
      balanceCents: audit[0]?.payload?.balanceCents,
      hasBalanceId: Boolean(audit[0]?.payload?.balancePaymentId),
    }).toEqual({
      status: 200,
      paidAmount: '12000.00',
      paidStatus: 'PAID',
      paidReceived: '12000.00',
      extras: 1,
      dueAfter: dueBefore + 1,
      sum: 20000,
      dueDate: '2026-11-01',
      type: 'DEPOSIT',
      unit: UNIT.a1.id,
      party: USERS.tenA.id,
      lease: LEASE.a1.id,
      application: APP.a1.id,
      originalAmountCents: 2000000,
      balanceCents: 800000,
      hasBalanceId: true,
    })
    // P-17 mutant: setting the balance row's due date to today must go red.
    expect(balance?.due_date).not.toBe(todaySast())
    expect(balance?.due_date).toBe('2026-11-01')
  })

  it('T-R24: an audit failure rolls back both the paid row and the balance row', async () => {
    const dueBefore = await dueCount()
    await q(`ALTER TABLE event_log ADD CONSTRAINT a2rec_no_mark_paid CHECK (event_type <> 'payment_marked_paid')`)
    try {
      const res = await mark('adminA', PAY.a, {
        paidAt: todaySast(),
        reference: 'EFT-A2-BOTH',
        paidAmount: 12000,
        amountChangeReason: 'Partial payment',
        createBalanceForShortfall: true,
      })
      expect({
        refused: res.status >= 400,
        paid: await row(PAY.a.id),
        dueAfter: await dueCount(),
        audit: await marked(PAY.a.id),
      }).toEqual({
        refused: true,
        paid: seededRow(PAY.a),
        dueAfter: dueBefore,
        audit: [],
      })
    } finally {
      await q(`ALTER TABLE event_log DROP CONSTRAINT IF EXISTS a2rec_no_mark_paid`)
    }
  })

  it('T-R25: unticked shortfall without shortfallReason → 400; the row stays DUE', async () => {
    const res = await mark('adminA', PAY.a, {
      paidAt: todaySast(),
      reference: 'EFT-A2-SHORT',
      paidAmount: 12000,
      amountChangeReason: 'Partial payment',
      createBalanceForShortfall: false,
    })
    expect({ status: res.status, code: res.code, row: await row(PAY.a.id) }).toEqual({
      status: 400, code: 'PAYMENT_AMOUNT_REASON_REQUIRED', row: seededRow(PAY.a),
    })
  })

  it('T-R26: a full payment does not create a balance row even when createBalanceForShortfall is sent', async () => {
    const dueBefore = await dueCount(PAY.a.id)
    const res = await mark('adminA', PAY.a, {
      paidAt: todaySast(),
      reference: 'EFT-A2-FULL',
      paidAmount: 20000,
      createBalanceForShortfall: true,
    })
    const extras = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM payments WHERE client_id = $1::uuid AND id <> $2::uuid AND amount = 0`,
      [A, PAY.a.id],
    )
    expect({
      status: res.status,
      paid: (await row(PAY.a.id))?.status,
      dueAfter: await dueCount(PAY.a.id),
      zeroRows: extras[0]?.n,
      balanceId: (await marked(PAY.a.id))[0]?.payload?.balancePaymentId ?? null,
    }).toEqual({
      status: 200, paid: 'PAID', dueAfter: dueBefore, zeroRows: '0', balanceId: null,
    })
  })

  it('Q-R1: Debit order / Instant EFT / Cheque / Card on mark-paid map to EFT / EFT / OTHER / CARD_AT_OFFICE', async () => {
    const debit = await mark('adminA', PAY.a, { method: 'Debit order', reference: 'EFT-A2-DO', paidAt: todaySast() })
    expect({ status: debit.status, method: (await row(PAY.a.id))?.method }).toEqual({ status: 200, method: 'EFT' })
    await resetLedger()
    const instant = await mark('adminA', PAY.a, { method: 'Instant EFT', reference: 'EFT-A2-IE', paidAt: todaySast() })
    expect({ status: instant.status, method: (await row(PAY.a.id))?.method }).toEqual({ status: 200, method: 'EFT' })
    await resetLedger()
    const cheque = await mark('adminA', PAY.a, {
      method: 'Cheque', reference: 'CHQ-1', notes: 'Cheque cleared at the office', paidAt: todaySast(),
    })
    expect({ status: cheque.status, method: (await row(PAY.a.id))?.method }).toEqual({ status: 200, method: 'OTHER' })
    await resetLedger()
    const card = await mark('adminA', PAY.a, { method: 'Card', reference: 'CARD-SLIP-9', paidAt: todaySast() })
    expect({ status: card.status, method: (await row(PAY.a.id))?.method }).toEqual({ status: 200, method: 'CARD_AT_OFFICE' })
  })

  it('Q-R4/Angela: CASH with only a fresh note keeps the stored payments.reference (does not write null)', async () => {
    await q(`UPDATE payments SET reference = 'STORED-REF-1' WHERE id = $1::uuid`, [PAY.a.id])
    const res = await mark('adminA', PAY.a, {
      method: 'CASH',
      reference: '',
      notes: 'receipt 4411',
      paidAt: todaySast(),
    })
    const r = await row(PAY.a.id)
    expect({ status: res.status, paid: r?.status, reference: r?.reference, method: r?.method }).toEqual({
      status: 200, paid: 'PAID', reference: 'STORED-REF-1', method: 'CASH',
    })
  })

  it('mutant pin: CASH note-only preserve would fail if plan.reference stayed null', async () => {
    await q(`UPDATE payments SET reference = 'KEEP-ME' WHERE id = $1::uuid`, [PAY.a.id])
    const res = await mark('adminA', PAY.a, { method: 'CASH', reference: '', notes: 'cash slip 99', paidAt: todaySast() })
    expect(res.status).toBe(200)
    expect((await row(PAY.a.id))?.reference).toBe('KEEP-ME')
    expect((await row(PAY.a.id))?.reference).not.toBeNull()
  })
})
