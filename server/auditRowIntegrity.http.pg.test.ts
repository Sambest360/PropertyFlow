import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * R7: server-written event_log rows (audit) cannot be deleted or rewritten
 * through /api/persist, and an existing activity / property_event row is
 * scoped by its STORED agency (and property), never the payload (Ruling 19).
 *
 * Harness copied (setup only: hoisted env, real login, Bearer persist helper,
 * seed/cleanup shape) from Angela's server/persist.ledgerAuth.pg.test.ts,
 * sha256 c5d3ed9ce36b353883aebbeefb8390d0eb8e0b43c2ea7834fba7c450a31153cc
 * (revised file, supersedes bea69870…). Her file is not modified or imported.
 * Own identifiers so the two files never collide: client uuids c0170000-… /
 * d0170000-…, FE ids r7-*, emails r7-*@example.test, subdomains r7-a / r7-b,
 * x-forwarded-for 10.77.0.x. Her P1/P1b/P5 compare GLOBAL event_log counts,
 * so the pg files run with `vitest run --no-file-parallelism` (or one scratch
 * database per file).
 *
 * Drives the REAL Hono app (server/index.ts, PF_SKIP_SERVE=1): real
 * POST /api/auth/login, real resolveRequestActor (NODE_ENV production, demo
 * actor headers off), real /api/persist, /api/persist/batch and the REST
 * aliases -> gatedPersist -> assertPersistAllowed -> handlePersist, on a real
 * Postgres. Runs only when PF_TEST_PG_URL points at a THROWAWAY scratch
 * database built from database/postgres/schema.sql + migrations. Never live.
 *
 * Spec: spec-checkout-initiator.md R7 / T9; plan build-plan-r7.md + Addendum 1;
 * Jim's sign-off jim-build-plan-r7-signoff.md (MUST 1-8).
 */
const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  // Dummy signing secret for this test process only (not a credential).
  process.env.AUTH_SECRET = ['r7', 'audit', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})

/** Test-only password fixture, built at runtime (not a credential). */
const TEST_FIXTURE_PW = ['r7', 'fixture', 'pw'].join('-')

const A = 'c0170000-0000-4000-8000-00000000000a'
const B = 'd0170000-0000-4000-8000-00000000000b'
const AG_A = 'r7-ag-a'
const AG_B = 'r7-ag-b'
const USERS = {
  adminA: { id: 'c1170000-0000-4000-8000-000000000001', fe: 'r7-admin-a', client: A as string | null, role: 'AGENT_ADMIN' },
  groundA: { id: 'c1170000-0000-4000-8000-000000000002', fe: 'r7-ground-a', client: A as string | null, role: 'GROUND_AGENT' },
  tenA: { id: 'c1170000-0000-4000-8000-000000000003', fe: 'r7-tenant-a', client: A as string | null, role: 'END_USER' },
  llA: { id: 'c1170000-0000-4000-8000-000000000004', fe: 'r7-landlord-a', client: A as string | null, role: 'LANDLORD' },
  adminB: { id: 'd1170000-0000-4000-8000-000000000001', fe: 'r7-admin-b', client: B as string | null, role: 'AGENT_ADMIN' },
  llB: { id: 'd1170000-0000-4000-8000-000000000004', fe: 'r7-landlord-b', client: B as string | null, role: 'LANDLORD' },
  superAdmin: { id: 'e1170000-0000-4000-8000-000000000001', fe: 'r7-super-admin', client: null as string | null, role: 'SUPER_ADMIN' },
} as const
type UserKey = keyof typeof USERS
const BLD_A = 'c2170000-0000-4000-8000-000000000001'
const BLD_B = 'd2170000-0000-4000-8000-000000000001'
const UNIT_A = 'c3170000-0000-4000-8000-000000000001'
const UNIT_B = 'd3170000-0000-4000-8000-000000000001'
const P_A = 'r7-p-a'
const P_B = 'r7-p-b'

