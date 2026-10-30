import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Slice A (payment write guard), our tests: only what Angela's file does not
 * cover. Her file is server/persist.ledgerAuth.pg.test.ts (commit 1 sha256
 * c5d3ed9ce36b353883aebbeefb8390d0eb8e0b43c2ea7834fba7c450a31153cc, plus her
 * follow-up patch in commit 2); this file reuses her harness pattern with its
 * own ids so the two never share a row:
 *   client uuids e0170000-… (agency A) / f0170000-… (agency B), subdomains
 *   sla-a / sla-b, FE ids *-sla-*, payments PAY-slaX, login XFF 10.88.0.x.
 *
 * Plans: build-plan-slice-a.md §5.4 and addendum1 / addendum2 / record-only
 * delta. Every PAID row here is set up by a direct SQL UPDATE or a staff
 * mark-paid save, with neutral references (EFT-SLA-n).
 *
 * Real Hono app (PF_SKIP_SERVE=1), real /api/auth/login sessions, NODE_ENV
 * production (no demo actor), real Postgres from PF_TEST_PG_URL (a THROWAWAY
 * scratch database only). TA4b and the writer-level delete call handlePersist
 * directly, as the race backstop the gate cannot reach.
 *
 * RUN THIS FILE ON ITS OWN (vitest run --no-file-parallelism, or one scratch
 * DB per file): TA11 adds a CHECK constraint, TA4-del adds a trigger, and
 * several tests compare counts over the whole payments / event_log tables.
 */
const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  // Dummy signing secret for this test process only (not a credential).
  process.env.AUTH_SECRET = ['slice', 'a', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})

/** Test-only password fixture, built at runtime (not a credential). */
const TEST_FIXTURE_PW = ['test', 'fixture', 'pw'].join('-')

