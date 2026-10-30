import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Ruling 17, Slice A red tests: payment writes through the REAL HTTP app.
 *
 * Spec: /workspace/pf-hardening/spec-ledger-amount-server.md section 2.2 (P1, P2,
 * P4, P5) and section 6 (TA1-TA4). The RU15 probe called assertPersistAllowed +
 * handlePersist directly with built actors; these tests instead drive the real
 * Hono app (server/index.ts, PF_SKIP_SERVE=1): real POST /api/auth/login (bcrypt
 * + HMAC session token), real resolveRequestActor (Bearer token, NODE_ENV
 * production so demo actor headers are off), real POST /api/persist ->
 * gatedPersist -> requireActorAndGate -> assertPersistAllowed -> handlePersist,
 * and a real Postgres. Nothing is mocked.
 *
 * Runs only when PF_TEST_PG_URL points at a THROWAWAY scratch database built
 * from database/postgres/schema.sql + migrations (see the README next to the
 * delivered copy). Never DATABASE_URL, never a shared or live database.
 *
 * Round 2 (Jim, Ruling 17 follow-up): P4 pinned to 409 PAYMENT_TERMINAL; TA3b
 * ground-agent approve path (green); A3/A4/TA6/TA7/TA8 audit + reason + delete
 * tests; TA5 tenant narrow path; P1 through /api/persist/batch. Rows marked
 * "CONTROL (expected RED on main)" are the legitimate path that must work after
 * Slice A but need the audit row that does not exist yet.
 *
 * Contract pinned by these tests where the spec names no field: the A4 reason
 * is `data.amountChangeReason` (string). Rename here if Slice A picks another.
 *
 * "RED on main" tests fail today because the write is allowed and the row
 * changes; each asserts the HTTP status AND the stored row in one object so the
 * failure diff shows both. "CONTROL" tests are green on main and must stay
 * green after Slice A (a fix that blocks every payment write turns them red).
 */
const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  // Dummy signing secret for this test process only (not a credential).
  process.env.AUTH_SECRET = ['ledger', 'red', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})

/** Test-only password fixture, built at runtime (not a credential). */
const TEST_FIXTURE_PW = ['test', 'fixture', 'pw'].join('-')

const A = 'a0170000-0000-4000-8000-00000000000a'
const B = 'b0170000-0000-4000-8000-00000000000b'
const AG_A = 'ag-ledger-a'
const AG_B = 'ag-ledger-b'
const USERS = {
  adminA: { id: 'a1170000-0000-4000-8000-000000000001', fe: 'u-ledger-admin-a', client: A, role: 'AGENT_ADMIN' },
  agencyAdminA: { id: 'a1170000-0000-4000-8000-000000000005', fe: 'u-ledger-agadmin-a', client: A, role: 'AGENCY_ADMIN' },
  groundA: { id: 'a1170000-0000-4000-8000-000000000002', fe: 'u-ledger-ground-a', client: A, role: 'GROUND_AGENT' },
  tenA: { id: 'a1170000-0000-4000-8000-000000000003', fe: 'u-ledger-tenant-a', client: A, role: 'END_USER' },
  llA: { id: 'a1170000-0000-4000-8000-000000000004', fe: 'u-ledger-landlord-a', client: A, role: 'LANDLORD' },
  adminB: { id: 'b1170000-0000-4000-8000-000000000001', fe: 'u-ledger-admin-b', client: B, role: 'AGENT_ADMIN' },
  tenB: { id: 'b1170000-0000-4000-8000-000000000003', fe: 'u-ledger-tenant-b', client: B, role: 'END_USER' },
  llB: { id: 'b1170000-0000-4000-8000-000000000004', fe: 'u-ledger-landlord-b', client: B, role: 'LANDLORD' },
  applicantA: { id: 'a1170000-0000-4000-8000-000000000006', fe: 'u-ledger-applicant-a', client: A, role: 'END_USER' },
} as const
type UserKey = keyof typeof USERS
const BLD_A = 'a2170000-0000-4000-8000-000000000001'
const BLD_B = 'b2170000-0000-4000-8000-000000000001'
const UNIT_A = 'a3170000-0000-4000-8000-000000000001'
const UNIT_B = 'b3170000-0000-4000-8000-000000000001'
const P_A = 'p-ledger-a'
const P_B = 'p-ledger-b'
/** Seeded payments: [uuid, FE id, agency, unit, party]. */
const PAY = {
  a: { id: 'a4170000-0000-4000-8000-000000000001', fe: 'PAY-ldgA001', client: A, unit: UNIT_A, party: USERS.tenA.id },
  a2: { id: 'a4170000-0000-4000-8000-000000000002', fe: 'PAY-ldgA002', client: A, unit: UNIT_A, party: USERS.tenA.id },
  b: { id: 'b4170000-0000-4000-8000-000000000001', fe: 'PAY-ldgB001', client: B, unit: UNIT_B, party: USERS.tenB.id },
} as const
/** Application on unit A (rent R10 000), assigned to A's ground agent, by A's applicant. */
const APP_A = { id: 'a5170000-0000-4000-8000-000000000001', fe: 'APP-ldgA001' } as const
const ENTRY_DEPOSIT_FE = 'PAY-ldgAPPd'
const ENTRY_FMR_FE = 'PAY-ldgAPPr'
const NEW_PAY_FE = 'PAY-ldgNEW5'
const NEW_PAY_OK_FE = 'PAY-ldgNEWa'
const SEEDED_AMOUNT = '20000.00'

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