/** Seeded event_log rows, re-seeded before every test. */
const EV = {
  itnA: { id: 'c6170000-0000-4000-8000-000000000001', client: A, type: 'payfast_itn_rejected', subjectType: 'payment', subject: null, fe: null, payload: { reason: 'signature_mismatch', pfPaymentId: 'r7-pf-1' } },
  leaseSignedA: { id: 'c6170000-0000-4000-8000-000000000002', client: A, type: 'lease_signed', subjectType: 'tenancy', subject: null, fe: null, payload: { party: 'tenant', envelopeId: 'r7-env-1' } },
  impB: { id: 'd6170000-0000-4000-8000-000000000001', client: B, type: 'impersonation', subjectType: 'user', subject: null, fe: null, payload: { by: 'r7-super-admin', target: 'r7-admin-b' } },
  actA: { id: 'c6170000-0000-4000-8000-000000000011', client: A, type: 'activity', subjectType: 'agency', subject: null, fe: 'r7-act-a', payload: { text: 'A genuine activity', user: 'Admin A' } },
  peA: { id: 'c6170000-0000-4000-8000-000000000012', client: A, type: 'property_event', subjectType: 'property', subject: UNIT_A, fe: 'r7-pe-a', payload: { actorName: 'Admin A', action: 'updated', changes: [], propertyId: P_A } },
  actB: { id: 'd6170000-0000-4000-8000-000000000011', client: B, type: 'activity', subjectType: 'agency', subject: null, fe: 'r7-act-b', payload: { text: 'B genuine activity', user: 'Admin B' } },
  peB: { id: 'd6170000-0000-4000-8000-000000000012', client: B, type: 'property_event', subjectType: 'property', subject: UNIT_B, fe: 'r7-pe-b', payload: { actorName: 'Admin B', action: 'updated', changes: [], propertyId: P_B } },
  /** A platform row (client_id NULL), like the super-admin "Agency created / cancelled" activities. */
  actNull: { id: 'c6170000-0000-4000-8000-0000000000f1', client: null, type: 'activity', subjectType: 'agency', subject: null, fe: null, payload: { text: 'platform note', user: 'System' } },
} as const
type EvKey = keyof typeof EV
const EV_IDS = Object.values(EV).map((e) => e.id)

type EvRow = {
  id: string
  client_id: string | null
  event_type: string
  subject_type: string
  subject_id: string | null
  actor_user_id: string | null
  payload: Record<string, unknown>
  created_at: string
}
type App = { request: (path: string, init?: RequestInit) => Promise<Response> }

