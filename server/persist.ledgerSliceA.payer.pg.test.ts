import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Slice A MUST 11 (payer check, 403 PAYMENT_PARTY_MISMATCH), our tests.
 * Plan: build-plan-slice-a-addendum1.md "MUST 11"; Michael's ruling keeps it in
 * Slice A. On a staff payment save with a partyUserId, the payer must be linked
 * to the payment's context by one of:
 *   (a) the applicationId's applicant, (b) the tenancyId's lease tenant,
 *   (c) any application in the payment's agency with that applicant.
 * users.client_id alone is never a link. No partyUserId skips the check. On an
 * existing row the stored context (application, lease, agency) is used and the
 * check runs when the payload names a payer other than the stored one (the
 * writer keeps the stored party either way, MUST 1).
 *
 * Own ids so it never shares a row with the other ledger files: client uuids
 * d0170000-… (A) / c0170000-… (B), subdomains slp-a / slp-b, FE ids *-slp-*,
 * payments PAY-slp*, login XFF 10.89.0.x. Real Hono app (PF_SKIP_SERVE=1), real
 * sessions, NODE_ENV production, Postgres from PF_TEST_PG_URL (THROWAWAY
 * scratch database only). Run this file on its own (--no-file-parallelism).
 */
const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  // Dummy signing secret for this test process only (not a credential).
  process.env.AUTH_SECRET = ['slice', 'a', 'payer', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})

/** Test-only password fixture, built at runtime (not a credential). */
const TEST_FIXTURE_PW = ['test', 'fixture', 'pw'].join('-')