describe.skipIf(!url)('Slice A red tests: /api/persist payment writes via the real app, session and Postgres', () => {
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
  const counts = async () => {
    const r = (await q<{ pay_b: string; pay_all: string; ev_b: string; ev_all: string }>(
      `SELECT (SELECT count(*) FROM payments WHERE client_id = $1::uuid)::text AS pay_b,
              (SELECT count(*) FROM payments)::text AS pay_all,
              (SELECT count(*) FROM event_log WHERE client_id = $1::uuid)::text AS ev_b,
              (SELECT count(*) FROM event_log)::text AS ev_all`,
      [B],
    ))[0]!
    return r
  }
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

  async function cleanup() {
    const clients = [A, B]
    await q(`DELETE FROM payments WHERE client_id = ANY($1::uuid[]) OR unit_id IN ($2::uuid, $3::uuid)`, [clients, UNIT_A, UNIT_B])
    await q(`DELETE FROM event_log WHERE client_id = ANY($1::uuid[])`, [clients])
    await q(`DELETE FROM leases WHERE client_id = ANY($1::uuid[])`, [clients])
    await q(`DELETE FROM applications WHERE client_id = ANY($1::uuid[])`, [clients])
    await q(`DELETE FROM entity_id_map WHERE frontend_id LIKE 'APP-ldg%' OR frontend_id LIKE 'PAY-ldg%' OR frontend_id LIKE 'u-ledger-%' OR frontend_id IN ($1, $2, $3, $4)`, [AG_A, AG_B, P_A, P_B])
    await q(`DELETE FROM units WHERE id IN ($1::uuid, $2::uuid)`, [UNIT_A, UNIT_B])
    await q(`DELETE FROM buildings WHERE id IN ($1::uuid, $2::uuid)`, [BLD_A, BLD_B])
    await q(`DELETE FROM users WHERE client_id = ANY($1::uuid[])`, [clients])
    await q(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [clients])
  }

  /** Every test starts from the same three DUE payments of R20 000.00 (order-independent, re-runnable). */
  async function resetPayments() {
    await q(`DELETE FROM payments WHERE client_id = ANY($1::uuid[]) OR unit_id IN ($2::uuid, $3::uuid)`, [[A, B], UNIT_A, UNIT_B])
    await q(`DELETE FROM entity_id_map WHERE entity_type = 'payment' AND frontend_id LIKE 'PAY-ldg%'`)
    await q(`DELETE FROM event_log WHERE client_id = ANY($1::uuid[])`, [[A, B]])
    for (const p of Object.values(PAY)) {
      await q(
        `INSERT INTO payments (id, client_id, unit_id, party_user_id, party_name, payment_type, amount, status, due_date)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'Tenant', 'DEPOSIT', 20000, 'DUE', DATE '2026-11-01')`,
        [p.id, p.client, p.unit, p.party],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('payment', $1, $2::uuid)`, [p.fe, p.id])
    }
    await q(`DELETE FROM leases WHERE client_id = ANY($1::uuid[])`, [[A, B]])
    await q(`DELETE FROM applications WHERE id = $1::uuid`, [APP_A.id])
    await q(
      `INSERT INTO applications (id, client_id, unit_id, applicant_id, agent_id, reference_code, application_type, status, submitted_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 'LDG-A-001', 'RENTAL', 'UNDER_REVIEW', NOW())`,
      [APP_A.id, A, UNIT_A, USERS.applicantA.id, USERS.groundA.id],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('application', $1, $2::uuid) ON CONFLICT DO NOTHING`, [APP_A.fe, APP_A.id])
    await q(`UPDATE units SET status_config_key = DEFAULT WHERE id = $1::uuid`, [UNIT_A])
  }

  async function login(key: UserKey, n: number): Promise<string> {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.17.0.${n}` },
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
  const events = async (type: string) =>
    q<{ client_id: string | null; subject_type: string; subject_id: string | null; actor_user_id: string | null; payload: Record<string, unknown> }>(
      `SELECT client_id::text AS client_id, subject_type, subject_id::text AS subject_id, actor_user_id::text AS actor_user_id, payload
         FROM event_log WHERE event_type = $1 ORDER BY created_at`,
      [type],
    )
  /** The spec's audit actor: actor_user_id column, or payload.actor (FE id or uuid). */
  const actorOf = (e: { actor_user_id: string | null; payload: Record<string, unknown> }) =>
    e.actor_user_id ?? (typeof e.payload?.actor === 'string' ? e.payload.actor : null)
  const ADMIN_A_IDS: string[] = [USERS.adminA.id, USERS.adminA.fe]

  beforeAll(async () => {
    db = await import('./db.js')
    await cleanup()
    await q(
      `INSERT INTO clients (id, company_name, subdomain) VALUES ($1::uuid, 'Ledger Agency A', 'ledger-a'), ($2::uuid, 'Ledger Agency B', 'ledger-b')`,
      [A, B],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid), ('agency', $3, $4::uuid)`, [AG_A, A, AG_B, B])
    const { hashPassword } = await import('./auth.js')
    const hash = await hashPassword(TEST_FIXTURE_PW)
    for (const u of Object.values(USERS)) {
      await q(
        `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'Ledger', 'Test', $5, TRUE, '{"mustChangePassword": false}'::jsonb)`,
        [u.id, u.client, `${u.fe}@example.test`, hash, u.role],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [u.fe, u.id])
    }
    await q(
      `INSERT INTO buildings (id, client_id, name, address, city, province, landlord_id)
       VALUES ($1::uuid, $2::uuid, 'Ledger A', '1 A St', 'Gqeberha', 'EC', $3::uuid), ($4::uuid, $5::uuid, 'Ledger B', '1 B St', 'Gqeberha', 'EC', $6::uuid)`,
      [BLD_A, A, USERS.llA.id, BLD_B, B, USERS.llB.id],
    )
    // Unit A is assigned to A's ground agent (their scope); unit B has no agent.
    await q(
      `INSERT INTO units (id, building_id, client_id, unit_number, listing_type, rent, agent_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, '1', 'RENT', 10000, $4::uuid), ($5::uuid, $6::uuid, $7::uuid, '1', 'RENT', 10000, NULL)`,
      [UNIT_A, BLD_A, A, USERS.groundA.id, UNIT_B, BLD_B, B],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('property', $1, $2::uuid), ('property', $3, $4::uuid)`, [P_A, UNIT_A, P_B, UNIT_B])
    await resetPayments()
    app = (await import('./index.js')).default as unknown as App
    let n = 1
    for (const key of ['adminA', 'agencyAdminA', 'groundA', 'tenA'] as const) tokens[key] = await login(key, n++)
  })

  beforeEach(async () => {
    // Production mode: demo X-User-Id / X-Role / body actor fields are off, so
    // the only identity is the session token.
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
    await resetPayments()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  afterAll(async () => {
    if (db) await cleanup()
  })

  it('SESSION CONTROL (green on main): sessions resolve to the seeded actors, and no session is 401 with nothing written', async () => {
    const me = await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${tokens.adminA}` } })
    const meBody = (await me.json()) as { user: { id: string; role: string; agencyId: string } }
    expect({ status: me.status, id: meBody.user.id, role: meBody.user.role, agencyId: meBody.user.agencyId }).toEqual({
      status: 200, id: USERS.adminA.fe, role: 'agent_admin', agencyId: AG_A,
    })
    const ground = (await (await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${tokens.groundA}` } })).json()) as { user: { role: string } }
    expect(ground.user.role).toBe('ground_agent')
    const agencyAdmin = (await (await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${tokens.agencyAdminA}` } })).json()) as { user: { role: string } }
    expect(agencyAdmin.user.role).toBe('client_admin')
    const res = await persist(null, {
      resource: 'payment', action: 'upsert', id: PAY.b.fe, actorUserId: USERS.adminA.fe, actorRole: 'agent_admin',
      data: { amount: 1, status: 'Paid', type: 'Deposit', partyName: 'x', dueDate: '2026-11-01', agencyId: AG_A, propertyId: P_A },
    })
    expect({ status: res.status, row: await row(PAY.b.id) }).toEqual({ status: 401, row: seededRow(PAY.b) })
  })

  it('P0 CONTROL (green on main; spec 2.2 P0): agent_admin of A editing B\'s payment WITHOUT a payload propertyId is refused, row unchanged', async () => {
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: PAY.b.fe,
      data: { amount: 1, status: 'Due', type: 'Deposit', partyName: 'x', dueDate: '2026-11-01', agencyId: AG_B },
    })
    expect({ status: res.status, row: await row(PAY.b.id) }).toEqual({ status: 403, row: seededRow(PAY.b) })
  })

  it('P1 RED (spec 2.2 P1 / TA1): agent_admin of A rewrites agency B\'s payment with A\'s propertyId and agencyId, amount 1, Paid: must be 403/409 and B\'s row unchanged', async () => {
    const before = await counts()
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: PAY.b.fe,
      data: { amount: 1, status: 'Paid', type: 'Deposit', partyName: 'x', dueDate: '2026-11-01', agencyId: AG_A, propertyId: P_A },
    })
    expect({ refused: [403, 409].includes(res.status), status: res.status, row: await row(PAY.b.id), counts: await counts() }).toEqual({
      refused: true, status: res.status, row: seededRow(PAY.b), counts: before,
    })
  })

  it('P1b RED (spec 2.2 P1, "client_admin by the same code path, not run"): agency admin (AGENCY_ADMIN) of A does the same rewrite of B\'s payment: must be 403/409 and B\'s row unchanged', async () => {
    const before = await counts()
    const res = await persist('agencyAdminA', {
      resource: 'payment', action: 'upsert', id: PAY.b.fe,
      data: { amount: 1, status: 'Paid', type: 'Deposit', partyName: 'x', dueDate: '2026-11-01', agencyId: AG_A, propertyId: P_A },
    })
    expect({ refused: [403, 409].includes(res.status), status: res.status, row: await row(PAY.b.id), counts: await counts() }).toEqual({
      refused: true, status: res.status, row: seededRow(PAY.b), counts: before,
    })
  })

  it('P1 CONTROL (green on main): agent_admin of A edits A\'s own DUE payment (due date and notes, amount and status unchanged) and it is saved', async () => {
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: PAY.a.fe,
      data: { amount: 20000, status: 'Due', type: 'Deposit', partyName: 'Tenant', dueDate: '2026-11-15', notes: 'moved due date', agencyId: AG_A, propertyId: P_A, partyUserId: USERS.tenA.fe },
    })
    expect({ status: res.status, row: await row(PAY.a.id) }).toEqual({
      status: 200, row: { ...seededRow(PAY.a), due_date: '2026-11-15', notes: 'moved due date' },
    })
  })

  it('P2 RED (spec 2.2 P2 / TA3): ground_agent (no payments.manage) sets amount 5 and status Paid on an in-scope payment: must be 403 and the row unchanged', async () => {
    const res = await persist('groundA', {
      resource: 'payment', action: 'upsert', id: PAY.a.fe,
      data: { amount: 5, status: 'Paid', type: 'Deposit', partyName: 'x', dueDate: '2026-11-01', agencyId: AG_A, propertyId: P_A, reference: 'EFT-LEDGER-1' },
    })
    expect({ status: res.status, row: await row(PAY.a.id) }).toEqual({ status: 403, row: seededRow(PAY.a) })
  })

  it('P2a RED (spec 2.2 P2, mark-paid only): ground_agent marks an in-scope payment Paid with a reference, amount unchanged: must be 403 and the row unchanged', async () => {
    const res = await persist('groundA', {
      resource: 'payment', action: 'upsert', id: PAY.a.fe,
      data: { amount: 20000, status: 'Paid', type: 'Deposit', partyName: 'Tenant', dueDate: '2026-11-01', agencyId: AG_A, propertyId: P_A, partyUserId: USERS.tenA.fe, reference: 'EFT-LEDGER-1', method: 'EFT' },
    })
    expect({ status: res.status, row: await row(PAY.a.id) }).toEqual({ status: 403, row: seededRow(PAY.a) })
  })

  it('P2 CONTROL (green on main): agent_admin of A (payments.manage) sends the P2a payload, a manual EFT receipt with a reference, and it is saved PAID', async () => {
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: PAY.a.fe,
      data: { amount: 20000, status: 'Paid', type: 'Deposit', partyName: 'Tenant', dueDate: '2026-11-01', agencyId: AG_A, propertyId: P_A, partyUserId: USERS.tenA.fe, reference: 'EFT-LEDGER-1', method: 'EFT' },
    })
    const r = await row(PAY.a.id)
    expect({ status: res.status, amount: r?.amount, status_db: r?.status, reference: r?.reference, client: r?.client_id }).toEqual({
      status: 200, amount: SEEDED_AMOUNT, status_db: 'PAID', reference: 'EFT-LEDGER-1', client: A,
    })
  })

  it('P4 RED (spec 2.2 P4 / TA4, rule A3): a stale staff save with status Overdue on a PAID row is 409 PAYMENT_TERMINAL; the row stays PAID with amount, paid_amount, paid_at and reference', async () => {
    // As the ITN leaves it (payfastRoutes): PAID, paid_amount = amount, paid_at set.
    await q(`UPDATE payments SET status = 'PAID', paid_at = TIMESTAMPTZ '2026-10-30 10:00:00+00', paid_amount = amount, reference = 'pf-123' WHERE id = $1::uuid`, [PAY.a2.id])
    const paid = await row(PAY.a2.id)
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: PAY.a2.fe,
      data: { amount: 20000, status: 'Overdue', type: 'Deposit', partyName: 'Tenant', dueDate: '2026-11-01', agencyId: AG_A, propertyId: P_A, partyUserId: USERS.tenA.fe, paidAt: null },
    })
    expect({ status: res.status, code: res.code, row: await row(PAY.a2.id) }).toEqual({ status: 409, code: 'PAYMENT_TERMINAL', row: paid })
  })

  it('P4 CONTROL (green on main): the rent-cycle save of a DUE row as Overdue is saved', async () => {
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: PAY.a2.fe,
      data: { amount: 20000, status: 'Overdue', type: 'Deposit', partyName: 'Tenant', dueDate: '2026-11-01', agencyId: AG_A, propertyId: P_A, partyUserId: USERS.tenA.fe },
    })
    expect({ status: res.status, row: await row(PAY.a2.id) }).toEqual({ status: 200, row: { ...seededRow(PAY.a2), status: 'OVERDUE' } })
  })

  it('P5 RED (spec 2.2 P5 / TA2): agent_admin of A creates a payment with agencyId B on A\'s unit, party = B\'s tenant: must be 403 and no row created in B', async () => {
    const before = await counts()
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: NEW_PAY_FE,
      data: { amount: 999, status: 'Due', type: 'Deposit', partyName: 'x', dueDate: '2026-11-01', agencyId: AG_B, propertyId: P_A, partyUserId: USERS.tenB.fe },
    })
    const created = await q<{ client_id: string; unit_id: string; amount: string; party_user_id: string }>(
      `SELECT p.client_id::text AS client_id, p.unit_id::text AS unit_id, p.amount::text AS amount, p.party_user_id::text AS party_user_id
         FROM payments p JOIN entity_id_map m ON m.backend_id = p.id AND m.entity_type = 'payment' WHERE m.frontend_id = $1`,
      [NEW_PAY_FE],
    )
    expect({ status: res.status, created, paymentsInB: (await counts()).pay_b }).toEqual({ status: 403, created: [], paymentsInB: before.pay_b })
  })

  it('P5 CONTROL (green on main): agent_admin of A creates a DUE payment in A\'s own ledger on A\'s unit for A\'s tenant, and it lands in A', async () => {
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: NEW_PAY_OK_FE,
      data: { amount: 999, status: 'Due', type: 'Rent', partyName: 'Tenant', dueDate: '2026-11-01', agencyId: AG_A, propertyId: P_A, partyUserId: USERS.tenA.fe },
    })
    const created = await q<{ client_id: string; unit_id: string; amount: string; status: string }>(
      `SELECT p.client_id::text AS client_id, p.unit_id::text AS unit_id, p.amount::text AS amount, p.status
         FROM payments p JOIN entity_id_map m ON m.backend_id = p.id AND m.entity_type = 'payment' WHERE m.frontend_id = $1`,
      [NEW_PAY_OK_FE],
    )
    expect({ status: res.status, created }).toEqual({ status: 200, created: [{ client_id: A, unit_id: UNIT_A, amount: '999.00', status: 'DUE' }] })
  })

  it('TA3b CONTROL (green on main, must stay green; spec A2 exception / TA3 second half): ground_agent approves via POST /api/applications/:id/approve, then saves the browser-built entry rows (Deposit = 2x rent, First Month Rent) through /api/persist as persistApprovedApplication does', async () => {
    // The approve route itself (index.ts:2002 -> writes.ts approveApplicationTx) creates no payments; the browser
    // (AppStore.tsx:1945-1948, rows from applicationStatusApi.ts:522-556) persists each entry row afterwards.
    const approve = await post(`/api/applications/${APP_A.fe}/approve`, 'groundA', {})
    const entry = (fe: string, type: string, amount: number) => persist('groundA', {
      resource: 'payment', action: 'upsert', id: fe,
      data: { id: fe, type, amount, status: 'Due', dueDate: '2026-11-04', agencyId: AG_A, propertyId: P_A, applicationId: APP_A.fe, partyUserId: USERS.applicantA.fe, partyName: 'Ledger Test' },
    })
    const dep = await entry(ENTRY_DEPOSIT_FE, 'Deposit', 20000)
    const fmr = await entry(ENTRY_FMR_FE, 'First Month Rent', 10000)
    const rows = await q<{ fe: string; client_id: string; unit_id: string; application_id: string; party_user_id: string; payment_type: string; amount: string; status: string }>(
      `SELECT m.frontend_id AS fe, p.client_id::text AS client_id, p.unit_id::text AS unit_id, p.application_id::text AS application_id,
              p.party_user_id::text AS party_user_id, p.payment_type, p.amount::text AS amount, p.status
         FROM payments p JOIN entity_id_map m ON m.backend_id = p.id AND m.entity_type = 'payment'
        WHERE m.frontend_id IN ($1, $2) ORDER BY m.frontend_id`,
      [ENTRY_DEPOSIT_FE, ENTRY_FMR_FE],
    )
    const appRow = (await q<{ status: string }>(`SELECT status FROM applications WHERE id = $1::uuid`, [APP_A.id]))[0]
    const common = { client_id: A, unit_id: UNIT_A, application_id: APP_A.id, party_user_id: USERS.applicantA.id, status: 'DUE' }
    expect({ approve: approve.status, app: appRow?.status, dep: dep.status, fmr: fmr.status, rows }).toEqual({
      approve: 200, app: 'APPROVED', dep: 200, fmr: 200,
      rows: [
        { fe: ENTRY_DEPOSIT_FE, payment_type: 'DEPOSIT', amount: '20000.00', ...common },
        { fe: ENTRY_FMR_FE, payment_type: 'FIRST_MONTH_RENT', amount: '10000.00', ...common },
      ],
    })
  })

  it('A3 RED (rule A3, TA8 family): agent_admin marks A\'s DUE payment Paid with NO reference and NO notes: must be refused (4xx) and the row unchanged', async () => {
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: PAY.a.fe,
      data: { amount: 20000, status: 'Paid', type: 'Deposit', partyName: 'Tenant', dueDate: '2026-11-01', agencyId: AG_A, propertyId: P_A, partyUserId: USERS.tenA.fe, method: 'EFT' },
    })
    expect({ refused4xx: res.status >= 400 && res.status < 500, status: res.status, row: await row(PAY.a.id), audit: await events('payment_marked_paid') }).toEqual({
      refused4xx: true, status: res.status, row: seededRow(PAY.a), audit: [],
    })
  })

  it('A3/TA8 CONTROL (expected RED on main: no audit row yet; must be green after Slice A): agent_admin marks Paid with a reference: 200, row PAID, and exactly one event_log payment_marked_paid row {previousStatus DUE, amountCents, reference}', async () => {
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: PAY.a.fe,
      data: { amount: 20000, status: 'Paid', type: 'Deposit', partyName: 'Tenant', dueDate: '2026-11-01', agencyId: AG_A, propertyId: P_A, partyUserId: USERS.tenA.fe, reference: 'EFT-LEDGER-2', method: 'EFT' },
    })
    const r = await row(PAY.a.id)
    const audit = await events('payment_marked_paid')
    expect({
      status: res.status, rowStatus: r?.status, amount: r?.amount, reference: r?.reference, auditCount: audit.length,
      audit: audit.map((e) => ({ client_id: e.client_id, subject_type: e.subject_type, subject_id: e.subject_id, actorIsAdminA: ADMIN_A_IDS.includes(String(actorOf(e))), previousStatus: e.payload?.previousStatus, amountCents: e.payload?.amountCents, reference: e.payload?.reference })),
    }).toEqual({
      status: 200, rowStatus: 'PAID', amount: SEEDED_AMOUNT, reference: 'EFT-LEDGER-2', auditCount: 1,
      audit: [{ client_id: A, subject_type: 'payment', subject_id: PAY.a.id, actorIsAdminA: true, previousStatus: 'DUE', amountCents: 2000000, reference: 'EFT-LEDGER-2' }],
    })
  })

  it('TA8 RED (rule A3 "same transaction"): when the payment_marked_paid audit insert fails, the manual PAID rolls back: refused and the row stays DUE', async () => {
    // Scratch-DB-only fault injection: event_log refuses that one event type for this test.
    await q(`ALTER TABLE event_log ADD CONSTRAINT ledger_test_no_marked_paid CHECK (event_type <> 'payment_marked_paid') NOT VALID`)
    try {
      const res = await persist('adminA', {
        resource: 'payment', action: 'upsert', id: PAY.a.fe,
        data: { amount: 20000, status: 'Paid', type: 'Deposit', partyName: 'Tenant', dueDate: '2026-11-01', agencyId: AG_A, propertyId: P_A, partyUserId: USERS.tenA.fe, reference: 'EFT-LEDGER-3', method: 'EFT' },
      })
      expect({ refused: res.status >= 400, status: res.status, row: await row(PAY.a.id) }).toEqual({ refused: true, status: res.status, row: seededRow(PAY.a) })
    } finally {
      await q(`ALTER TABLE event_log DROP CONSTRAINT IF EXISTS ledger_test_no_marked_paid`)
    }
  })

  it('A4 RED (rule A4): agent_admin changes the amount R20 000 -> R18 000 with NO amountChangeReason: must be refused (4xx) and the row unchanged', async () => {
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: PAY.a.fe,
      data: { amount: 18000, status: 'Due', type: 'Deposit', partyName: 'Tenant', dueDate: '2026-11-01', agencyId: AG_A, propertyId: P_A, partyUserId: USERS.tenA.fe },
    })
    expect({ refused4xx: res.status >= 400 && res.status < 500, status: res.status, row: await row(PAY.a.id), audit: await events('payment_amount_changed') }).toEqual({
      refused4xx: true, status: res.status, row: seededRow(PAY.a), audit: [],
    })
  })

  it('A4 CONTROL (expected RED on main: no audit row yet; must be green after Slice A): amount change with amountChangeReason: 200, amount 18000.00, and one event_log payment_amount_changed {fromCents, toCents, reason}', async () => {
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: PAY.a.fe,
      data: { amount: 18000, status: 'Due', type: 'Deposit', partyName: 'Tenant', dueDate: '2026-11-01', agencyId: AG_A, propertyId: P_A, partyUserId: USERS.tenA.fe, amountChangeReason: 'agreed discount' },
    })
    const r = await row(PAY.a.id)
    const audit = await events('payment_amount_changed')
    expect({
      status: res.status, amount: r?.amount, rowStatus: r?.status, auditCount: audit.length,
      audit: audit.map((e) => ({ client_id: e.client_id, subject_id: e.subject_id, actorIsAdminA: ADMIN_A_IDS.includes(String(actorOf(e))), fromCents: e.payload?.fromCents, toCents: e.payload?.toCents, reason: e.payload?.reason })),
    }).toEqual({
      status: 200, amount: '18000.00', rowStatus: 'DUE', auditCount: 1,
      audit: [{ client_id: A, subject_id: PAY.a.id, actorIsAdminA: true, fromCents: 2000000, toCents: 1800000, reason: 'agreed discount' }],
    })
  })

  it('TA7 RED (rule A4): an update with no amount and no status (notes only) keeps the stored amount and status of an OVERDUE row', async () => {
    await q(`UPDATE payments SET status = 'OVERDUE' WHERE id = $1::uuid`, [PAY.a2.id])
    const res = await persist('adminA', {
      resource: 'payment', action: 'upsert', id: PAY.a2.fe,
      data: { type: 'Deposit', partyName: 'Tenant', dueDate: '2026-11-01', agencyId: AG_A, propertyId: P_A, partyUserId: USERS.tenA.fe, notes: 'called tenant' },
    })
    expect({ status: res.status, row: await row(PAY.a2.id) }).toEqual({ status: 200, row: { ...seededRow(PAY.a2), status: 'OVERDUE', notes: 'called tenant' } })
  })

  it('TA6 RED (rule A5): deleting a PAID payment through /api/persist is 409 PAYMENT_TERMINAL and the row stays', async () => {
    await q(`UPDATE payments SET status = 'PAID', paid_at = TIMESTAMPTZ '2026-10-30 10:00:00+00', paid_amount = amount, reference = 'pf-456' WHERE id = $1::uuid`, [PAY.a2.id])
    const paid = await row(PAY.a2.id)
    const res = await persist('adminA', { resource: 'payment', action: 'delete', id: PAY.a2.fe })
    expect({ status: res.status, code: res.code, row: await row(PAY.a2.id) }).toEqual({ status: 409, code: 'PAYMENT_TERMINAL', row: paid })
  })

  it('TA6 CONTROL (green on main): agent_admin of A deletes a DUE payment and it is gone', async () => {
    const res = await persist('adminA', { resource: 'payment', action: 'delete', id: PAY.a2.fe })
    expect({ status: res.status, row: await row(PAY.a2.id) }).toEqual({ status: 200, row: undefined })
  })

  it('TA5 CONTROL (green on main; spec P3 regression): the tenant party posts amount 1 + Paid + a reference on their own payment: narrow path, amount and DUE kept, reference saved', async () => {
    const res = await persist('tenA', {
      resource: 'payment', action: 'upsert', id: PAY.a2.fe,
      data: { amount: 1, status: 'Paid', type: 'Deposit', partyName: 'x', reference: 'my-eft-ref' },
    })
    const r = await row(PAY.a2.id)
    expect({ status: res.status, amount: r?.amount, rowStatus: r?.status, reference: r?.reference, paid_at: r?.paid_at }).toEqual({
      status: 200, amount: SEEDED_AMOUNT, rowStatus: 'DUE', reference: 'my-eft-ref', paid_at: null,
    })
  })

  it('P1-BATCH RED (spec 2.2 P1 via /api/persist/batch, index.ts:1534-1557 loops gatedPersist -> handlePersist -> upsertPayment): agent_admin of A rewrites B\'s payment in a batch: must be 403/409 and B\'s row unchanged', async () => {
    const before = await counts()
    const res = await post('/api/persist/batch', 'adminA', {
      ops: [{
        resource: 'payment', action: 'upsert', id: PAY.b.fe,
        data: { amount: 1, status: 'Paid', type: 'Deposit', partyName: 'x', dueDate: '2026-11-01', agencyId: AG_A, propertyId: P_A },
      }],
    })
    expect({ refused: [403, 409].includes(res.status), status: res.status, row: await row(PAY.b.id), counts: await counts() }).toEqual({
      refused: true, status: res.status, row: seededRow(PAY.b), counts: before,
    })
  })

  it('BATCH CONTROL (green on main): agent_admin of A edits A\'s own payment (due date and notes) in a batch and it is saved', async () => {
    const res = await post('/api/persist/batch', 'adminA', {
      ops: [{
        resource: 'payment', action: 'upsert', id: PAY.a.fe,
        data: { amount: 20000, status: 'Due', type: 'Deposit', partyName: 'Tenant', dueDate: '2026-11-20', notes: 'batch edit', agencyId: AG_A, propertyId: P_A, partyUserId: USERS.tenA.fe },
      }],
    })
    expect({ status: res.status, ok: res.json?.ok, row: await row(PAY.a.id) }).toEqual({
      status: 200, ok: true, row: { ...seededRow(PAY.a), due_date: '2026-11-20', notes: 'batch edit' },
    })
  })
})