describe.skipIf(!url)('R7 audit-row integrity: event_log writes via the real app, session and Postgres', () => {
  let db: typeof import('./db.js')
  let app: App
  const tokens: Partial<Record<UserKey, string>> = {}
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)

  const ev = async (id: string): Promise<EvRow | undefined> =>
    (await q<EvRow>(
      `SELECT id::text AS id, client_id::text AS client_id, event_type, subject_type, subject_id::text AS subject_id,
              actor_user_id::text AS actor_user_id, payload, created_at::text AS created_at
         FROM event_log WHERE id = $1::uuid`,
      [id],
    ))[0]
  /** The row as seeded, read back once per test (byte-for-byte comparison target). */
  const seeded: Partial<Record<EvKey, EvRow>> = {}
  const byFe = async (fe: string) =>
    (await q<EvRow>(
      `SELECT e.id::text AS id, e.client_id::text AS client_id, e.event_type, e.subject_type, e.subject_id::text AS subject_id,
              e.actor_user_id::text AS actor_user_id, e.payload, e.created_at::text AS created_at
         FROM event_log e JOIN entity_id_map m ON m.backend_id = e.id AND m.entity_type IN ('activity', 'property_event')
        WHERE m.frontend_id = $1`,
      [fe],
    ))[0]

  async function cleanup() {
    const clients = [A, B]
    await q(`DELETE FROM event_log WHERE client_id = ANY($1::uuid[]) OR id = ANY($2::uuid[])`, [clients, EV_IDS])
    await q(`DELETE FROM entity_id_map WHERE frontend_id LIKE 'r7-%'`)
    await q(`DELETE FROM units WHERE id IN ($1::uuid, $2::uuid)`, [UNIT_A, UNIT_B])
    await q(`DELETE FROM buildings WHERE id IN ($1::uuid, $2::uuid)`, [BLD_A, BLD_B])
    await q(`DELETE FROM users WHERE client_id = ANY($1::uuid[]) OR id = $2::uuid`, [clients, USERS.superAdmin.id])
    await q(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [clients])
  }

  async function resetEvents() {
    await q(`DELETE FROM event_log WHERE client_id = ANY($1::uuid[]) OR id = ANY($2::uuid[])`, [[A, B], EV_IDS])
    await q(`DELETE FROM entity_id_map WHERE entity_type IN ('activity', 'property_event') AND frontend_id LIKE 'r7-%'`)
    for (const [k, e] of Object.entries(EV) as Array<[EvKey, (typeof EV)[EvKey]]>) {
      await q(
        `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, NULL, $6::jsonb, TIMESTAMPTZ '2026-10-30 08:00:00+00')`,
        [e.id, e.client, e.type, e.subjectType, e.subject, JSON.stringify(e.payload)],
      )
      if (e.fe) await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ($1, $2, $3::uuid)`, [e.type, e.fe, e.id])
      seeded[k] = await ev(e.id)
    }
  }

  async function login(key: UserKey, n: number): Promise<string> {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.77.0.${n}` },
      body: JSON.stringify({ email: `${USERS[key].fe}@example.test`, password: TEST_FIXTURE_PW }),
    })
    expect(res.status, `login ${key}`).toBe(200)
    return ((await res.json()) as { token: string }).token
  }

  async function call(method: string, path: string, who: UserKey | null, body?: Record<string, unknown>) {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (who) headers.Authorization = `Bearer ${tokens[who]}`
    const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { status: res.status, code: (json?.code as string | undefined) ?? null, json }
  }
  const persist = (who: UserKey | null, body: Record<string, unknown>) => call('POST', '/api/persist', who, body)
  /** Status + code + the stored row, in one object so a failure diff shows all three. */
  const outcome = async (res: { status: number; code: string | null }, id: string) => ({ status: res.status, code: res.code, row: await ev(id) })
  const refusedUnchanged = (code: string, k: EvKey) => ({ status: code === 'EVENT_LOG_ID_TAKEN' ? 409 : 403, code, row: seeded[k] })

  beforeAll(async () => {
    db = await import('./db.js')
    await cleanup()
    await q(
      `INSERT INTO clients (id, company_name, subdomain) VALUES ($1::uuid, 'R7 Agency A', 'r7-a'), ($2::uuid, 'R7 Agency B', 'r7-b')`,
      [A, B],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid), ('agency', $3, $4::uuid)`, [AG_A, A, AG_B, B])
    const { hashPassword } = await import('./auth.js')
    const hash = await hashPassword(TEST_FIXTURE_PW)
    for (const u of Object.values(USERS)) {
      await q(
        `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'R7', 'Test', $5, TRUE, '{"mustChangePassword": false}'::jsonb)`,
        [u.id, u.client, `${u.fe}@example.test`, hash, u.role],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [u.fe, u.id])
    }
    await q(
      `INSERT INTO buildings (id, client_id, name, address, city, province, landlord_id)
       VALUES ($1::uuid, $2::uuid, 'R7 A', '7 A St', 'Gqeberha', 'EC', $3::uuid), ($4::uuid, $5::uuid, 'R7 B', '7 B St', 'Gqeberha', 'EC', $6::uuid)`,
      [BLD_A, A, USERS.llA.id, BLD_B, B, USERS.llB.id],
    )
    // Unit A is assigned to A's ground agent (their scope); unit B has no agent.
    await q(
      `INSERT INTO units (id, building_id, client_id, unit_number, listing_type, rent, agent_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, '7', 'RENT', 10000, $4::uuid), ($5::uuid, $6::uuid, $7::uuid, '7', 'RENT', 10000, NULL)`,
      [UNIT_A, BLD_A, A, USERS.groundA.id, UNIT_B, BLD_B, B],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('property', $1, $2::uuid), ('property', $3, $4::uuid)`, [P_A, UNIT_A, P_B, UNIT_B])
    await resetEvents()
    app = (await import('./index.js')).default as unknown as App
    let n = 1
    for (const key of ['adminA', 'groundA', 'tenA', 'superAdmin'] as const) tokens[key] = await login(key, n++)
  })

  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
    await resetEvents()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  afterAll(async () => {
    if (db) await cleanup()
  })

  it('SESSION CONTROL (green on main; MUST 5): agent_admin, ground_agent and a SUPER_ADMIN with client_id NULL log in through the real /api/auth/login and resolve to their roles', async () => {
    const me = async (k: UserKey) => {
      const r = await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${tokens[k]}` } })
      const b = (await r.json()) as { user?: { id: string; role: string; agencyId?: string | null } }
      return { status: r.status, id: b.user?.id, role: b.user?.role, agencyId: b.user?.agencyId ?? null }
    }
    expect({ adminA: await me('adminA'), groundA: await me('groundA'), superAdmin: await me('superAdmin') }).toEqual({
      adminA: { status: 200, id: USERS.adminA.fe, role: 'agent_admin', agencyId: AG_A },
      groundA: { status: 200, id: USERS.groundA.fe, role: 'ground_agent', agencyId: AG_A },
      superAdmin: { status: 200, id: USERS.superAdmin.fe, role: 'super_admin', agencyId: null },
    })
  })

  // ---- Audit rows (server-written types) via /api/persist -----------------
  it('R7-1 RED (P7): agent_admin A sends activity delete with the id of A\'s payfast_itn_rejected row: 403 EVENT_LOG_TYPE_MISMATCH, row unchanged', async () => {
    const res = await persist('adminA', { resource: 'activity', action: 'delete', id: EV.itnA.id })
    expect(await outcome(res, EV.itnA.id)).toEqual(refusedUnchanged('EVENT_LOG_TYPE_MISMATCH', 'itnA'))
  })

  it('R7-2 RED (P8): agent_admin A sends an activity upsert on B\'s impersonation row with agencyId A: 403 EVENT_LOG_TYPE_MISMATCH, client_id still B and payload unchanged', async () => {
    const res = await persist('adminA', {
      resource: 'activity', action: 'upsert', id: EV.impB.id,
      data: { id: EV.impB.id, agencyId: AG_A, text: 'overwritten', user: 'x' },
    })
    expect(await outcome(res, EV.impB.id)).toEqual(refusedUnchanged('EVENT_LOG_TYPE_MISMATCH', 'impB'))
  })

  it('R7-3a RED: property_event delete aimed at A\'s payfast_itn_rejected row (with A\'s propertyId): 403 EVENT_LOG_TYPE_MISMATCH, row unchanged', async () => {
    const res = await persist('adminA', { resource: 'property_event', action: 'delete', id: EV.itnA.id, data: { propertyId: P_A, agencyId: AG_A } })
    expect(await outcome(res, EV.itnA.id)).toEqual(refusedUnchanged('EVENT_LOG_TYPE_MISMATCH', 'itnA'))
  })

  it('R7-3b RED: property_event upsert aimed at A\'s payfast_itn_rejected row: 403 EVENT_LOG_TYPE_MISMATCH, row unchanged', async () => {
    const res = await persist('adminA', {
      resource: 'property_event', action: 'upsert', id: EV.itnA.id,
      data: { id: EV.itnA.id, propertyId: P_A, agencyId: AG_A, actorName: 'x', action: 'updated', changes: [] },
    })
    expect(await outcome(res, EV.itnA.id)).toEqual(refusedUnchanged('EVENT_LOG_TYPE_MISMATCH', 'itnA'))
  })

  it('R7-3c RED (isClientLeaseSignedWrite checks the body only): activity delete of A\'s lease_signed row: 403 EVENT_LOG_TYPE_MISMATCH, row unchanged', async () => {
    const res = await persist('adminA', { resource: 'activity', action: 'delete', id: EV.leaseSignedA.id })
    expect(await outcome(res, EV.leaseSignedA.id)).toEqual(refusedUnchanged('EVENT_LOG_TYPE_MISMATCH', 'leaseSignedA'))
  })

  it('R7-4 RED (cross-type): an activity upsert on A\'s property_event row and a property_event upsert on A\'s activity row are both 403 EVENT_LOG_TYPE_MISMATCH, rows unchanged', async () => {
    const r1 = await persist('adminA', { resource: 'activity', action: 'upsert', id: EV.peA.id, data: { id: EV.peA.id, agencyId: AG_A, text: 'x', user: 'x' } })
    const r2 = await persist('adminA', {
      resource: 'property_event', action: 'upsert', id: EV.actA.id,
      data: { id: EV.actA.id, propertyId: P_A, agencyId: AG_A, actorName: 'x', action: 'updated', changes: [] },
    })
    expect({ pe: await outcome(r1, EV.peA.id), act: await outcome(r2, EV.actA.id) }).toEqual({
      pe: refusedUnchanged('EVENT_LOG_TYPE_MISMATCH', 'peA'),
      act: refusedUnchanged('EVENT_LOG_TYPE_MISMATCH', 'actA'),
    })
  })

  it('R7-5 RED (batch, one allowed and one refused op): /api/persist/batch [own activity create, activity delete of the itn row] is 403 EVENT_LOG_TYPE_MISMATCH and the itn row is unchanged; the earlier op stays committed (batch is not transactional, LATER 3)', async () => {
    const res = await call('POST', '/api/persist/batch', 'adminA', {
      ops: [
        { resource: 'activity', action: 'upsert', id: 'r7-act-batch1', data: { id: 'r7-act-batch1', agencyId: AG_A, text: 'batch first op', user: 'Admin A' } },
        { resource: 'activity', action: 'delete', id: EV.itnA.id },
      ],
    })
    const first = await byFe('r7-act-batch1')
    expect({ ...(await outcome(res, EV.itnA.id)), firstOp: first && { type: first.event_type, client: first.client_id, text: first.payload.text } }).toEqual({
      ...refusedUnchanged('EVENT_LOG_TYPE_MISMATCH', 'itnA'),
      firstOp: { type: 'activity', client: A, text: 'batch first op' },
    })
  })

  it('R7-6 RED (roles): ground_agent A and super_admin are refused too: activity delete of the itn row and super_admin activity upsert of B\'s impersonation row are 403 EVENT_LOG_TYPE_MISMATCH, rows unchanged', async () => {
    const g = await persist('groundA', { resource: 'activity', action: 'delete', id: EV.itnA.id, data: { agencyId: AG_A } })
    const gRow = await outcome(g, EV.itnA.id)
    const sd = await persist('superAdmin', { resource: 'activity', action: 'delete', id: EV.itnA.id })
    const sdRow = await outcome(sd, EV.itnA.id)
    const su = await persist('superAdmin', { resource: 'activity', action: 'upsert', id: EV.impB.id, data: { id: EV.impB.id, agencyId: AG_B, text: 'x', user: 'x' } })
    expect({ ground: gRow, superDelete: sdRow, superUpsert: await outcome(su, EV.impB.id) }).toEqual({
      ground: refusedUnchanged('EVENT_LOG_TYPE_MISMATCH', 'itnA'),
      superDelete: refusedUnchanged('EVENT_LOG_TYPE_MISMATCH', 'itnA'),
      superUpsert: refusedUnchanged('EVENT_LOG_TYPE_MISMATCH', 'impB'),
    })
  })

  // ---- REST aliases (MUST 3) ------------------------------------------------
  it('R7-12 RED (J7): DELETE /api/activities/<itn uuid> is 403 EVENT_LOG_TYPE_MISMATCH, row unchanged', async () => {
    const res = await call('DELETE', `/api/activities/${EV.itnA.id}`, 'adminA')
    expect(await outcome(res, EV.itnA.id)).toEqual(refusedUnchanged('EVENT_LOG_TYPE_MISMATCH', 'itnA'))
  })

  it('R7-13 RED (J8): PATCH /api/activities/<itn uuid> is 403 EVENT_LOG_TYPE_MISMATCH, payload unchanged', async () => {
    const res = await call('PATCH', `/api/activities/${EV.itnA.id}`, 'adminA', { agencyId: AG_A, text: 'patched', user: 'x' })
    expect(await outcome(res, EV.itnA.id)).toEqual(refusedUnchanged('EVENT_LOG_TYPE_MISMATCH', 'itnA'))
  })

  it('R7-14 RED: DELETE and PATCH /api/property-events/<itn uuid> are 403 EVENT_LOG_TYPE_MISMATCH, row unchanged', async () => {
    const d = await call('DELETE', `/api/property-events/${EV.itnA.id}`, 'adminA')
    const dRow = await outcome(d, EV.itnA.id)
    const p = await call('PATCH', `/api/property-events/${EV.itnA.id}`, 'adminA', { propertyId: P_A, agencyId: AG_A, actorName: 'x', action: 'updated', changes: [] })
    expect({ del: dRow, patch: await outcome(p, EV.itnA.id) }).toEqual({
      del: refusedUnchanged('EVENT_LOG_TYPE_MISMATCH', 'itnA'),
      patch: refusedUnchanged('EVENT_LOG_TYPE_MISMATCH', 'itnA'),
    })
  })

  // ---- MUST 1 / Ruling 19: stored agency and property win -------------------
  it('R7-9 RED (J4): agent_admin A upserts B\'s genuine activity with agencyId A: 403 EVENT_LOG_AGENCY_MISMATCH, B\'s row unchanged', async () => {
    const res = await persist('adminA', { resource: 'activity', action: 'upsert', id: EV.actB.id, data: { id: EV.actB.id, agencyId: AG_A, text: 'hijacked', user: 'x' } })
    expect(await outcome(res, EV.actB.id)).toEqual(refusedUnchanged('EVENT_LOG_AGENCY_MISMATCH', 'actB'))
  })

  it('R7-10 RED (J5): ground_agent A deletes B\'s genuine activity with data.agencyId A: 403 EVENT_LOG_AGENCY_MISMATCH, B\'s row unchanged', async () => {
    const res = await persist('groundA', { resource: 'activity', action: 'delete', id: EV.actB.id, data: { agencyId: AG_A } })
    expect(await outcome(res, EV.actB.id)).toEqual(refusedUnchanged('EVENT_LOG_AGENCY_MISMATCH', 'actB'))
  })

  it('R7-11 RED (J6): agent_admin A upserts B\'s genuine property_event with A\'s propertyId and agencyId: 403 EVENT_LOG_AGENCY_MISMATCH, B\'s row unchanged', async () => {
    const res = await persist('adminA', {
      resource: 'property_event', action: 'upsert', id: EV.peB.id,
      data: { id: EV.peB.id, propertyId: P_A, agencyId: AG_A, actorName: 'x', action: 'hijacked', changes: [] },
    })
    expect(await outcome(res, EV.peB.id)).toEqual(refusedUnchanged('EVENT_LOG_AGENCY_MISMATCH', 'peB'))
  })

  it('R7-11b RED: agent_admin A deletes B\'s property_event with A\'s propertyId, and PATCHes B\'s activity via PATCH /api/activities/:id with agencyId A: both 403 EVENT_LOG_AGENCY_MISMATCH, B\'s rows unchanged', async () => {
    const r1 = await persist('adminA', { resource: 'property_event', action: 'delete', id: EV.peB.id, data: { propertyId: P_A, agencyId: AG_A } })
    const o1 = await outcome(r1, EV.peB.id)
    const r2 = await call('PATCH', `/api/activities/${EV.actB.id}`, 'adminA', { agencyId: AG_A, text: 'hijacked via REST', user: 'x' })
    expect({ peDelete: o1, restPatch: await outcome(r2, EV.actB.id) }).toEqual({
      peDelete: refusedUnchanged('EVENT_LOG_AGENCY_MISMATCH', 'peB'),
      restPatch: refusedUnchanged('EVENT_LOG_AGENCY_MISMATCH', 'actB'),
    })
  })

  it('R7-16 RED (C1): an activity with client_id NULL (platform row) is refused to agency staff: agent_admin A upsert with agencyId A, ground_agent A delete with agencyId A and agent_admin A delete with no data are all 403 EVENT_LOG_AGENCY_MISMATCH, row unchanged; super_admin upsert is 200 and client_id stays NULL', async () => {
    const a = await persist('adminA', { resource: 'activity', action: 'upsert', id: EV.actNull.id, data: { id: EV.actNull.id, agencyId: AG_A, text: 'hijacked-null', user: 'x' } })
    const oa = await outcome(a, EV.actNull.id)
    await resetEvents() // each probe starts from the seeded row
    const b = await persist('groundA', { resource: 'activity', action: 'delete', id: EV.actNull.id, data: { agencyId: AG_A } })
    const ob = await outcome(b, EV.actNull.id)
    await resetEvents()
    const c = await persist('adminA', { resource: 'activity', action: 'delete', id: EV.actNull.id })
    const oc = await outcome(c, EV.actNull.id)
    await resetEvents()
    const d = await persist('superAdmin', { resource: 'activity', action: 'upsert', id: EV.actNull.id, data: { id: EV.actNull.id, text: 'platform note (edited)', user: 'System' } })
    const dRow = await ev(EV.actNull.id)
    expect({
      adminUpsert: oa,
      groundDelete: ob,
      adminDeleteNoData: oc,
      superAdmin: { status: d.status, client: dRow ? dRow.client_id : 'row missing', type: dRow?.event_type },
    }).toEqual({
      adminUpsert: refusedUnchanged('EVENT_LOG_AGENCY_MISMATCH', 'actNull'),
      groundDelete: refusedUnchanged('EVENT_LOG_AGENCY_MISMATCH', 'actNull'),
      adminDeleteNoData: refusedUnchanged('EVENT_LOG_AGENCY_MISMATCH', 'actNull'),
      superAdmin: { status: 200, client: null, type: 'activity' },
    })
  })

  it('R7-15 (own row cannot be moved into another agency): agent_admin A upserts A\'s own activity with agencyId B: whatever the status, the row stays in A', async () => {
    const res = await persist('adminA', { resource: 'activity', action: 'upsert', id: EV.actA.fe, data: { id: EV.actA.fe, agencyId: AG_B, text: 'moved?', user: 'Admin A' } })
    const r = await ev(EV.actA.id)
    expect({ statusOk: [200, 403].includes(res.status), client: r?.client_id, type: r?.event_type }).toEqual({ statusOk: true, client: A, type: 'activity' })
  })

  it('R7-15b (own property_event cannot be moved onto another agency\'s property): agent_admin A upserts A\'s property_event with B\'s propertyId: the row keeps A\'s client and unit', async () => {
    const res = await persist('adminA', {
      resource: 'property_event', action: 'upsert', id: EV.peA.fe,
      data: { id: EV.peA.fe, propertyId: P_B, agencyId: AG_B, actorName: 'Admin A', action: 'moved?', changes: [] },
    })
    const r = await ev(EV.peA.id)
    expect({ statusOk: [200, 403].includes(res.status), client: r?.client_id, subject: r?.subject_id }).toEqual({ statusOk: true, client: A, subject: UNIT_A })
  })

  // ---- R7-7 regression controls (green on main and after) -------------------
  it('R7-7a CONTROL: agent_admin A creates, updates (and replays) and deletes its own activity through /api/persist', async () => {
    const body = { resource: 'activity', action: 'upsert', id: 'r7-act-new', data: { id: 'r7-act-new', agencyId: AG_A, text: 'created', user: 'Admin A' } }
    const c1 = await persist('adminA', body)
    const replay = await persist('adminA', body)
    const created = await byFe('r7-act-new')
    const u = await persist('adminA', { resource: 'activity', action: 'upsert', id: EV.actA.fe, data: { id: EV.actA.fe, agencyId: AG_A, text: 'edited', user: 'Admin A' } })
    const edited = await ev(EV.actA.id)
    const d = await persist('adminA', { resource: 'activity', action: 'delete', id: EV.actA.fe })
    expect({
      create: c1.status, replay: replay.status, created: created && { type: created.event_type, client: created.client_id, text: created.payload.text },
      update: u.status, edited: edited && { client: edited.client_id, text: edited.payload.text },
      del: d.status, after: await ev(EV.actA.id),
    }).toEqual({
      create: 200, replay: 200, created: { type: 'activity', client: A, text: 'created' },
      update: 200, edited: { client: A, text: 'edited' },
      del: 200, after: undefined,
    })
  })

  it('R7-7b CONTROL: ground_agent A creates an activity and deletes A\'s own activity', async () => {
    const c1 = await persist('groundA', { resource: 'activity', action: 'upsert', id: 'r7-act-ground', data: { id: 'r7-act-ground', agencyId: AG_A, text: 'ground note', user: 'Ground A' } })
    const created = await byFe('r7-act-ground')
    const d = await persist('groundA', { resource: 'activity', action: 'delete', id: EV.actA.fe, data: { agencyId: AG_A } })
    expect({ create: c1.status, client: created?.client_id, del: d.status, after: await ev(EV.actA.id) }).toEqual({ create: 200, client: A, del: 200, after: undefined })
  })

  it('R7-7c CONTROL: agent_admin A creates, updates and deletes its own property_event on A\'s property', async () => {
    const c1 = await persist('adminA', {
      resource: 'property_event', action: 'upsert', id: 'r7-pe-new',
      data: { id: 'r7-pe-new', propertyId: P_A, agencyId: AG_A, actorName: 'Admin A', action: 'created', changes: [] },
    })
    const created = await byFe('r7-pe-new')
    const u = await persist('adminA', {
      resource: 'property_event', action: 'upsert', id: EV.peA.fe,
      data: { id: EV.peA.fe, propertyId: P_A, agencyId: AG_A, actorName: 'Admin A', action: 'edited', changes: [] },
    })
    const edited = await ev(EV.peA.id)
    const d = await persist('adminA', { resource: 'property_event', action: 'delete', id: EV.peA.fe, data: { propertyId: P_A, agencyId: AG_A } })
    expect({
      create: c1.status, created: created && { type: created.event_type, client: created.client_id, subject: created.subject_id },
      update: u.status, edited: edited && { client: edited.client_id, subject: edited.subject_id, action: edited.payload.action },
      del: d.status, after: await ev(EV.peA.id),
    }).toEqual({
      create: 200, created: { type: 'property_event', client: A, subject: UNIT_A },
      update: 200, edited: { client: A, subject: UNIT_A, action: 'edited' },
      del: 200, after: undefined,
    })
  })

  it('R7-7d CONTROL: portal activity stays append-only (tenant upsert on an existing activity id is 403, row unchanged); agency B\'s rows are untouched by A\'s own edits', async () => {
    const t = await persist('tenA', { resource: 'activity', action: 'upsert', id: EV.actA.id, data: { id: EV.actA.id, agencyId: AG_A, text: 'tenant edit', user: 'x' } })
    await persist('adminA', { resource: 'activity', action: 'upsert', id: EV.actA.fe, data: { id: EV.actA.fe, agencyId: AG_A, text: 'own edit', user: 'Admin A' } })
    expect({ tenant: t.status, actB: await ev(EV.actB.id), peB: await ev(EV.peB.id) }).toEqual({ tenant: 403, actB: seeded.actB, peB: seeded.peB })
  })

  it('R7-7e CONTROL: /api/persist/batch with A\'s own activity create is saved', async () => {
    const res = await call('POST', '/api/persist/batch', 'adminA', {
      ops: [{ resource: 'activity', action: 'upsert', id: 'r7-act-batch2', data: { id: 'r7-act-batch2', agencyId: AG_A, text: 'batch ok', user: 'Admin A' } }],
    })
    const r = await byFe('r7-act-batch2')
    expect({ status: res.status, ok: res.json?.ok, client: r?.client_id, text: r?.payload.text }).toEqual({ status: 200, ok: true, client: A, text: 'batch ok' })
  })

  // ---- R7-8 writer layer (gate skipped on purpose: defence in depth) --------
  it('R7-8a RED (writer): handlePersist activity / property_event delete aimed at the itn row leaves it in place', async () => {
    const { handlePersist } = await import('./writes.js')
    await handlePersist({ resource: 'activity', action: 'delete', id: EV.itnA.id } as never, USERS.adminA.fe, 'agent_admin')
    await handlePersist({ resource: 'property_event', action: 'delete', id: EV.leaseSignedA.id } as never, USERS.adminA.fe, 'agent_admin')
    expect({ itn: await ev(EV.itnA.id), ls: await ev(EV.leaseSignedA.id) }).toEqual({ itn: seeded.itnA, ls: seeded.leaseSignedA })
  })

  it('R7-8b RED (writer): handlePersist activity upsert on the impersonation row throws 409 EVENT_LOG_ID_TAKEN, row unchanged', async () => {
    const { handlePersist } = await import('./writes.js')
    const err = await handlePersist(
      { resource: 'activity', action: 'upsert', id: EV.impB.id, data: { agencyId: AG_A, text: 'x', user: 'x' } } as never,
      USERS.adminA.fe, 'agent_admin',
    ).then(() => null, (e: { status?: number; code?: string }) => ({ status: e.status, code: e.code }))
    expect({ err, row: await ev(EV.impB.id) }).toEqual({ err: { status: 409, code: 'EVENT_LOG_ID_TAKEN' }, row: seeded.impB })
  })

  it('R7-8c RED (writer): handlePersist property_event upsert on the itn row throws 409 EVENT_LOG_ID_TAKEN, row unchanged', async () => {
    const { handlePersist } = await import('./writes.js')
    const err = await handlePersist(
      { resource: 'property_event', action: 'upsert', id: EV.itnA.id, data: { propertyId: P_A, agencyId: AG_A, actorName: 'x', action: 'x', changes: [] } } as never,
      USERS.adminA.fe, 'agent_admin',
    ).then(() => null, (e: { status?: number; code?: string }) => ({ status: e.status, code: e.code }))
    expect({ err, row: await ev(EV.itnA.id) }).toEqual({ err: { status: 409, code: 'EVENT_LOG_ID_TAKEN' }, row: seeded.itnA })
  })
})
