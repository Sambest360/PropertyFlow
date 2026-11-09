import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * B1: owner-only bulk make-live / decline / take-down and approve-by-agency,
 * with per-row results, audit rows and one digest per agency; one server
 * readiness check (title, photo, address, price) for queue approvals and the
 * owner's own Make live (p11 lives here too). Real Hono app (PF_SKIP_SERVE=1),
 * real login, SCRATCH Postgres only. Harness copied from
 * server/listingApprovals.vacant.http.pg.test.ts.
 */
const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  process.env.AUTH_SECRET = ['b1', 'bulk', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})

const TEST_FIXTURE_PW = ['b1', 'fixture', 'pw'].join('-')
const A = 'fb010000-0000-4000-8000-00000000000a'
const B = 'fb010000-0000-4000-8000-00000000000b'
const AG_A = 'b1-ag-a'
const AG_B = 'b1-ag-b'
const BLD_A = 'fb012000-0000-4000-8000-00000000000a'
const BLD_B = 'fb012000-0000-4000-8000-00000000000b'
const GRAND = 'fb013000-0000-4000-8000-000000000001'
const USERS = {
  owner: { id: 'fb011000-0000-4000-8000-000000000001', fe: 'b1-owner', client: null as string | null, role: 'SUPER_ADMIN', meta: {} },
  administrator: { id: 'fb011000-0000-4000-8000-000000000002', fe: 'b1-administrator', client: null as string | null, role: 'SUPER_ADMIN', meta: { platform_tier: 'administrator' } },
  agencyAdminA: { id: 'fb011000-0000-4000-8000-000000000003', fe: 'b1-agency-admin-a', client: A as string | null, role: 'AGENCY_ADMIN', meta: {} },
  agentAdminA: { id: 'fb011000-0000-4000-8000-000000000004', fe: 'b1-agent-admin-a', client: A as string | null, role: 'AGENT_ADMIN', meta: {} },
  groundA: { id: 'fb011000-0000-4000-8000-000000000005', fe: 'b1-ground-a', client: A as string | null, role: 'GROUND_AGENT', meta: {} },
  agentAdminB: { id: 'fb011000-0000-4000-8000-000000000006', fe: 'b1-agent-admin-b', client: B as string | null, role: 'AGENT_ADMIN', meta: {} },
} as const
type UserKey = keyof typeof USERS
type App = { request: (path: string, init?: RequestInit) => Promise<Response> }
const INDUSTRIAL_TITLE = 'Industrial Property to Rent in Fairview'
const PRICE_MSG = 'Add a rent or sale price before publishing.'
const PHOTO_MSG = 'Add at least one listing photo before publishing.'