const A = 'e0170000-0000-4000-8000-00000000000a'
const B = 'f0170000-0000-4000-8000-00000000000b'
const AG_A = 'ag-sla-a'
const AG_B = 'ag-sla-b'
const u = (agency: 'e' | 'f', n: number) => `${agency}0170001-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const USERS = {
  adminA: { id: u('e', 1), fe: 'u-sla-admin-a', client: A as string | null, role: 'AGENT_ADMIN', meta: {} },
  groundA: { id: u('e', 2), fe: 'u-sla-ground-a', client: A as string | null, role: 'GROUND_AGENT', meta: {} },
  groundP: { id: u('e', 3), fe: 'u-sla-groundp-a', client: A as string | null, role: 'GROUND_AGENT', meta: { permissionsVersion: 2 } as Record<string, unknown> },
  candA: { id: u('e', 4), fe: 'u-sla-cand-a', client: A as string | null, role: 'END_USER', meta: { frontend_role: 'agent' } },
  tenA: { id: u('e', 5), fe: 'u-sla-tenant-a', client: A as string | null, role: 'END_USER', meta: {} },
  applicantA: { id: u('e', 6), fe: 'u-sla-applicant-a', client: A as string | null, role: 'END_USER', meta: {} },
  llA: { id: u('e', 7), fe: 'u-sla-landlord-a', client: A as string | null, role: 'LANDLORD', meta: {} },
  superAdmin: { id: u('e', 8), fe: 'u-sla-super', client: null as string | null, role: 'SUPER_ADMIN', meta: {} },
  tenB: { id: u('f', 1), fe: 'u-sla-tenant-b', client: B as string | null, role: 'END_USER', meta: {} },
  llB: { id: u('f', 2), fe: 'u-sla-landlord-b', client: B as string | null, role: 'LANDLORD', meta: {} },
} as const
type UserKey = keyof typeof USERS
const BLD_A = 'e0170003-0000-4000-8000-000000000001'
const BLD_B = 'f0170003-0000-4000-8000-000000000001'
/** Unit A1 is groundA's, A2 is groundP's, A3 is the candidate agent's; B1 is agency B's. */
const UNIT = {
  a1: { id: 'e0170002-0000-4000-8000-000000000001', fe: 'p-sla-a1', client: A, agent: USERS.groundA.id },
  a2: { id: 'e0170002-0000-4000-8000-000000000002', fe: 'p-sla-a2', client: A, agent: USERS.groundP.id },
  a3: { id: 'e0170002-0000-4000-8000-000000000003', fe: 'p-sla-a3', client: A, agent: USERS.candA.id },
  b1: { id: 'f0170002-0000-4000-8000-000000000001', fe: 'p-sla-b1', client: B, agent: null as string | null },
} as const
const APP = {
  a1: { id: 'e0170005-0000-4000-8000-000000000001', fe: 'APP-slaA1', client: A, unit: UNIT.a1.id, applicant: USERS.applicantA.id, agent: USERS.groundA.id },
  a2: { id: 'e0170005-0000-4000-8000-000000000002', fe: 'APP-slaA2', client: A, unit: UNIT.a2.id, applicant: USERS.applicantA.id, agent: USERS.groundP.id },
  a3: { id: 'e0170005-0000-4000-8000-000000000003', fe: 'APP-slaA3', client: A, unit: UNIT.a3.id, applicant: USERS.applicantA.id, agent: USERS.candA.id },
  b1: { id: 'f0170005-0000-4000-8000-000000000001', fe: 'APP-slaB1', client: B, unit: UNIT.b1.id, applicant: USERS.tenB.id, agent: null as string | null },
} as const
const LEASE_B = { id: 'f0170006-0000-4000-8000-000000000001', fe: 'ten-slaB1' } as const
/** Seeded DUE payments of R20 000.00: [uuid, FE id, agency, unit, party]. */
const PAY = {
  a: { id: 'e0170004-0000-4000-8000-000000000001', fe: 'PAY-slaA001', client: A, unit: UNIT.a1.id as string | null, party: USERS.tenA.id },
  a2: { id: 'e0170004-0000-4000-8000-000000000002', fe: 'PAY-slaA002', client: A, unit: UNIT.a1.id as string | null, party: USERS.tenA.id },
  ap: { id: 'e0170004-0000-4000-8000-000000000003', fe: 'PAY-slaA003', client: A, unit: UNIT.a2.id as string | null, party: USERS.tenA.id },
  b: { id: 'f0170004-0000-4000-8000-000000000001', fe: 'PAY-slaB001', client: B, unit: UNIT.b1.id as string | null, party: USERS.tenB.id },
} as const
const SEEDED_AMOUNT = '20000.00'
const AUDIT_TYPES = ['payment_marked_paid', 'payment_amount_changed', 'payment_cancelled_by_staff'] as const
const AUDIT_ROW = (n: number) => `e0170007-0000-4000-8000-00000000000${n}`

type Row = {
  amount: string
  paid_amount: string | null
  status: string
  client_id: string
  unit_id: string | null
  party_user_id: string | null
  paid_at: string | null
  reference: string | null
  notes: string | null
  due_date: string
}
type App = { request: (path: string, init?: RequestInit) => Promise<Response> }

describe.skipIf(!url)('Slice A (ours): payment write guard via the real app, session and Postgres', () => {
  let db: typeof import('./db.js')
  let app: App
  const tokens: Partial<Record<UserKey, string>> = {}
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)

  const row = async (id: string): Promise<Row | undefined> =>
    (await q<Row>(
      `SELECT amount::text AS amount, paid_amount::text AS paid_amount, status, client_id::text AS client_id,
              unit_id::text AS unit_id, party_user_id::text AS party_user_id, paid_at::text AS paid_at,
              reference, notes, due_date::text AS due_date
         FROM payments WHERE id = $1::uuid`,
      [id],
    ))[0]
  const seededRow = (p: (typeof PAY)[keyof typeof PAY]): Row => ({
    amount: SEEDED_AMOUNT,
    paid_amount: null,
    status: 'DUE',
    client_id: p.client,
    unit_id: p.unit,
    party_user_id: p.party,
    paid_at: null,
    reference: null,
    notes: null,
    due_date: '2026-11-01',
  })
  const payCount = async () => Number((await q<{ n: string }>(`SELECT count(*)::text AS n FROM payments`))[0]!.n)
  const createdBy = async (fe: string) =>
    q<{ client_id: string; unit_id: string | null; amount: string; status: string; payment_type: string }>(
      `SELECT p.client_id::text AS client_id, p.unit_id::text AS unit_id, p.amount::text AS amount, p.status, p.payment_type
         FROM payments p JOIN entity_id_map m ON m.backend_id = p.id AND m.entity_type = 'payment' WHERE m.frontend_id = $1`,
      [fe],
    )
  const mapped = async (fe: string) =>
    (await q<{ n: string }>(`SELECT count(*)::text AS n FROM entity_id_map WHERE entity_type = 'payment' AND frontend_id = $1`, [fe]))[0]!.n
  const events = async (type: string, subject?: string) =>
    q<{ client_id: string | null; subject_type: string; subject_id: string | null; actor_user_id: string | null; payload: Record<string, unknown> }>(
      `SELECT client_id::text AS client_id, subject_type, subject_id::text AS subject_id, actor_user_id::text AS actor_user_id, payload
         FROM event_log WHERE event_type = $1 AND ($2::uuid IS NULL OR subject_id = $2::uuid) ORDER BY created_at`,
      [type, subject ?? null],
    )
  const paymentAuditCount = async (subject: string) =>
    Number((await q<{ n: string }>(`SELECT count(*)::text AS n FROM event_log WHERE event_type LIKE 'payment\\_%' AND subject_id = $1::uuid`, [subject]))[0]!.n)

  async function cleanup() {
    const clients = [A, B]
    const unitIds = Object.values(UNIT).map((x) => x.id)
    await q(`DROP TRIGGER IF EXISTS sla_map_delete_fail ON entity_id_map`)
    await q(`DROP FUNCTION IF EXISTS sla_map_delete_fail()`)
    await q(`ALTER TABLE event_log DROP CONSTRAINT IF EXISTS sla_no_cancel_audit`)
    await q(`DELETE FROM payments WHERE client_id = ANY($1::uuid[]) OR unit_id = ANY($2::uuid[])`, [clients, unitIds])
    await q(`DELETE FROM event_log WHERE client_id = ANY($1::uuid[]) OR id::text LIKE 'e0170007-%'`, [clients])
    await q(`DELETE FROM leases WHERE client_id = ANY($1::uuid[])`, [clients])
    await q(`DELETE FROM applications WHERE client_id = ANY($1::uuid[])`, [clients])
    await q(
      `DELETE FROM entity_id_map WHERE frontend_id LIKE 'APP-sla%' OR frontend_id LIKE 'PAY-sla%' OR frontend_id LIKE 'u-sla-%'
          OR frontend_id LIKE 'p-sla-%' OR frontend_id LIKE 'ten-sla%' OR frontend_id IN ($1, $2)
          OR backend_id::text LIKE 'e0170007-%'`,
      [AG_A, AG_B],
    )
    await q(`DELETE FROM units WHERE id = ANY($1::uuid[])`, [unitIds])
    await q(`DELETE FROM buildings WHERE id IN ($1::uuid, $2::uuid)`, [BLD_A, BLD_B])
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [Object.values(USERS).map((x) => x.id)])
    await q(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [clients])
  }

  /** Every test starts from the same DUE payments, applications and lease. */
  async function resetLedger() {
    const unitIds = Object.values(UNIT).map((x) => x.id)
    await q(`DELETE FROM payments WHERE client_id = ANY($1::uuid[]) OR unit_id = ANY($2::uuid[])`, [[A, B], unitIds])
    await q(`DELETE FROM entity_id_map WHERE entity_type = 'payment' AND frontend_id LIKE 'PAY-sla%'`)
    await q(`DELETE FROM event_log WHERE client_id = ANY($1::uuid[]) OR id::text LIKE 'e0170007-%'`, [[A, B]])
    await q(`DELETE FROM entity_id_map WHERE backend_id::text LIKE 'e0170007-%'`)
    for (const p of Object.values(PAY)) {
      await q(
        `INSERT INTO payments (id, client_id, unit_id, party_user_id, party_name, payment_type, amount, status, due_date)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'Tenant', 'DEPOSIT', 20000, 'DUE', DATE '2026-11-01')`,
        [p.id, p.client, p.unit, p.party],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('payment', $1, $2::uuid)`, [p.fe, p.id])
    }
    await q(`DELETE FROM leases WHERE client_id = ANY($1::uuid[])`, [[A, B]])
    await q(`DELETE FROM applications WHERE client_id = ANY($1::uuid[])`, [[A, B]])
    let n = 1
    for (const a of Object.values(APP)) {
      await q(
        `INSERT INTO applications (id, client_id, unit_id, applicant_id, agent_id, reference_code, application_type, status, submitted_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, 'RENTAL', 'UNDER_REVIEW', NOW())`,
        [a.id, a.client, a.unit, a.applicant, a.agent, `SLA-${n++}`],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('application', $1, $2::uuid) ON CONFLICT DO NOTHING`, [a.fe, a.id])
    }
    await q(
      `INSERT INTO leases (id, client_id, unit_id, tenant_id, lease_reference, status, start_date, rent_amount)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'SLA-L-B1', 'ACTIVE', DATE '2026-01-01', 10000)`,
      [LEASE_B.id, B, UNIT.b1.id, USERS.tenB.id],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('tenancy', $1, $2::uuid) ON CONFLICT DO NOTHING`, [LEASE_B.fe, LEASE_B.id])
    await q(`UPDATE clients SET settings = '{}'::jsonb WHERE id = $1::uuid`, [A])
  }

  async function login(key: UserKey, n: number): Promise<string> {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.88.0.${n}` },
      body: JSON.stringify({ email: `${USERS[key].fe}@example.test`, password: TEST_FIXTURE_PW }),
    })
    expect(res.status, `login ${key}`).toBe(200)
    return ((await res.json()) as { token: string }).token
  }

  async function post(path: string, who: UserKey | null, body: Record<string, unknown>) {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (who) headers.Authorization = `Bearer ${tokens[who]}`
    const res = await app.request(path, { method: 'POST', headers, body: JSON.stringify(body) })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { status: res.status, code: (json?.code as string | undefined) ?? null, json }
  }
  const persist = (who: UserKey | null, body: Record<string, unknown>) => post('/api/persist', who, body)
  /** The full staff copy of a seeded A payment, as the browser sends it. */
  const staffCopy = (p: (typeof PAY)[keyof typeof PAY], prop: string, extra: Record<string, unknown> = {}) => ({
    amount: 20000, status: 'Due', type: 'Deposit', partyName: 'Tenant', dueDate: '2026-11-01', agencyId: p.client === A ? AG_A : AG_B, propertyId: prop, partyUserId: USERS.tenA.fe, ...extra,
  })
  /** A browser-built approval entry row (applicationStatusApi / persistApprovedApplication shape). */
  const entryRow = (fe: string, app: (typeof APP)[keyof typeof APP], prop: string, extra: Record<string, unknown> = {}) => ({
    id: fe, type: 'Deposit', amount: 20000, status: 'Due', dueDate: '2026-11-04', agencyId: AG_A, propertyId: prop, applicationId: app.fe, partyUserId: USERS.applicantA.fe, partyName: 'Applicant', ...extra,
  })
  const ADMIN_A_IDS: string[] = [USERS.adminA.id, USERS.adminA.fe]
  const markPaid = async (id: string, status: string, reference: string | null) =>
    q(`UPDATE payments SET status = $2, paid_at = TIMESTAMPTZ '2026-10-29 10:00:00+00', paid_amount = amount, reference = $3 WHERE id = $1::uuid`, [id, status, reference])

  beforeAll(async () => {
    db = await import('./db.js')
    await cleanup()
    await q(
      `INSERT INTO clients (id, company_name, subdomain) VALUES ($1::uuid, 'SLA Agency A', 'sla-a'), ($2::uuid, 'SLA Agency B', 'sla-b')`,
      [A, B],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid), ('agency', $3, $4::uuid)`, [AG_A, A, AG_B, B])
    const { hashPassword } = await import('./auth.js')
    const { rolePermissions } = await import('../src/lib/permissions.js')
    USERS.groundP.meta.enabledPermissions = [...rolePermissions.ground_agent, 'payments.manage']
    const hash = await hashPassword(TEST_FIXTURE_PW)
    for (const x of Object.values(USERS)) {
      await q(
        `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'Sla', 'Test', $5, TRUE, $6::jsonb)`,
        [x.id, x.client, `${x.fe}@example.test`, hash, x.role, JSON.stringify({ mustChangePassword: false, ...x.meta })],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [x.fe, x.id])
    }
    await q(
      `INSERT INTO buildings (id, client_id, name, address, city, province, landlord_id)
       VALUES ($1::uuid, $2::uuid, 'SLA A', '1 A St', 'Gqeberha', 'EC', $3::uuid), ($4::uuid, $5::uuid, 'SLA B', '1 B St', 'Gqeberha', 'EC', $6::uuid)`,
      [BLD_A, A, USERS.llA.id, BLD_B, B, USERS.llB.id],
    )
    let n = 1
    for (const x of Object.values(UNIT)) {
      await q(
        `INSERT INTO units (id, building_id, client_id, unit_number, listing_type, rent, agent_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'RENT', 10000, $5::uuid)`,
        [x.id, x.client === A ? BLD_A : BLD_B, x.client, String(n++), x.agent],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('property', $1, $2::uuid)`, [x.fe, x.id])
    }
    await resetLedger()
    app = (await import('./index.js')).default as unknown as App
    let ip = 1
    for (const key of ['adminA', 'groundA', 'groundP', 'candA', 'superAdmin'] as const) tokens[key] = await login(key, ip++)
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

  it('SESSION CONTROL (green on main): the seeded sessions resolve to agent_admin, ground_agent (x2), candidate agent and super_admin', async () => {
    const role = async (k: UserKey) => {
      const r = await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${tokens[k]}` } })
      return ((await r.json()) as { user: { role: string } }).user.role
    }
    expect([await role('adminA'), await role('groundA'), await role('groundP'), await role('candA'), await role('superAdmin')]).toEqual([
      'agent_admin', 'ground_agent', 'ground_agent', 'agent', 'super_admin',
    ])
  })

  // ---- TB-mixed (plan §5.4, Q11): /api/persist/batch stays a non-transactional loop of per-op transactions.
  it('TB-mixed RED (a): batch [A\'s valid DUE edit, then A\'s rewrite of B\'s payment] is 403 PAYMENT_AGENCY_MISMATCH; B unchanged, A\'s edit IS committed', async () => {
    const res = await post('/api/persist/batch', 'adminA', {
      ops: [
        { resource: 'payment', action: 'upsert', id: PAY.a.fe, data: staffCopy(PAY.a, UNIT.a1.fe, { dueDate: '2026-11-20', notes: 'batch edit' }) },
        { resource: 'payment', action: 'upsert', id: PAY.b.fe, data: { amount: 1, status: 'Paid', type: 'Deposit', partyName: 'x', dueDate: '2026-11-01', agencyId: AG_A, propertyId: UNIT.a1.fe, reference: 'EFT-SLA-1' } },
      ],
    })
    expect({ status: res.status, code: res.code, a: await row(PAY.a.id), b: await row(PAY.b.id) }).toEqual({
      status: 403, code: 'PAYMENT_AGENCY_MISMATCH', a: { ...seededRow(PAY.a), due_date: '2026-11-20', notes: 'batch edit' }, b: seededRow(PAY.b),
    })
  })

  it('TB-mixed RED (b): batch [a stale Overdue save on a PAID row, then a valid edit] is 409 PAYMENT_TERMINAL and the second op does not run', async () => {
    await markPaid(PAY.a2.id, 'PAID', 'EFT-SLA-2')
    const paid = await row(PAY.a2.id)
    const res = await post('/api/persist/batch', 'adminA', {
      ops: [
        { resource: 'payment', action: 'upsert', id: PAY.a2.fe, data: staffCopy(PAY.a2, UNIT.a1.fe, { status: 'Overdue', paidAt: null }) },
        { resource: 'payment', action: 'upsert', id: PAY.a.fe, data: staffCopy(PAY.a, UNIT.a1.fe, { notes: 'second op' }) },
      ],
    })
    expect({ status: res.status, code: res.code, a2: await row(PAY.a2.id), a: await row(PAY.a.id) }).toEqual({
      status: 409, code: 'PAYMENT_TERMINAL', a2: paid, a: seededRow(PAY.a),
    })
  })

  // ---- TA3c: the ground-agent exception edges (A2). Each is a NEW row by groundA on their own unit a1.
  const exceptionEdges: Array<[string, Record<string, unknown>, string]> = [
    ['status Paid', { status: 'Paid', reference: 'EFT-SLA-3' }, 'PAYMENT_PERMISSION_REQUIRED'],
    ['type Rent', { type: 'Rent' }, 'PAYMENT_PERMISSION_REQUIRED'],
    ['a method already set', { method: 'EFT' }, 'PAYMENT_PERMISSION_REQUIRED'],
    ['partyUserId not the applicant', { partyUserId: USERS.tenA.fe }, 'PAYMENT_APPLICATION_MISMATCH'],
    ['an applicationId on another unit', { applicationId: APP.a2.fe }, 'PAYMENT_APPLICATION_MISMATCH'],
  ]
  exceptionEdges.forEach(([name, extra, code], i) => {
    it(`TA3c RED (${name}): ground_agent creates an entry row with ${name}: 403 ${code} and nothing stored`, async () => {
      const fe = `PAY-slaX3c${i}`
      const before = await payCount()
      const res = await persist('groundA', { resource: 'payment', action: 'upsert', id: fe, data: entryRow(fe, APP.a1, UNIT.a1.fe, extra) })
      expect({ status: res.status, code: res.code, stored: await createdBy(fe), n: await payCount() }).toEqual({ status: 403, code, stored: [], n: before })
    })
  })

  it('TA3c CONTROL (green on main, must stay green; R22.3): ground_agent creates a Sale Deposit DUE entry row on their own application: 200, stored DUE', async () => {
    const fe = 'PAY-slaX3cS'
    const res = await persist('groundA', { resource: 'payment', action: 'upsert', id: fe, data: entryRow(fe, APP.a1, UNIT.a1.fe, { type: 'Sale Deposit' }) })
    expect({ status: res.status, stored: await createdBy(fe) }).toEqual({
      status: 200, stored: [{ client_id: A, unit_id: UNIT.a1.id, amount: '20000.00', status: 'DUE', payment_type: 'SALE_DEPOSIT' }],
    })
  })

  // ---- TA3 row for the candidate 'agent' role (Jim sign-off 8): same as ground_agent.
  it('TA3-agent RED: candidate agent: exception create on their own application is 200; an update of that row and a PAID save are 403 PAYMENT_PERMISSION_REQUIRED', async () => {
    const fe = 'PAY-slaXag1'
    const create = await persist('candA', { resource: 'payment', action: 'upsert', id: fe, data: entryRow(fe, APP.a3, UNIT.a3.fe) })
    const created = await createdBy(fe)
    const update = await persist('candA', { resource: 'payment', action: 'upsert', id: fe, data: entryRow(fe, APP.a3, UNIT.a3.fe, { dueDate: '2026-12-01' }) })
    const paid = await persist('candA', { resource: 'payment', action: 'upsert', id: fe, data: entryRow(fe, APP.a3, UNIT.a3.fe, { status: 'Paid', reference: 'EFT-SLA-4' }) })
    expect({ create: create.status, created, update: [update.status, update.code], paid: [paid.status, paid.code], after: await createdBy(fe) }).toEqual({
      create: 200,
      created: [{ client_id: A, unit_id: UNIT.a3.id, amount: '20000.00', status: 'DUE', payment_type: 'DEPOSIT' }],
      update: [403, 'PAYMENT_PERMISSION_REQUIRED'],
      paid: [403, 'PAYMENT_PERMISSION_REQUIRED'],
      after: [{ client_id: A, unit_id: UNIT.a3.id, amount: '20000.00', status: 'DUE', payment_type: 'DEPOSIT' }],
    })
  })

  // ---- TA2c (kills MA2) and the foreign application / lease (A1, SHOULD 4).
  it('TA2c RED: super_admin creates with agencyId B on A\'s unit: 403 PAYMENT_AGENCY_MISMATCH and nothing stored', async () => {
    const fe = 'PAY-slaX2c1'
    const before = await payCount()
    const res = await persist('superAdmin', {
      resource: 'payment', action: 'upsert', id: fe,
      data: { id: fe, amount: 300, status: 'Due', type: 'Other', partyName: 'x', dueDate: '2026-11-01', agencyId: AG_B, propertyId: UNIT.a1.fe },
    })
    expect({ status: res.status, code: res.code, stored: await createdBy(fe), n: await payCount() }).toEqual({ status: 403, code: 'PAYMENT_AGENCY_MISMATCH', stored: [], n: before })
  })

  it('TA2c RED (application): agent_admin of A creates on A\'s unit naming agency B\'s application: 403 PAYMENT_APPLICATION_MISMATCH and nothing stored', async () => {
    const fe = 'PAY-slaX2c2'
    const res = await persist('adminA', { resource: 'payment', action: 'upsert', id: fe, data: entryRow(fe, APP.b1, UNIT.a1.fe, { partyUserId: USERS.tenB.fe }) })
    expect({ status: res.status, code: res.code, stored: await createdBy(fe) }).toEqual({ status: 403, code: 'PAYMENT_APPLICATION_MISMATCH', stored: [] })
  })

  it('SHOULD4 RED: agent_admin of A creates on A\'s unit naming agency B\'s lease as tenancyId: 403 PAYMENT_APPLICATION_MISMATCH and nothing stored', async () => {
    const fe = 'PAY-slaXs41'
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: fe,
      data: { id: fe, amount: 10000, status: 'Due', type: 'Rent', partyName: 'x', dueDate: '2026-11-01', agencyId: AG_A, propertyId: UNIT.a1.fe, tenancyId: LEASE_B.fe },
    })
    expect({ status: res.status, code: res.code, stored: await createdBy(fe) }).toEqual({ status: 403, code: 'PAYMENT_APPLICATION_MISMATCH', stored: [] })
  })

  // ---- TA1-unitless (MUST 1 + MUST 6): pins the code on Angela's J-U1.
  for (const via of ['PAY- id', 'uuid'] as const) {
    it(`TA1-unitless RED by ${via}: agent_admin of A rewrites B's unit-less payment with A's agency and property: 403 PAYMENT_AGENCY_MISMATCH, B's row unchanged`, async () => {
      await q(`UPDATE payments SET unit_id = NULL WHERE id = $1::uuid`, [PAY.b.id])
      const id = via === 'uuid' ? PAY.b.id : PAY.b.fe
      const res = await persist('adminA', {
        resource: 'payment', action: 'upsert', id,
        data: { id, amount: 1, status: 'Paid', type: 'Deposit', partyName: 'x', dueDate: '2026-11-01', agencyId: AG_A, propertyId: UNIT.a1.fe, reference: 'EFT-SLA-5' },
      })
      expect({ status: res.status, code: res.code, row: await row(PAY.b.id) }).toEqual({ status: 403, code: 'PAYMENT_AGENCY_MISMATCH', row: { ...seededRow(PAY.b), unit_id: null } })
    })
  }

  // ---- TA2-ghost and the J-U2 code pins (MUST 2, addendum2 note 6).
  const ghostCreates: Array<[string, Record<string, unknown>]> = [
    ['TA2-ghost: unresolved propertyId + agencyId B', { agencyId: AG_B, propertyId: 'p-does-not-exist' }],
    ['J-U2a code: unresolved propertyId + agencyId A', { agencyId: AG_A, propertyId: 'p-does-not-exist' }],
    ['J-U2b code: agency B\'s unit by raw uuid + agencyId A', { agencyId: AG_A, propertyId: UNIT.b1.id }],
    ['J-U2c code: a uuid that is no unit + agencyId A', { agencyId: AG_A, propertyId: 'e0170002-0000-4000-8000-0000000000ff' }],
  ]
  ghostCreates.forEach(([name, extra], i) => {
    it(`${name} RED: agent_admin of A creates: 403 PAYMENT_AGENCY_MISMATCH and nothing stored`, async () => {
      const fe = `PAY-slaXgh${i}`
      const before = await payCount()
      const res = await persist('adminA', {
        resource: 'payment', action: 'upsert', id: fe,
        data: { id: fe, amount: 777, status: 'Due', type: 'Other', partyName: 'x', dueDate: '2026-11-01', ...extra },
      })
      expect({ status: res.status, code: res.code, stored: await createdBy(fe), n: await payCount() }).toEqual({ status: 403, code: 'PAYMENT_AGENCY_MISMATCH', stored: [], n: before })
    })
  })

  it('A1 RED (no propertyId): agent_admin of A creates a unit-less payment in agency B\'s ledger: 403 PAYMENT_AGENCY_MISMATCH and nothing stored', async () => {
    const fe = 'PAY-slaXnoB'
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: fe,
      data: { id: fe, amount: 500, status: 'Due', type: 'Other', partyName: 'x', dueDate: '2026-11-01', agencyId: AG_B },
    })
    expect({ status: res.status, code: res.code, stored: await createdBy(fe) }).toEqual({ status: 403, code: 'PAYMENT_AGENCY_MISMATCH', stored: [] })
  })

  // ---- TA4b (kills MA5): the writer's ON CONFLICT ... WHERE is the backstop the gate cannot bypass.
  it('TA4b RED: a direct handlePersist upsert on a PAID row (no gate) is 409 PAYMENT_TERMINAL and the row is kept', async () => {
    await markPaid(PAY.a2.id, 'PAID', 'EFT-SLA-6')
    const paid = await row(PAY.a2.id)
    const { handlePersist } = await import('./writes.js')
    const err = await handlePersist(
      { resource: 'payment', action: 'upsert', id: PAY.a2.fe, data: staffCopy(PAY.a2, UNIT.a1.fe, { status: 'Overdue', paidAt: null }) },
      USERS.adminA.fe,
      'agent_admin',
    ).then(() => null, (e: { status?: number; code?: string }) => ({ status: e.status, code: e.code }))
    expect({ err, row: await row(PAY.a2.id) }).toEqual({ err: { status: 409, code: 'PAYMENT_TERMINAL' }, row: paid })
  })

  it('TA4b RED (CANCELLED): a direct handlePersist upsert on a CANCELLED row is 409 PAYMENT_CANCELLED and the row is kept', async () => {
    await q(`UPDATE payments SET status = 'CANCELLED' WHERE id = $1::uuid`, [PAY.a2.id])
    const cancelled = await row(PAY.a2.id)
    const { handlePersist } = await import('./writes.js')
    const err = await handlePersist(
      { resource: 'payment', action: 'upsert', id: PAY.a2.fe, data: staffCopy(PAY.a2, UNIT.a1.fe) },
      USERS.adminA.fe,
      'agent_admin',
    ).then(() => null, (e: { status?: number; code?: string }) => ({ status: e.status, code: e.code }))
    expect({ err, row: await row(PAY.a2.id) }).toEqual({ err: { status: 409, code: 'PAYMENT_CANCELLED' }, row: cancelled })
  })

  it('TA4-race RED (two staff saves): two concurrent mark-paid saves of the same DUE row: one 200, one 409 PAYMENT_TERMINAL, one payment_marked_paid row', async () => {
    const save = (ref: string) => persist('adminA', { resource: 'payment', action: 'upsert', id: PAY.a.fe, data: staffCopy(PAY.a, UNIT.a1.fe, { status: 'Paid', reference: ref, method: 'EFT' }) })
    const [r1, r2] = await Promise.all([save('EFT-SLA-7a'), save('EFT-SLA-7b')])
    const outcomes = [[r1.status, r1.code], [r2.status, r2.code]].sort((x, y) => Number(x[0]) - Number(y[0]))
    const audit = await events('payment_marked_paid', PAY.a.id)
    const r = await row(PAY.a.id)
    expect({ outcomes, auditCount: audit.length, status: r?.status, refMatchesAudit: audit[0]?.payload?.reference === r?.reference }).toEqual({
      outcomes: [[200, null], [409, 'PAYMENT_TERMINAL']], auditCount: 1, status: 'PAID', refMatchesAudit: true,
    })
  })

  it('TA4-order RED (MUST 4): a stale staff save on a PAID row is 409 and writes zero payment_% audit rows for that payment', async () => {
    await markPaid(PAY.a2.id, 'PAID', 'EFT-SLA-8')
    const res = await persist('adminA', { resource: 'payment', action: 'upsert', id: PAY.a2.fe, data: staffCopy(PAY.a2, UNIT.a1.fe, { status: 'Paid', reference: 'EFT-SLA-8b', amount: 1, amountChangeReason: 'x' }) })
    expect({ status: res.status, code: res.code, audit: await paymentAuditCount(PAY.a2.id) }).toEqual({ status: 409, code: 'PAYMENT_TERMINAL', audit: 0 })
  })

  it('TA4-del RED (MUST 4, kills MA9e): when a later statement of the delete fails, the payment row is still there (delete runs in one transaction)', async () => {
    await q(`CREATE OR REPLACE FUNCTION sla_map_delete_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'sla test: map delete refused'; END $$`)
    await q(`CREATE TRIGGER sla_map_delete_fail BEFORE DELETE ON entity_id_map FOR EACH ROW WHEN (OLD.frontend_id = '${PAY.a2.fe}') EXECUTE FUNCTION sla_map_delete_fail()`)
    try {
      const res = await persist('adminA', { resource: 'payment', action: 'delete', id: PAY.a2.fe })
      expect({ refused: res.status >= 400, row: await row(PAY.a2.id) }).toEqual({ refused: true, row: seededRow(PAY.a2) })
    } finally {
      await q(`DROP TRIGGER IF EXISTS sla_map_delete_fail ON entity_id_map`)
      await q(`DROP FUNCTION IF EXISTS sla_map_delete_fail()`)
    }
  })

  it('TA5-del RED (A2): ground_agent deletes a DUE payment on their own unit: 403 PAYMENT_PERMISSION_REQUIRED and the row stays', async () => {
    const res = await persist('groundA', { resource: 'payment', action: 'delete', id: PAY.a2.fe })
    expect({ status: res.status, code: res.code, row: await row(PAY.a2.id), map: await mapped(PAY.a2.fe) }).toEqual({ status: 403, code: 'PAYMENT_PERMISSION_REQUIRED', row: seededRow(PAY.a2), map: '1' })
  })

  // ---- TA6 family (MUST 3 / R22.1).
  it('TA6-cancelled RED: deleting a CANCELLED payment is 409 PAYMENT_CANCELLED; the row and its id mapping stay (TA6-map)', async () => {
    await q(`UPDATE payments SET status = 'CANCELLED' WHERE id = $1::uuid`, [PAY.a2.id])
    const cancelled = await row(PAY.a2.id)
    const res = await persist('adminA', { resource: 'payment', action: 'delete', id: PAY.a2.fe })
    expect({ status: res.status, code: res.code, row: await row(PAY.a2.id), map: await mapped(PAY.a2.fe) }).toEqual({ status: 409, code: 'PAYMENT_CANCELLED', row: cancelled, map: '1' })
  })

  it('TA6-map RED: after a refused delete of a PAID payment the entity_id_map entry is still there', async () => {
    await markPaid(PAY.a2.id, 'PAID', 'EFT-SLA-9')
    const res = await persist('adminA', { resource: 'payment', action: 'delete', id: PAY.a2.fe })
    expect({ status: res.status, map: await mapped(PAY.a2.fe) }).toEqual({ status: 409, map: '1' })
  })

  for (const [status, code] of [['PAID', 'PAYMENT_TERMINAL'], ['CANCELLED', 'PAYMENT_CANCELLED']] as const) {
    it(`TA6-writer RED (MA6c): a direct handlePersist delete of a ${status} row (no gate) is 409 ${code}; row and mapping kept`, async () => {
      await markPaid(PAY.a2.id, status, 'EFT-SLA-10')
      const before = await row(PAY.a2.id)
      const { handlePersist } = await import('./writes.js')
      const err = await handlePersist({ resource: 'payment', action: 'delete', id: PAY.a2.fe }, USERS.adminA.fe, 'agent_admin')
        .then(() => null, (e: { status?: number; code?: string }) => ({ status: e.status, code: e.code }))
      expect({ err, row: await row(PAY.a2.id), map: await mapped(PAY.a2.fe) }).toEqual({ err: { status: 409, code }, row: before, map: '1' })
    })
  }

  it('TA6 CONTROL (green on main): a delete of an id that no longer exists stays idempotent (200)', async () => {
    await q(`DELETE FROM payments WHERE id = $1::uuid`, [PAY.a2.id])
    const res = await persist('adminA', { resource: 'payment', action: 'delete', id: PAY.a2.fe })
    expect(res.status).toBe(200)
  })

  it('CANCELLED vs PAID RED (R22.1, O2): a staff save on a CANCELLED row is 409 PAYMENT_CANCELLED, on a PAID row 409 PAYMENT_TERMINAL; both rows unchanged', async () => {
    await q(`UPDATE payments SET status = 'CANCELLED' WHERE id = $1::uuid`, [PAY.a.id])
    await markPaid(PAY.a2.id, 'PAID', 'EFT-SLA-11')
    const [c0, p0] = [await row(PAY.a.id), await row(PAY.a2.id)]
    const c = await persist('adminA', { resource: 'payment', action: 'upsert', id: PAY.a.fe, data: staffCopy(PAY.a, UNIT.a1.fe, { status: 'Due', attachments: [] }) })
    const p = await persist('adminA', { resource: 'payment', action: 'upsert', id: PAY.a2.fe, data: staffCopy(PAY.a2, UNIT.a1.fe, { status: 'Paid', reference: 'EFT-SLA-11', notes: 'attachment only' }) })
    expect({ c: [c.status, c.code], p: [p.status, p.code], c1: await row(PAY.a.id), p1: await row(PAY.a2.id) }).toEqual({
      c: [409, 'PAYMENT_CANCELLED'], p: [409, 'PAYMENT_TERMINAL'], c1: c0, p1: p0,
    })
  })

  // ---- TA10 (A2, kills MA3): effective payments.manage = user pack ∩ agency pack.
  it('TA10 RED (agency pack): agency A\'s enabledPermissions lacks payments.manage: agent_admin\'s mark-paid is 403 PAYMENT_PERMISSION_REQUIRED, row unchanged', async () => {
    const { rolePermissions } = await import('../src/lib/permissions.js')
    const pack = rolePermissions.super_admin.filter((p) => p !== 'payments.manage')
    await q(`UPDATE clients SET settings = $2::jsonb WHERE id = $1::uuid`, [A, JSON.stringify({ enabledPermissions: pack, permissionsVersion: 2 })])
    const res = await persist('adminA', { resource: 'payment', action: 'upsert', id: PAY.a.fe, data: staffCopy(PAY.a, UNIT.a1.fe, { status: 'Paid', reference: 'EFT-SLA-12', method: 'EFT' }) })
    expect({ status: res.status, code: res.code, row: await row(PAY.a.id) }).toEqual({ status: 403, code: 'PAYMENT_PERMISSION_REQUIRED', row: seededRow(PAY.a) })
  })

  it('TA10 CONTROL (green on main): a ground_agent whose stored list includes payments.manage marks a payment on their own unit paid: 200 PAID', async () => {
    const res = await persist('groundP', { resource: 'payment', action: 'upsert', id: PAY.ap.fe, data: staffCopy(PAY.ap, UNIT.a2.fe, { status: 'Paid', reference: 'EFT-SLA-13', method: 'EFT' }) })
    const r = await row(PAY.ap.id)
    expect({ status: res.status, rowStatus: r?.status, reference: r?.reference }).toEqual({ status: 200, rowStatus: 'PAID', reference: 'EFT-SLA-13' })
  })

  it('MUST6 RED (same agency, out of scope): that ground_agent (payments.manage) edits a payment on a unit that is not theirs: 403 PAYMENT_PERMISSION_REQUIRED, row unchanged', async () => {
    const res = await persist('groundP', { resource: 'payment', action: 'upsert', id: PAY.a.fe, data: staffCopy(PAY.a, UNIT.a1.fe, { notes: 'not my unit' }) })
    expect({ status: res.status, code: res.code, row: await row(PAY.a.id) }).toEqual({ status: 403, code: 'PAYMENT_PERMISSION_REQUIRED', row: seededRow(PAY.a) })
  })

  // ---- TA11 (A6): the new audit types are never activity / property_event rows (R7's type filter).
  it('TA11 CONTROL (green once R7 is in): activity and property_event upserts and deletes on payment_* audit row ids are 403 EVENT_LOG_TYPE_MISMATCH; rows unchanged', async () => {
    let i = 1
    for (const type of AUDIT_TYPES) {
      await q(
        `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload)
         VALUES ($1::uuid, $2::uuid, $3, 'payment', $4::uuid, $5::uuid, '{"previousStatus":"DUE"}'::jsonb)`,
        [AUDIT_ROW(i++), A, type, PAY.a.id, USERS.adminA.id],
      )
    }
    const snapshot = async () => q(`SELECT id::text, event_type, client_id::text, payload FROM event_log WHERE id::text LIKE 'e0170007-%' ORDER BY id`)
    const before = await snapshot()
    const results: Array<[string, number, string | null]> = []
    for (let n = 1; n <= AUDIT_TYPES.length; n++) {
      const id = AUDIT_ROW(n)
      for (const resource of ['activity', 'property_event'] as const) {
        const up = await persist('adminA', { resource, action: 'upsert', id, data: { id, text: 'x', user: 'x', agencyId: AG_A, propertyId: UNIT.a1.fe, action: 'x', changes: [] } })
        const del = await persist('adminA', { resource, action: 'delete', id })
        results.push([`${resource}:${n}:upsert`, up.status, up.code], [`${resource}:${n}:delete`, del.status, del.code])
      }
    }
    expect({ results: results.filter(([, s, c]) => s !== 403 || c !== 'EVENT_LOG_TYPE_MISMATCH'), rows: await snapshot() }).toEqual({ results: [], rows: before })
  })

  // ---- MUST 9 / addendum2 note 1: typed notes compared after trim; a cash note counts; a stored reference counts.
  it('TA9-dunning RED: stored dunning notes re-sent with only a trailing space, no reference: 400 PAYMENT_PAID_REFERENCE_REQUIRED, row unchanged', async () => {
    const dunning = 'Dunning notice sent 2026-10-28'
    await q(`UPDATE payments SET notes = $2 WHERE id = $1::uuid`, [PAY.a.id, dunning])
    const res = await persist('adminA', { resource: 'payment', action: 'upsert', id: PAY.a.fe, data: staffCopy(PAY.a, UNIT.a1.fe, { status: 'Paid', method: 'EFT', notes: `${dunning}  `, reference: '   ' }) })
    expect({ status: res.status, code: res.code, row: await row(PAY.a.id) }).toEqual({ status: 400, code: 'PAYMENT_PAID_REFERENCE_REQUIRED', row: { ...seededRow(PAY.a), notes: dunning } })
  })

  it('TA9-cash RED (needs the audit row): a typed cash note and no reference: 200 PAID and one payment_marked_paid row with an allow-listed payload', async () => {
    const res = await persist('adminA', { resource: 'payment', action: 'upsert', id: PAY.a.fe, data: staffCopy(PAY.a, UNIT.a1.fe, { status: 'Paid', method: 'Cash', notes: 'Cash, receipt no. 123', recordedByName: 'x', extraField: 'never logged' }) })
    const audit = await events('payment_marked_paid', PAY.a.id)
    expect({
      status: res.status, rowStatus: (await row(PAY.a.id))?.status,
      audit: audit.map((e) => ({ client_id: e.client_id, subject_type: e.subject_type, actorIsAdminA: ADMIN_A_IDS.includes(String(e.actor_user_id)), keys: Object.keys(e.payload ?? {}).sort(), payload: e.payload })),
    }).toEqual({
      status: 200, rowStatus: 'PAID',
      audit: [{ client_id: A, subject_type: 'payment', actorIsAdminA: true, keys: ['amountCents', 'method', 'previousStatus', 'reference'], payload: { previousStatus: 'DUE', amountCents: 2000000, method: 'Cash', reference: null } }],
    })
  })

  it('TA9-storedref CONTROL (green on main, must stay green; Jim: a pre-filled stored reference counts): a DUE row with a stored reference is marked Paid re-sending it and no new note: 200 PAID', async () => {
    await q(`UPDATE payments SET reference = 'EFT-SLA-14' WHERE id = $1::uuid`, [PAY.a.id])
    const res = await persist('adminA', { resource: 'payment', action: 'upsert', id: PAY.a.fe, data: staffCopy(PAY.a, UNIT.a1.fe, { status: 'Paid', method: 'EFT', reference: 'EFT-SLA-14' }) })
    const r = await row(PAY.a.id)
    expect({ status: res.status, rowStatus: r?.status, reference: r?.reference }).toEqual({ status: 200, rowStatus: 'PAID', reference: 'EFT-SLA-14' })
  })

  // ---- Jim's rulings: a create with no amount; SHOULD 3 due date.
  it('TA-noamount RED: agent_admin creates a payment with no amount: 400 PAYMENT_AMOUNT_REQUIRED and nothing stored (never written as 0)', async () => {
    const fe = 'PAY-slaXna1'
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: fe,
      data: { id: fe, status: 'Due', type: 'Rent', partyName: 'Tenant', dueDate: '2026-11-01', agencyId: AG_A, propertyId: UNIT.a1.fe },
    })
    expect({ status: res.status, code: res.code, stored: await createdBy(fe) }).toEqual({ status: 400, code: 'PAYMENT_AMOUNT_REQUIRED', stored: [] })
  })

  it('TA7-due RED (SHOULD 3): a notes-only update with no dueDate keeps the stored due date', async () => {
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: PAY.a2.fe,
      data: { type: 'Deposit', partyName: 'Tenant', agencyId: AG_A, propertyId: UNIT.a1.fe, notes: 'called tenant' },
    })
    expect({ status: res.status, row: await row(PAY.a2.id) }).toEqual({ status: 200, row: { ...seededRow(PAY.a2), notes: 'called tenant' } })
  })

  // ---- Jim SHOULD (a) / addendum2 note 8: staff DUE -> CANCELLED writes an audit row in the same transaction.
  it('CANCEL-audit RED: agent_admin cancels a DUE payment: 200, row CANCELLED, one payment_cancelled_by_staff row {previousStatus, amountCents}', async () => {
    const res = await persist('adminA', { resource: 'payment', action: 'upsert', id: PAY.a.fe, data: staffCopy(PAY.a, UNIT.a1.fe, { status: 'Cancelled', note: 'never logged' }) })
    const audit = await events('payment_cancelled_by_staff', PAY.a.id)
    expect({
      status: res.status, rowStatus: (await row(PAY.a.id))?.status,
      audit: audit.map((e) => ({ client_id: e.client_id, subject_type: e.subject_type, subject_id: e.subject_id, actorIsAdminA: ADMIN_A_IDS.includes(String(e.actor_user_id)), payload: e.payload })),
    }).toEqual({
      status: 200, rowStatus: 'CANCELLED',
      audit: [{ client_id: A, subject_type: 'payment', subject_id: PAY.a.id, actorIsAdminA: true, payload: { previousStatus: 'DUE', amountCents: 2000000 } }],
    })
  })

  it('CANCEL-audit RED (same transaction): when the payment_cancelled_by_staff insert fails, the cancel rolls back and the row stays DUE', async () => {
    await q(`ALTER TABLE event_log ADD CONSTRAINT sla_no_cancel_audit CHECK (event_type <> 'payment_cancelled_by_staff') NOT VALID`)
    try {
      const res = await persist('adminA', { resource: 'payment', action: 'upsert', id: PAY.a.fe, data: staffCopy(PAY.a, UNIT.a1.fe, { status: 'Cancelled' }) })
      expect({ refused: res.status >= 400, row: await row(PAY.a.id) }).toEqual({ refused: true, row: seededRow(PAY.a) })
    } finally {
      await q(`ALTER TABLE event_log DROP CONSTRAINT IF EXISTS sla_no_cancel_audit`)
    }
  })

  it('CANCEL-audit RED (refused write): a ground_agent cancel is 403 PAYMENT_PERMISSION_REQUIRED and writes no audit row', async () => {
    const res = await persist('groundA', { resource: 'payment', action: 'upsert', id: PAY.a.fe, data: staffCopy(PAY.a, UNIT.a1.fe, { status: 'Cancelled' }) })
    expect({ status: res.status, code: res.code, row: await row(PAY.a.id), audit: await paymentAuditCount(PAY.a.id) }).toEqual({
      status: 403, code: 'PAYMENT_PERMISSION_REQUIRED', row: seededRow(PAY.a), audit: 0,
    })
  })

  it('A4-audit RED: an amount change with a reason logs exactly {fromCents, toCents, reason}; a same-cents amount needs no reason', async () => {
    const same = await persist('adminA', { resource: 'payment', action: 'upsert', id: PAY.a2.fe, data: staffCopy(PAY.a2, UNIT.a1.fe, { amount: '20000.00', notes: 'same amount' }) })
    const res = await persist('adminA', { resource: 'payment', action: 'upsert', id: PAY.a.fe, data: staffCopy(PAY.a, UNIT.a1.fe, { amount: 19999.99, amountChangeReason: '  agreed discount  ', extra: 'x' }) })
    const audit = await events('payment_amount_changed', PAY.a.id)
    expect({ same: same.status, sameAudit: await paymentAuditCount(PAY.a2.id), status: res.status, payloads: audit.map((e) => e.payload) }).toEqual({
      same: 200, sameAudit: 0, status: 200, payloads: [{ fromCents: 2000000, toCents: 1999999, reason: 'agreed discount' }],
    })
  })
})