const A = 'd0170000-0000-4000-8000-00000000000a'
const B = 'c0170000-0000-4000-8000-00000000000b'
const AG_A = 'ag-slp-a'
const AG_B = 'ag-slp-b'
const u = (agency: 'd' | 'c', n: number) => `${agency}0170001-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const USERS = {
  adminA: { id: u('d', 1), fe: 'u-slp-admin-a', client: A as string | null, role: 'AGENT_ADMIN' },
  groundA: { id: u('d', 2), fe: 'u-slp-ground-a', client: A as string | null, role: 'GROUND_AGENT' },
  /** (a)/(c): applicant of APP.a1 in A. */
  applicantA: { id: u('d', 3), fe: 'u-slp-applicant-a', client: A as string | null, role: 'END_USER' },
  /** (b): tenant of LEASE.a1 in A, no application anywhere. */
  leaseTenA: { id: u('d', 4), fe: 'u-slp-leasetenant-a', client: A as string | null, role: 'END_USER' },
  /** users.client_id = A, but no application and no lease. */
  clientOnlyA: { id: u('d', 5), fe: 'u-slp-clientonly-a', client: A as string | null, role: 'END_USER' },
  /** No agency, no application, no lease. */
  nobody: { id: u('d', 6), fe: 'u-slp-nobody', client: null as string | null, role: 'END_USER' },
  /** Leases in A (LEASE.a2) and in B (LEASE.b2), no application. */
  bothTen: { id: u('d', 7), fe: 'u-slp-both', client: A as string | null, role: 'END_USER' },
  llA: { id: u('d', 8), fe: 'u-slp-landlord-a', client: A as string | null, role: 'LANDLORD' },
  /** Applicant of APP.b1 in B only (users.client_id = A, to show client_id is not the link). */
  applicantB: { id: u('c', 1), fe: 'u-slp-applicant-b', client: A as string | null, role: 'END_USER' },
  /** Tenant of LEASE.b1 in B only. */
  leaseTenB: { id: u('c', 2), fe: 'u-slp-leasetenant-b', client: B as string | null, role: 'END_USER' },
  llB: { id: u('c', 3), fe: 'u-slp-landlord-b', client: B as string | null, role: 'LANDLORD' },
} as const
type UserKey = keyof typeof USERS
const BLD_A = 'd0170003-0000-4000-8000-000000000001'
const BLD_B = 'c0170003-0000-4000-8000-000000000001'
const UNIT = {
  a1: { id: 'd0170002-0000-4000-8000-000000000001', fe: 'p-slp-a1', client: A, agent: USERS.groundA.id as string | null },
  a2: { id: 'd0170002-0000-4000-8000-000000000002', fe: 'p-slp-a2', client: A, agent: null as string | null },
  b1: { id: 'c0170002-0000-4000-8000-000000000001', fe: 'p-slp-b1', client: B, agent: null as string | null },
  b2: { id: 'c0170002-0000-4000-8000-000000000002', fe: 'p-slp-b2', client: B, agent: null as string | null },
} as const
const APP = {
  a1: { id: 'd0170005-0000-4000-8000-000000000001', fe: 'APP-slpA1', client: A, unit: UNIT.a1.id, applicant: USERS.applicantA.id },
  b1: { id: 'c0170005-0000-4000-8000-000000000001', fe: 'APP-slpB1', client: B, unit: UNIT.b1.id, applicant: USERS.applicantB.id },
} as const
/** One lease per unit (leases_no_date_overlap). */
const LEASE = {
  a1: { id: 'd0170006-0000-4000-8000-000000000001', fe: 'ten-slpA1', client: A, unit: UNIT.a1.id, tenant: USERS.leaseTenA.id },
  a2: { id: 'd0170006-0000-4000-8000-000000000002', fe: 'ten-slpA2', client: A, unit: UNIT.a2.id, tenant: USERS.bothTen.id },
  b1: { id: 'c0170006-0000-4000-8000-000000000001', fe: 'ten-slpB1', client: B, unit: UNIT.b1.id, tenant: USERS.leaseTenB.id },
  b2: { id: 'c0170006-0000-4000-8000-000000000002', fe: 'ten-slpB2', client: B, unit: UNIT.b2.id, tenant: USERS.bothTen.id },
} as const
/** Seeded DUE payments of R20 000.00 in A on unit a1. */
const PAY = {
  /** Payer = the applicant, tied to APP.a1. */
  app: { id: 'd0170004-0000-4000-8000-000000000001', fe: 'PAY-slpA001', party: USERS.applicantA.id, application: APP.a1.id as string | null, lease: null as string | null },
  /** Payer = the lease tenant, tied to LEASE.a1. */
  lease: { id: 'd0170004-0000-4000-8000-000000000002', fe: 'PAY-slpA002', party: USERS.leaseTenA.id, application: null as string | null, lease: LEASE.a1.id as string | null },
  /** A legacy row whose stored payer has no link (users.client_id only). */
  legacy: { id: 'd0170004-0000-4000-8000-000000000003', fe: 'PAY-slpA003', party: USERS.clientOnlyA.id, application: null as string | null, lease: null as string | null },
} as const

type Row = { amount: string; status: string; client_id: string; unit_id: string | null; party_user_id: string | null; notes: string | null; due_date: string }
type App = { request: (path: string, init?: RequestInit) => Promise<Response> }

describe.skipIf(!url)('Slice A MUST 11: payer check on staff payment saves via the real app, session and Postgres', () => {
  let db: typeof import('./db.js')
  let app: App
  const tokens: Partial<Record<UserKey, string>> = {}
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)

  const row = async (id: string): Promise<Row | undefined> =>
    (await q<Row>(
      `SELECT amount::text AS amount, status, client_id::text AS client_id, unit_id::text AS unit_id,
              party_user_id::text AS party_user_id, notes, due_date::text AS due_date
         FROM payments WHERE id = $1::uuid`,
      [id],
    ))[0]
  const seededRow = (p: (typeof PAY)[keyof typeof PAY]): Row => ({
    amount: '20000.00', status: 'DUE', client_id: A, unit_id: UNIT.a1.id, party_user_id: p.party, notes: null, due_date: '2026-11-01',
  })
  const payCount = async () => Number((await q<{ n: string }>(`SELECT count(*)::text AS n FROM payments`))[0]!.n)
  const createdBy = async (fe: string) =>
    q<{ client_id: string; unit_id: string | null; party_user_id: string | null; amount: string }>(
      `SELECT p.client_id::text AS client_id, p.unit_id::text AS unit_id, p.party_user_id::text AS party_user_id, p.amount::text AS amount
         FROM payments p JOIN entity_id_map m ON m.backend_id = p.id AND m.entity_type = 'payment' WHERE m.frontend_id = $1`,
      [fe],
    )

  async function cleanup() {
    const clients = [A, B]
    const unitIds = Object.values(UNIT).map((x) => x.id)
    await q(`DELETE FROM payments WHERE client_id = ANY($1::uuid[]) OR unit_id = ANY($2::uuid[])`, [clients, unitIds])
    await q(`DELETE FROM event_log WHERE client_id = ANY($1::uuid[])`, [clients])
    await q(`DELETE FROM leases WHERE client_id = ANY($1::uuid[])`, [clients])
    await q(`DELETE FROM applications WHERE client_id = ANY($1::uuid[])`, [clients])
    await q(
      `DELETE FROM entity_id_map WHERE frontend_id LIKE 'APP-slp%' OR frontend_id LIKE 'PAY-slp%' OR frontend_id LIKE 'u-slp-%'
          OR frontend_id LIKE 'p-slp-%' OR frontend_id LIKE 'ten-slp%' OR frontend_id IN ($1, $2)`,
      [AG_A, AG_B],
    )
    await q(`DELETE FROM units WHERE id = ANY($1::uuid[])`, [unitIds])
    await q(`DELETE FROM buildings WHERE id IN ($1::uuid, $2::uuid)`, [BLD_A, BLD_B])
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [Object.values(USERS).map((x) => x.id)])
    await q(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [clients])
  }

  /** Every test starts from the same payments, applications and leases. */
  async function resetLedger() {
    const unitIds = Object.values(UNIT).map((x) => x.id)
    await q(`DELETE FROM payments WHERE client_id = ANY($1::uuid[]) OR unit_id = ANY($2::uuid[])`, [[A, B], unitIds])
    await q(`DELETE FROM entity_id_map WHERE entity_type = 'payment' AND frontend_id LIKE 'PAY-slp%'`)
    await q(`DELETE FROM event_log WHERE client_id = ANY($1::uuid[])`, [[A, B]])
    await q(`DELETE FROM leases WHERE client_id = ANY($1::uuid[])`, [[A, B]])
    await q(`DELETE FROM applications WHERE client_id = ANY($1::uuid[])`, [[A, B]])
    let n = 1
    for (const a of Object.values(APP)) {
      await q(
        `INSERT INTO applications (id, client_id, unit_id, applicant_id, agent_id, reference_code, application_type, status, submitted_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, 'RENTAL', 'UNDER_REVIEW', NOW())`,
        [a.id, a.client, a.unit, a.applicant, a.client === A ? USERS.groundA.id : null, `SLP-${n++}`],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('application', $1, $2::uuid) ON CONFLICT DO NOTHING`, [a.fe, a.id])
    }
    for (const l of Object.values(LEASE)) {
      await q(
        `INSERT INTO leases (id, client_id, unit_id, tenant_id, lease_reference, status, start_date, rent_amount)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'ACTIVE', DATE '2026-01-01', 10000)`,
        [l.id, l.client, l.unit, l.tenant, `SLP-L-${n++}`],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('tenancy', $1, $2::uuid) ON CONFLICT DO NOTHING`, [l.fe, l.id])
    }
    for (const p of Object.values(PAY)) {
      await q(
        `INSERT INTO payments (id, client_id, unit_id, lease_id, application_id, party_user_id, party_name, payment_type, amount, status, due_date)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, 'Payer', 'DEPOSIT', 20000, 'DUE', DATE '2026-11-01')`,
        [p.id, A, UNIT.a1.id, p.lease, p.application, p.party],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('payment', $1, $2::uuid)`, [p.fe, p.id])
    }
  }

  async function login(key: UserKey, n: number): Promise<string> {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.89.0.${n}` },
      body: JSON.stringify({ email: `${USERS[key].fe}@example.test`, password: TEST_FIXTURE_PW }),
    })
    expect(res.status, `login ${key}`).toBe(200)
    return ((await res.json()) as { token: string }).token
  }
  async function post(path: string, who: UserKey, body: Record<string, unknown>) {
    const res = await app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokens[who]}` },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { status: res.status, code: (json?.code as string | undefined) ?? null }
  }
  const persist = (who: UserKey, body: Record<string, unknown>) => post('/api/persist', who, body)
  /** A staff create in A on unit a1 (the PropertyPaymentsPanel / createPayment shape). */
  const create = (fe: string, extra: Record<string, unknown>, who: UserKey = 'adminA') =>
    persist(who, {
      resource: 'payment', action: 'upsert', id: fe,
      data: { id: fe, amount: 1234, status: 'Due', type: 'Rent', partyName: 'Payer', dueDate: '2026-11-01', agencyId: AG_A, propertyId: UNIT.a1.fe, ...extra },
    })
  /** The full staff copy of a seeded row, as updatePayment / markPaymentPaid send it. */
  const staffCopy = (p: (typeof PAY)[keyof typeof PAY], extra: Record<string, unknown>) => {
    const fe = Object.values(USERS).find((x) => x.id === p.party)!.fe
    return { amount: 20000, status: 'Due', type: 'Deposit', partyName: 'Payer', dueDate: '2026-11-01', agencyId: AG_A, propertyId: UNIT.a1.fe, partyUserId: fe, ...extra }
  }
  const update = (p: (typeof PAY)[keyof typeof PAY], extra: Record<string, unknown>) =>
    persist('adminA', { resource: 'payment', action: 'upsert', id: p.fe, data: staffCopy(p, extra) })

  beforeAll(async () => {
    db = await import('./db.js')
    await cleanup()
    await q(`INSERT INTO clients (id, company_name, subdomain) VALUES ($1::uuid, 'SLP Agency A', 'slp-a'), ($2::uuid, 'SLP Agency B', 'slp-b')`, [A, B])
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid), ('agency', $3, $4::uuid)`, [AG_A, A, AG_B, B])
    const { hashPassword } = await import('./auth.js')
    const hash = await hashPassword(TEST_FIXTURE_PW)
    for (const x of Object.values(USERS)) {
      await q(
        `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'Slp', 'Test', $5, TRUE, $6::jsonb)`,
        [x.id, x.client, `${x.fe}@example.test`, hash, x.role, JSON.stringify({ mustChangePassword: false })],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [x.fe, x.id])
    }
    await q(
      `INSERT INTO buildings (id, client_id, name, address, city, province, landlord_id)
       VALUES ($1::uuid, $2::uuid, 'SLP A', '1 A St', 'Gqeberha', 'EC', $3::uuid), ($4::uuid, $5::uuid, 'SLP B', '1 B St', 'Gqeberha', 'EC', $6::uuid)`,
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
    tokens.adminA = await login('adminA', 1)
    tokens.groundA = await login('groundA', 2)
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

  // ---- Creates that must be refused: 403 PAYMENT_PARTY_MISMATCH, nothing stored.
  const refusedCreates: Array<[string, Record<string, unknown>]> = [
    ['a payer with no application and no lease anywhere (TA-party, no tenancy)', { partyUserId: USERS.nobody.fe }],
    ['a payer whose ONLY tie is users.client_id = A (TA-party4)', { partyUserId: USERS.clientOnlyA.fe }],
    ["a payer whose only application is in agency B (users.client_id = A)", { partyUserId: USERS.applicantB.fe }],
    ["a payer whose only lease is in agency B (TA-party1)", { partyUserId: USERS.leaseTenB.fe }],
    ["B's lease tenant named against A's lease (tenancyId of LEASE.a1)", { partyUserId: USERS.leaseTenB.fe, tenancyId: LEASE.a1.fe }],
    ['the users.client_id-only payer with no propertyId (unit-less create)', { partyUserId: USERS.clientOnlyA.fe, propertyId: undefined }],
    ['a partyUserId that resolves to no user', { partyUserId: 'u-slp-does-not-exist' }],
  ]
  refusedCreates.forEach(([name, extra], i) => {
    it(`M11 RED create (${name}): 403 PAYMENT_PARTY_MISMATCH and nothing stored`, async () => {
      const fe = `PAY-slpXc${i}`
      const before = await payCount()
      const res = await create(fe, extra)
      expect({ status: res.status, code: res.code, stored: await createdBy(fe), n: await payCount() }).toEqual({
        status: 403, code: 'PAYMENT_PARTY_MISMATCH', stored: [], n: before,
      })
    })
  })

  it('M11 RED create via /api/persist/batch: the no-tenancy payer is 403 PAYMENT_PARTY_MISMATCH and nothing stored', async () => {
    const before = await payCount()
    const res = await post('/api/persist/batch', 'adminA', {
      ops: [{ resource: 'payment', action: 'upsert', id: 'PAY-slpXbat', data: { id: 'PAY-slpXbat', amount: 10, status: 'Due', type: 'Rent', partyName: 'x', dueDate: '2026-11-01', agencyId: AG_A, propertyId: UNIT.a1.fe, partyUserId: USERS.nobody.fe } }],
    })
    expect({ status: res.status, code: res.code, stored: await createdBy('PAY-slpXbat'), n: await payCount() }).toEqual({
      status: 403, code: 'PAYMENT_PARTY_MISMATCH', stored: [], n: before,
    })
  })

  // ---- Creates that must pass, each for its own reason.
  const passingCreates: Array<[string, Record<string, unknown>, string]> = [
    ["(a) the application's applicant, with that applicationId", { partyUserId: USERS.applicantA.fe, applicationId: APP.a1.fe }, USERS.applicantA.id],
    ['(c) an applicant of an application in A, no applicationId sent', { partyUserId: USERS.applicantA.fe }, USERS.applicantA.id],
    ["(b) the lease's tenant with that tenancyId (no application anywhere)", { partyUserId: USERS.leaseTenA.fe, tenancyId: LEASE.a1.fe }, USERS.leaseTenA.id],
    ['(b) TA-party2: a tenant with leases in A and B, created in A on the A lease', { partyUserId: USERS.bothTen.fe, tenancyId: LEASE.a2.fe }, USERS.bothTen.id],
  ]
  passingCreates.forEach(([name, extra, party], i) => {
    it(`M11 CONTROL create ${name}: 200 and stored in A with that payer`, async () => {
      const fe = `PAY-slpOk${i}`
      const res = await create(fe, extra)
      expect({ status: res.status, stored: await createdBy(fe) }).toEqual({
        status: 200, stored: [{ client_id: A, unit_id: UNIT.a1.id, party_user_id: party, amount: '1234.00' }],
      })
    })
  })

  it('M11 CONTROL create with NO partyUserId (staff Add payment modal shape, partyUserId null): 200 as before, party NULL', async () => {
    const res = await create('PAY-slpOkNull', { partyUserId: null })
    expect({ status: res.status, stored: await createdBy('PAY-slpOkNull') }).toEqual({
      status: 200, stored: [{ client_id: A, unit_id: UNIT.a1.id, party_user_id: null, amount: '1234.00' }],
    })
  })

  it('M11 CONTROL create with partyUserId left out entirely: 200 as before, party NULL', async () => {
    const res = await create('PAY-slpOkNone', {})
    expect({ status: res.status, stored: await createdBy('PAY-slpOkNone') }).toEqual({
      status: 200, stored: [{ client_id: A, unit_id: UNIT.a1.id, party_user_id: null, amount: '1234.00' }],
    })
  })

  it('M11 CONTROL ground-agent exception: groundA creates the approval Deposit row on APP.a1 for its applicant: 200', async () => {
    const res = await create('PAY-slpOkGa', { type: 'Deposit', applicationId: APP.a1.fe, partyUserId: USERS.applicantA.fe }, 'groundA')
    expect({ status: res.status, stored: (await createdBy('PAY-slpOkGa')).length }).toEqual({ status: 200, stored: 1 })
  })

  it('M11 RED ground-agent exception keeps its own code: the approval row naming a non-applicant payer is 403 PAYMENT_APPLICATION_MISMATCH', async () => {
    const res = await create('PAY-slpXga', { type: 'Deposit', applicationId: APP.a1.fe, partyUserId: USERS.nobody.fe }, 'groundA')
    expect({ status: res.status, code: res.code, stored: await createdBy('PAY-slpXga') }).toEqual({ status: 403, code: 'PAYMENT_APPLICATION_MISMATCH', stored: [] })
  })

  // ---- Updates: the stored context decides; a payer other than the stored one must be linked to it.
  const refusedUpdates: Array<[string, (typeof PAY)[keyof typeof PAY], string]> = [
    ['naming a payer with no tenancy', PAY.app, USERS.nobody.fe],
    ['naming a users.client_id-only payer', PAY.app, USERS.clientOnlyA.fe],
    ["naming a payer whose only application is in B", PAY.lease, USERS.applicantB.fe],
    ["naming B's lease tenant on a lease-tied row", PAY.lease, USERS.leaseTenB.fe],
  ]
  refusedUpdates.forEach(([name, p, party]) => {
    it(`M11 RED update ${name}: 403 PAYMENT_PARTY_MISMATCH and the row unchanged`, async () => {
      const res = await update(p, { partyUserId: party, notes: 'payer swap' })
      expect({ status: res.status, code: res.code, row: await row(p.id) }).toEqual({ status: 403, code: 'PAYMENT_PARTY_MISMATCH', row: seededRow(p) })
    })
  })

  it('M11 RED update, mark Paid naming a no-tenancy payer: 403 PAYMENT_PARTY_MISMATCH and the row stays DUE', async () => {
    const res = await update(PAY.lease, { partyUserId: USERS.nobody.fe, status: 'Paid', reference: 'EFT-SLP-1', method: 'EFT' })
    expect({ status: res.status, code: res.code, row: await row(PAY.lease.id) }).toEqual({ status: 403, code: 'PAYMENT_PARTY_MISMATCH', row: seededRow(PAY.lease) })
  })

  // Mutant killer: payload names a linked tenancyId, but the stored row is application-tied.
  // Correct behaviour judges the changed payer against the STORED application (not the payload tenancy).
  it("M11 RED update naming the lease tenant on an application-tied row while sending that tenancyId: 403 PAYMENT_PARTY_MISMATCH (stored context, not payload)", async () => {
    const res = await update(PAY.app, { partyUserId: USERS.leaseTenA.fe, tenancyId: LEASE.a1.fe, notes: 'ctx swap' })
    expect({ status: res.status, code: res.code, row: await row(PAY.app.id) }).toEqual({ status: 403, code: 'PAYMENT_PARTY_MISMATCH', row: seededRow(PAY.app) })
  })

  const passingUpdates: Array<[string, (typeof PAY)[keyof typeof PAY], Record<string, unknown>]> = [
    ['the stored applicant payer (full staff copy)', PAY.app, {}],
    ['the stored lease-tenant payer (full staff copy)', PAY.lease, {}],
    ['a legacy row whose stored payer is unlinked, payer unchanged (MUST 1: the stored party is not re-judged)', PAY.legacy, {}],
    ['no partyUserId in the payload', PAY.legacy, { partyUserId: null }],
  ]
  passingUpdates.forEach(([name, p, extra]) => {
    it(`M11 CONTROL update with ${name}: 200, notes saved, payer kept`, async () => {
      const res = await update(p, { notes: 'note edit', ...extra })
      expect({ status: res.status, row: await row(p.id) }).toEqual({ status: 200, row: { ...seededRow(p), notes: 'note edit' } })
    })
  })

  it("M11 CONTROL update naming the lease's tenant on the lease-tied row, marked Paid: 200 PAID", async () => {
    const res = await update(PAY.lease, { status: 'Paid', reference: 'EFT-SLP-2', method: 'EFT' })
    expect({ status: res.status, st: (await row(PAY.lease.id))?.status }).toEqual({ status: 200, st: 'PAID' })
  })
})