describe.skipIf(!url)('B1: owner-only bulk approvals and the readiness check (real app + Postgres)', () => {
  let db: typeof import('./db.js')
  let app: App
  const tokens: Partial<Record<UserKey, string>> = {}
  const uuids: Record<string, string> = {}
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)
  let ip = 0
  const ids = Object.values(USERS).map((u) => u.id)

  async function cleanup() {
    const units = await q<{ id: string }>(`SELECT id::text AS id FROM units WHERE client_id = ANY($1::uuid[])`, [[A, B]]).catch(() => [])
    const u = units.map((x) => x.id)
    if (u.length) {
      await q(`DELETE FROM listing_approvals WHERE unit_id = ANY($1::uuid[])`, [u]).catch(() => undefined)
      await q(`DELETE FROM event_log WHERE subject_id = ANY($1::uuid[])`, [u])
      await q(`DELETE FROM units WHERE id = ANY($1::uuid[])`, [u])
    }
    await q(`DELETE FROM event_log WHERE client_id = ANY($1::uuid[]) OR actor_user_id = ANY($2::uuid[])`, [[A, B], ids])
    await q(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[]) OR client_id = ANY($2::uuid[])`, [ids, [A, B]]).catch(() => undefined)
    await q(`DELETE FROM buildings WHERE client_id = ANY($1::uuid[])`, [[A, B]])
    await q(`DELETE FROM entity_id_map WHERE frontend_id LIKE 'b1-%'`)
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids])
    await q(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [[A, B]])
  }
  async function call(method: string, path: string, who: UserKey | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.87.1.${(++ip % 250) + 1}` }
    if (who) headers.Authorization = `Bearer ${tokens[who]}`
    const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, json: (await res.json().catch(() => null)) as any }
  }
  const base = (fe: string, agency: 'A' | 'B') => ({
    title: `B1 ${fe} apartment`, type: 'Apartment', beds: 2, rent: 9000, listingMode: 'rent', images: ['/api/files/b1-cover.jpg'],
    agencyId: agency === 'A' ? AG_A : AG_B, agentId: agency === 'A' ? USERS.groundA.fe : USERS.agentAdminB.fe,
    buildingId: agency === 'A' ? 'b1-bld-a' : 'b1-bld-b', titleTypeConfirmed: true,
  })
  async function save(who: UserKey, fe: string, agency: 'A' | 'B', over: Record<string, unknown> = {}) {
    const r = await call('POST', '/api/persist', who, { resource: 'property', action: 'upsert', id: fe, data: { ...base(fe, agency), ...over } })
    if (r.json?.uuid && !uuids[fe]) uuids[fe] = r.json.uuid
    return { status: r.status, code: r.json?.code ?? null, message: r.json?.message ?? null }
  }
  const unit = async (fe: string) =>
    (
      await q<{ status: string; featured: boolean; approval: string | null; description: string | null }>(
        `SELECT u.status_config_key AS status, u.featured, a.status AS approval, u.description FROM units u LEFT JOIN listing_approvals a ON a.unit_id = u.id WHERE u.id = $1::uuid`,
        [uuids[fe]],
      )
    )[0]
  const notesFor = async (k: UserKey) => (await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1::uuid`, [USERS[k].id]))[0].n
  const events = async (type: string) => (await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM event_log WHERE event_type = $1`, [type]))[0].n
  const market = async () => JSON.stringify((await call('GET', '/api/public/marketplace?lite=0', null)).json)
  const bulk = (who: UserKey, body: Record<string, unknown>) => call('POST', '/api/admin/listing-approvals/bulk', who, body)
  const requestLive = (fe: string, agency: 'A' | 'B', over: Record<string, unknown> = {}) =>
    save(agency === 'A' ? 'agentAdminA' : 'agentAdminB', fe, agency, { status: 'Published', statusKey: 'PUBLISHED', ...over })
  const dbState = async () =>
    JSON.stringify(
      await q(
        `SELECT u.id, u.status_config_key, a.status, (SELECT COUNT(*) FROM notifications n WHERE n.client_id = ANY($1::uuid[])) AS notes,
                (SELECT COUNT(*) FROM event_log e WHERE e.event_type IN ('listing_approval_decision','listing_withdrawn','listing_bulk_batch')) AS ev
           FROM units u LEFT JOIN listing_approvals a ON a.unit_id = u.id WHERE u.client_id = ANY($1::uuid[]) ORDER BY u.id`,
        [[A, B]],
      ),
    )

  beforeAll(async () => {
    db = await import('./db.js')
    await cleanup()
    await q(
      `INSERT INTO clients (id, company_name, subdomain, settings) VALUES ($1::uuid, 'B1 Agency A', 'b1-a', $3::jsonb), ($2::uuid, 'B1 Agency B', 'b1-b', $4::jsonb)`,
      [A, B, JSON.stringify({ frontend_id: AG_A }), JSON.stringify({ frontend_id: AG_B })],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid), ('agency', $3, $4::uuid)`, [AG_A, A, AG_B, B])
    const { hashPassword } = await import('./auth.js')
    const hash = await hashPassword(TEST_FIXTURE_PW)
    for (const u of Object.values(USERS)) {
      await q(
        `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'B1', 'Test', $5, TRUE, $6::jsonb)`,
        [u.id, u.client, `${u.fe}@example.test`, hash, u.role, JSON.stringify({ mustChangePassword: false, ...u.meta })],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [u.fe, u.id])
    }
    await q(
      `INSERT INTO buildings (id, client_id, name, address, city, province) VALUES ($1::uuid, $2::uuid, 'B1 A', '1 A St', 'Gqeberha', 'EC'), ($3::uuid, $4::uuid, 'B1 B', '1 B St', 'Gqeberha', 'EC')`,
      [BLD_A, A, BLD_B, B],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('building', 'b1-bld-a', $1::uuid), ('building', 'b1-bld-b', $2::uuid)`, [BLD_A, BLD_B])
    app = (await import('./index.js')).default as unknown as App
    let n = 0
    for (const k of Object.keys(USERS) as UserKey[]) {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.87.0.${++n}` },
        body: JSON.stringify({ email: `${USERS[k].fe}@example.test`, password: TEST_FIXTURE_PW }),
      })
      expect(res.status, `login ${k}`).toBe(200)
      tokens[k] = ((await res.json()) as { token: string }).token
    }
    // Pending requests (agency publishes are held for approval).
    await requestLive('b1-a1', 'A')
    await requestLive('b1-a2', 'A', { listingMode: 'sale', rent: null, price: 1500000 })
    await requestLive('b1-a3', 'A', { images: [] })
    await requestLive('b1-a4', 'A')
    await q(`UPDATE units SET title = $2 WHERE id = $1::uuid`, [uuids['b1-a4'], INDUSTRIAL_TITLE])
    await requestLive('b1-a5', 'A', { rent: null, price: null })
    await requestLive('b1-b1', 'B')
    await requestLive('b1-b2', 'B')
    for (const fe of ['b1-a1', 'b1-a2', 'b1-a3', 'b1-a4', 'b1-a5', 'b1-b1', 'b1-b2']) {
      const r = await unit(fe)
      expect([fe, r?.status, r?.approval]).toEqual([fe, 'DRAFT', 'pending'])
    }
  })
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    if (db) await cleanup()
  })

  it('p1. only the owner may use the queue: everyone else gets 403 and nothing changes', async () => {
    const before = await dbState()
    const out: string[] = []
    const target = uuids['b1-a1']
    for (const who of ['administrator', 'agencyAdminA', 'agentAdminA', 'groundA'] as const) {
      const r = [
        await bulk(who, { action: 'approve', unitIds: [target] }),
        await call('GET', '/api/admin/listing-approvals/count?status=pending', who),
        await call('GET', '/api/admin/listing-approvals', who),
        await call('POST', `/api/admin/listing-approvals/${target}`, who, { decision: 'approve' }),
        await call('POST', `/api/admin/listing-approvals/${target}`, who, { decision: 'decline', note: 'x' }),
        await call('POST', `/api/admin/listing-approvals/${target}`, who, { decision: 'withdraw' }),
      ].map((x) => x.status)
      out.push(`${who}: ${r.join(',')}`)
    }
    const owner = [
      (await call('GET', '/api/admin/listing-approvals/count?status=pending', 'owner')).status,
      (await call('GET', '/api/admin/listing-approvals', 'owner')).status,
    ]
    expect({ out, same: (await dbState()) === before, owner }).toEqual({
      out: ['administrator: 403,403,403,403,403,403', 'agencyAdminA: 403,403,403,403,403,403', 'agentAdminA: 403,403,403,403,403,403', 'groundA: 403,403,403,403,403,403'],
      same: true,
      owner: [200, 200],
    })
  })

  let p2Batch = ''
  let notesBefore: Record<string, number> = {}
  it('p2/p5/p9. partial failure: ready rows go live, not-ready rows fail with the reason; one digest per agency; audit rows', async () => {
    notesBefore = { agencyAdminA: await notesFor('agencyAdminA'), agentAdminA: await notesFor('agentAdminA'), agentAdminB: await notesFor('agentAdminB') }
    const decisionsBefore = await events('listing_approval_decision')
    const r = await bulk('owner', { action: 'approve', unitIds: ['b1-a1', 'b1-a2', 'b1-a3', 'b1-a4', 'b1-a5'].map((f) => uuids[f]) })
    p2Batch = r.json.batchId
    const byId = Object.fromEntries((r.json.results as Array<{ id: string }>).map((x) => [x.id, x])) as Record<string, any>
    const row = (fe: string) => byId[uuids[fe]]
    const st = async (fe: string) => { const u = await unit(fe); return [u?.status, u?.approval] }
    const batchRows = await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM event_log WHERE event_type = 'listing_approval_decision' AND payload->>'batchId' = $1`, [p2Batch])
    expect({
      status: r.status,
      a1: [row('b1-a1').ok, ...(await st('b1-a1'))], a2: [row('b1-a2').ok, ...(await st('b1-a2'))],
      a3: [row('b1-a3').ok, row('b1-a3').code, row('b1-a3').error, ...(await st('b1-a3'))],
      a4: [row('b1-a4').ok, row('b1-a4').httpStatus, ...(await st('b1-a4'))],
      a5: [row('b1-a5').ok, row('b1-a5').code, row('b1-a5').error, ...(await st('b1-a5'))],
      summary: [r.json.summary.ok, r.json.summary.failed],
      digest: { agencyAdminA: (await notesFor('agencyAdminA')) - notesBefore.agencyAdminA, agentAdminA: (await notesFor('agentAdminA')) - notesBefore.agentAdminA, agentAdminB: (await notesFor('agentAdminB')) - notesBefore.agentAdminB },
      audit: [(await events('listing_approval_decision')) - decisionsBefore, batchRows[0].n, (await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM event_log WHERE event_type = 'listing_bulk_batch' AND subject_id = $1::uuid`, [p2Batch]))[0].n],
    }).toEqual({
      status: 200,
      a1: [true, 'PUBLISHED', 'approved'], a2: [true, 'PUBLISHED', 'approved'],
      a3: [false, 'LISTING_NOT_READY', PHOTO_MSG, 'DRAFT', 'pending'],
      a4: [false, 409, 'DRAFT', 'pending'],
      a5: [false, 'LISTING_NOT_READY', PRICE_MSG, 'DRAFT', 'pending'],
      summary: [2, 3],
      digest: { agencyAdminA: 1, agentAdminA: 1, agentAdminB: 0 },
      audit: [2, 2, 1],
    })
  })

  it('p4. re-running the same request skips the live rows and sends and audits nothing new (but logs the batch)', async () => {
    const notes = await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM notifications WHERE client_id = $1::uuid`, [A])
    const decisions = await events('listing_approval_decision')
    const batches = await events('listing_bulk_batch')
    const r = await bulk('owner', { action: 'approve', unitIds: ['b1-a1', 'b1-a2', 'b1-a3', 'b1-a4', 'b1-a5'].map((f) => uuids[f]) })
    const skipped = (r.json.results as Array<{ id: string; skipped?: string }>).filter((x) => [uuids['b1-a1'], uuids['b1-a2']].includes(x.id)).map((x) => x.skipped)
    const notesAfter = await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM notifications WHERE client_id = $1::uuid`, [A])
    expect({ skipped, notes: notesAfter[0].n - notes[0].n, decisions: (await events('listing_approval_decision')) - decisions, batches: (await events('listing_bulk_batch')) - batches }).toEqual({
      skipped: ['already_live', 'already_live'], notes: 0, decisions: 0, batches: 1,
    })
  })

  it('p3. cap: 101 ids is a 400 and changes nothing; 100 ids is a 200', async () => {
    const before = await dbState()
    const many = (n: number) => Array.from({ length: n }, (_, i) => `fb01ffff-0000-4000-8000-${String(i).padStart(12, '0')}`)
    const tooMany = await bulk('owner', { action: 'approve', unitIds: many(101) })
    const same = (await dbState()) === before
    const ok = await bulk('owner', { action: 'approve', unitIds: many(100) })
    expect({ tooMany: tooMany.status, same, ok: ok.status, rows: ok.json?.results?.length }).toEqual({ tooMany: 400, same: true, ok: 200, rows: 100 })
  })

  it("p6. approve-by-agency: count, then only that agency's ready pending listings go live", async () => {
    const count = await call('GET', `/api/admin/listing-approvals/count?status=pending&agencyId=${B}`, 'owner')
    const r = await bulk('owner', { action: 'approve', agencyId: AG_B })
    const b = [await unit('b1-b1'), await unit('b1-b2')].map((u) => [u?.status, u?.approval])
    const a = [await unit('b1-a3'), await unit('b1-a5')].map((u) => [u?.status, u?.approval])
    expect({ count: count.json?.count, status: r.status, ok: r.json.summary.ok, remaining: r.json.remainingPending, b, a }).toEqual({
      count: 2, status: 200, ok: 2, remaining: 0,
      b: [['PUBLISHED', 'approved'], ['PUBLISHED', 'approved']],
      a: [['DRAFT', 'pending'], ['DRAFT', 'pending']],
    })
  })

  it('p7. take-down and republish; a grandfathered live listing gets a withdrawn row', async () => {
    const before = await events('listing_withdrawn')
    const w = await bulk('owner', { action: 'withdraw', unitIds: [uuids['b1-a1']] })
    const a1 = await unit('b1-a1')
    const republish = await save('agentAdminA', 'b1-a1', 'A', { status: 'Published', statusKey: 'PUBLISHED' })
    const a1b = await unit('b1-a1')
    const listed = (await market()).includes('B1 b1-a1 apartment')
    await q(
      `INSERT INTO units (id, building_id, client_id, unit_number, listing_type, rent, status_config_key, title, images)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'G1', 'RENT', 7000, 'PUBLISHED', 'B1 grandfathered flat', '["/api/files/g.jpg"]'::jsonb)`,
      [GRAND, BLD_A, A],
    )
    const g = await bulk('owner', { action: 'withdraw', unitIds: [GRAND] })
    const grand = (await q<{ status: string; approval: string | null }>(`SELECT u.status_config_key AS status, a.status AS approval FROM units u LEFT JOIN listing_approvals a ON a.unit_id = u.id WHERE u.id = $1::uuid`, [GRAND]))[0]
    expect({
      w: [w.status, w.json.summary.ok], a1: [a1?.status, a1?.featured, a1?.approval], events: (await events('listing_withdrawn')) - before,
      republish: republish.status, a1b: [a1b?.status, a1b?.approval], listed, g: g.json.summary.ok, grand: [grand.status, grand.approval],
    }).toEqual({
      w: [200, 1], a1: ['OFF_MARKET', false, 'withdrawn'], events: 2,
      republish: 200, a1b: ['DRAFT', 'pending'], listed: false, g: 1, grand: ['OFF_MARKET', 'withdrawn'],
    })
  })

  it('p8. single approve runs the same readiness check (422) and writes one audit row when it succeeds', async () => {
    const a3 = await call('POST', `/api/admin/listing-approvals/${uuids['b1-a3']}`, 'owner', { decision: 'approve' })
    const a5 = await call('POST', `/api/admin/listing-approvals/${uuids['b1-a5']}`, 'owner', { decision: 'approve' })
    await requestLive('b1-a6', 'A')
    const before = await events('listing_approval_decision')
    const a6 = await call('POST', `/api/admin/listing-approvals/${uuids['b1-a6']}`, 'owner', { decision: 'approve' })
    expect({
      a3: [a3.status, a3.json?.code, a3.json?.message, (await unit('b1-a3'))?.status, (await unit('b1-a3'))?.approval],
      a5: [a5.status, a5.json?.message, (await unit('b1-a5'))?.status],
      a6: [a6.status, (await unit('b1-a6'))?.status, (await events('listing_approval_decision')) - before],
    }).toEqual({
      a3: [422, 'LISTING_NOT_READY', PHOTO_MSG, 'DRAFT', 'pending'],
      a5: [422, PRICE_MSG, 'DRAFT'],
      a6: [200, 'PUBLISHED', 1],
    })
  })

  it("p11. the owner's own Make live runs the readiness check on the not-live -> live transition only", async () => {
    // a: no photo / no price -> 422, stays DRAFT, no approved row.
    await save('owner', 'b1-o1', 'A', { status: 'Draft', images: [] })
    const noPhoto = await save('owner', 'b1-o1', 'A', { status: 'Published', images: [] })
    await save('owner', 'b1-o2', 'A', { status: 'Draft', rent: null, price: null })
    const noPrice = await save('owner', 'b1-o2', 'A', { status: 'Published', rent: null, price: null })
    const o1 = await unit('b1-o1')
    const o2 = await unit('b1-o2')
    // b: ready -> 200 and public.
    await save('owner', 'b1-o3', 'A', { status: 'Draft' })
    const ready = await save('owner', 'b1-o3', 'A', { status: 'Published' })
    // c: stored rent NULL, this save sends a rent -> 200 and public.
    await save('owner', 'b1-o4', 'A', { status: 'Draft', rent: null })
    const payloadWins = await save('owner', 'b1-o4', 'A', { status: 'Published', rent: 9000 })
    const text = await market()
    // d: an already-live listing with no price: a details resend is not a transition -> 200.
    await save('owner', 'b1-o5', 'A', { status: 'Published' })
    await q(`UPDATE units SET rent = NULL, price = NULL WHERE id = $1::uuid`, [uuids['b1-o5']])
    const detail = await save('owner', 'b1-o5', 'A', { status: 'Published', rent: null, price: null, description: 'New words' })
    const o5 = await unit('b1-o5')
    expect({
      noPhoto: [noPhoto.status, noPhoto.code, noPhoto.message, o1?.status, o1?.approval],
      noPrice: [noPrice.status, noPrice.message, o2?.status, o2?.approval],
      ready: [ready.status, (await unit('b1-o3'))?.status, text.includes('B1 b1-o3 apartment')],
      payloadWins: [payloadWins.status, (await unit('b1-o4'))?.status, text.includes('B1 b1-o4 apartment')],
      detail: [detail.status, o5?.status, o5?.description],
    }).toEqual({
      noPhoto: [422, 'LISTING_NOT_READY', PHOTO_MSG, 'DRAFT', null],
      noPrice: [422, PRICE_MSG, 'DRAFT', null],
      ready: [200, 'PUBLISHED', true],
      payloadWins: [200, 'PUBLISHED', true],
      detail: [200, 'PUBLISHED', 'New words'],
    })
  })
})
