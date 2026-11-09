import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * P4: only the owner (full super admin) makes a listing live, takes it down,
 * features it or marks it Under Offer. Agency staff, landlords and
 * Administrators edit details only. Real Hono app (PF_SKIP_SERVE=1), real
 * login, SCRATCH Postgres only. Harness shape copied from
 * server/listingApprovals.vacant.http.pg.test.ts.
 */
const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  process.env.AUTH_SECRET = ['p4', 'live', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})

const TEST_FIXTURE_PW = ['p4', 'fixture', 'pw'].join('-')
const A = 'f4040000-0000-4000-8000-00000000000a'
const AG_A = 'p4-ag-a'
const BLD = 'f4042000-0000-4000-8000-000000000001'
const BLD_FE = 'p4-bld-a'
const USERS = {
  owner: { id: 'f4041000-0000-4000-8000-000000000001', fe: 'p4-owner', client: null as string | null, role: 'SUPER_ADMIN', meta: {} },
  administrator: { id: 'f4041000-0000-4000-8000-000000000002', fe: 'p4-administrator', client: null as string | null, role: 'SUPER_ADMIN', meta: { platform_tier: 'administrator' } },
  adminA: { id: 'f4041000-0000-4000-8000-000000000003', fe: 'p4-admin-a', client: A as string | null, role: 'AGENT_ADMIN', meta: {} },
  groundA: { id: 'f4041000-0000-4000-8000-000000000004', fe: 'p4-ground-a', client: A as string | null, role: 'GROUND_AGENT', meta: {} },
} as const
type UserKey = keyof typeof USERS
type App = { request: (path: string, init?: RequestInit) => Promise<Response> }
type UnitRow = { status: string; featured: boolean; listing_type: string; advert: boolean; title: string; rent: string | null; approval: string | null; reviewed_by: string | null; note: string | null }

describe.skipIf(!url)('P4: only the owner changes whether a listing is live (real app + Postgres)', () => {
  let db: typeof import('./db.js')
  let app: App
  const tokens: Partial<Record<UserKey, string>> = {}
  const uuids: Record<string, string> = {}
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)
  let ip = 0

  async function cleanup() {
    const units = await q<{ id: string }>(`SELECT id::text AS id FROM units WHERE client_id = $1::uuid`, [A]).catch(() => [])
    const ids = units.map((u) => u.id)
    if (ids.length) {
      await q(`DELETE FROM listing_approvals WHERE unit_id = ANY($1::uuid[])`, [ids]).catch(() => undefined)
      await q(`DELETE FROM event_log WHERE subject_id = ANY($1::uuid[])`, [ids])
      await q(`DELETE FROM units WHERE id = ANY($1::uuid[])`, [ids])
    }
    await q(`DELETE FROM guesthouses WHERE client_id = $1::uuid`, [A]).catch(() => undefined)
    await q(`DELETE FROM event_log WHERE client_id = $1::uuid OR actor_user_id = ANY($2::uuid[])`, [A, Object.values(USERS).map((u) => u.id)])
    await q(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[]) OR client_id = $2::uuid`, [Object.values(USERS).map((u) => u.id), A]).catch(() => undefined)
    await q(`DELETE FROM buildings WHERE client_id = $1::uuid`, [A])
    await q(`DELETE FROM entity_id_map WHERE frontend_id LIKE 'p4-%'`)
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [Object.values(USERS).map((u) => u.id)])
    await q(`DELETE FROM clients WHERE id = $1::uuid`, [A])
  }
  async function call(method: string, path: string, who: UserKey | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.85.1.${(++ip % 250) + 1}` }
    if (who) headers.Authorization = `Bearer ${tokens[who]}`
    const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await res.text()
    let json: any = null
    try { json = JSON.parse(text) } catch { /* not json */ }
    return { status: res.status, json, text }
  }
  const base = (fe: string) => ({
    title: `P4 ${fe} apartment`, type: 'Apartment', beds: 2, rent: 9000, listingMode: 'rent', images: ['/api/files/p4-cover.jpg'],
    agencyId: AG_A, agentId: USERS.groundA.fe, buildingId: BLD_FE, titleTypeConfirmed: true,
  })
  async function save(who: UserKey, fe: string, over: Record<string, unknown>, resource: 'property' | 'unit' = 'property') {
    const r = await call('POST', '/api/persist', who, { resource, action: 'upsert', id: fe, data: { ...base(fe), ...over } })
    if (r.json?.uuid && !uuids[fe]) uuids[fe] = r.json.uuid
    return { status: r.status, code: r.json?.code ?? null }
  }
  const unit = async (fe: string) =>
    (
      await q<UnitRow>(
        `SELECT u.status_config_key AS status, u.featured, u.listing_type, u.advertise_while_occupied AS advert, u.title, u.rent::text AS rent,
                a.status AS approval, a.reviewed_by::text AS reviewed_by, a.note
           FROM units u LEFT JOIN listing_approvals a ON a.unit_id = u.id WHERE u.id = $1::uuid`,
        [uuids[fe]],
      )
    )[0]
  const pick = (r: UnitRow | undefined) => r && { status: r.status, featured: r.featured, listing_type: r.listing_type, advert: r.advert, approval: r.approval }
  const market = async () => (await call('GET', '/api/public/marketplace?lite=0', null)).text
  const publish = async (fe: string) => {
    expect((await save('owner', fe, { status: 'Published', statusKey: 'PUBLISHED' })).status).toBe(200)
  }

  beforeAll(async () => {
    db = await import('./db.js')
    await cleanup()
    await q(`INSERT INTO clients (id, company_name, subdomain) VALUES ($1::uuid, 'P4 Agency A', 'p4-a')`, [A])
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid)`, [AG_A, A])
    const { hashPassword } = await import('./auth.js')
    const hash = await hashPassword(TEST_FIXTURE_PW)
    for (const u of Object.values(USERS)) {
      await q(
        `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'P4', 'Test', $5, TRUE, $6::jsonb)`,
        [u.id, u.client, `${u.fe}@example.test`, hash, u.role, JSON.stringify({ mustChangePassword: false, ...u.meta })],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [u.fe, u.id])
    }
    await q(`INSERT INTO buildings (id, client_id, name, address, city, province) VALUES ($1::uuid, $2::uuid, 'P4 Block', '4 Live St', 'Gqeberha', 'EC')`, [BLD, A])
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('building', $1, $2::uuid)`, [BLD_FE, BLD])
    app = (await import('./index.js')).default as unknown as App
    let n = 0
    for (const k of Object.keys(USERS) as UserKey[]) {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.85.0.${++n}` },
        body: JSON.stringify({ email: `${USERS[k].fe}@example.test`, password: TEST_FIXTURE_PW }),
      })
      expect(res.status, `login ${k}`).toBe(200)
      tokens[k] = ((await res.json()) as { token: string }).token
    }
    // L1 live; L2 approved then unpublished by the owner; L4 a pending agency request; L5/L6/L8 live.
    for (const fe of ['p4-l1', 'p4-l2', 'p4-l5', 'p4-l6', 'p4-l8']) await publish(fe)
    expect((await save('owner', 'p4-l2', { status: 'Draft', statusKey: 'DRAFT' })).status).toBe(200)
    expect((await save('adminA', 'p4-l4', { status: 'Published', statusKey: 'PUBLISHED' })).status).toBe(200)
  })
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    if (db) await cleanup()
  })

  it('f. agency staff and Administrators cannot unpublish, archive, mark Under Offer, feature or unlist a live listing', async () => {
    const before = pick(await unit('p4-l1'))
    const attempts: Array<[string, Record<string, unknown>, 'property' | 'unit']> = [
      ['Draft', { status: 'Draft' }, 'property'],
      ['archive', { statusKey: 'DELETED', deletedAt: '2026-11-09T10:00:00.000Z' }, 'property'],
      ['Under Offer', { status: 'Under Offer' }, 'property'],
      ['featured', { status: 'Published', featured: true }, 'property'],
      ['not_listed', { status: 'Published', listingMode: 'not_listed' }, 'unit'],
    ]
    const results: string[] = []
    for (const who of ['adminA', 'groundA', 'administrator'] as const) {
      for (const [name, over, resource] of attempts) {
        const r = await save(who, 'p4-l1', over, resource)
        results.push(`${who} ${name}: ${r.status} ${r.code}`)
      }
    }
    expect(results.filter((x) => !x.endsWith('403 LISTING_LIVE_OWNER_ONLY'))).toEqual([])
    expect({ row: pick(await unit('p4-l1')), listed: (await market()).includes('P4 p4-l1 apartment') }).toEqual({ row: before, listed: true })
  })

  it('g. detail edits of a live listing stay open (whole bootstrap row resend, property and unit resource)', async () => {
    const out: string[] = []
    let i = 0
    for (const who of ['adminA', 'groundA', 'administrator'] as const) {
      const boot = await call('GET', '/api/bootstrap', who)
      const prop = (boot.json.properties as Array<Record<string, unknown>>).find((p) => p.id === 'p4-l1')
      expect(prop, `${who} sees L1`).toBeTruthy()
      const title = `P4 p4-l1 apartment v${++i}`
      const r = await call('POST', '/api/persist', who, { resource: 'property', action: 'upsert', id: 'p4-l1', data: { ...prop, title, rent: 9000 + i, titleTypeConfirmed: true } })
      const row = await unit('p4-l1')
      out.push(`${who}: ${r.status} ${row?.title === title} ${row?.rent} ${row?.status} ${row?.approval}`)
    }
    const viaUnit = await save('adminA', 'p4-l1', { title: 'P4 p4-l1 apartment', statusKey: 'PUBLISHED', status: 'Published' }, 'unit')
    expect({ out, viaUnit: viaUnit.status, status: (await unit('p4-l1'))?.status }).toEqual({
      out: ['adminA: 200 true 9001.00 PUBLISHED approved', 'groundA: 200 true 9002.00 PUBLISHED approved', 'administrator: 200 true 9003.00 PUBLISHED approved'],
      viaUnit: 200, status: 'PUBLISHED',
    })
  })

  it('h. approved once is not approved forever: a non-owner re-publish of an unpublished listing waits for review', async () => {
    const res: number[] = []
    for (const who of ['adminA', 'administrator'] as const) res.push((await save(who, 'p4-l2', { status: 'Published', statusKey: 'PUBLISHED' })).status)
    const row = await unit('p4-l2')
    expect({ res, status: row?.status, approval: row?.approval, listed: (await market()).includes('P4 p4-l2 apartment') }).toEqual({
      res: [200, 200], status: 'DRAFT', approval: 'pending', listed: false,
    })
  })

  it('i. operational changes of a hidden listing stay open (Maintenance, Rented)', async () => {
    const m = await save('adminA', 'p4-l2', { status: 'Maintenance' })
    const mStatus = (await unit('p4-l2'))?.status
    const o = await save('adminA', 'p4-l2', { status: 'Rented' })
    expect({ m: m.status, mStatus, o: o.status, oStatus: (await unit('p4-l2'))?.status }).toEqual({ m: 200, mStatus: 'MAINTENANCE', o: 200, oStatus: 'OCCUPIED' })
  })

  it('j. an Administrator cannot approve or decline, and (B1) cannot read the queue either', async () => {
    const ap = await call('POST', `/api/admin/listing-approvals/${uuids['p4-l4']}`, 'administrator', { decision: 'approve' })
    const de = await call('POST', `/api/admin/listing-approvals/${uuids['p4-l4']}`, 'administrator', { decision: 'decline', note: 'x' })
    const list = await call('GET', '/api/admin/listing-approvals', 'administrator')
    const row = await unit('p4-l4')
    expect({ ap: ap.status, de: de.status, list: list.status, status: row?.status, approval: row?.approval }).toEqual({ ap: 403, de: 403, list: 403, status: 'DRAFT', approval: 'pending' })
  })

  it('k. the owner approves, declines, features and unpublishes', async () => {
    const ap = await call('POST', `/api/admin/listing-approvals/${uuids['p4-l4']}`, 'owner', { decision: 'approve' })
    const l4 = await unit('p4-l4')
    await save('adminA', 'p4-l7', { status: 'Published', statusKey: 'PUBLISHED' })
    const de = await call('POST', `/api/admin/listing-approvals/${uuids['p4-l7']}`, 'owner', { decision: 'decline', note: 'Photos missing' })
    const l7 = await unit('p4-l7')
    const feat = await save('owner', 'p4-l1', { status: 'Featured', featured: true })
    const l1f = await unit('p4-l1')
    const draft = await save('owner', 'p4-l1', { status: 'Draft', featured: false })
    const text = await market()
    expect({
      ap: ap.status, l4: [l4?.status, l4?.approval], l4Listed: text.includes('P4 p4-l4 apartment'),
      de: de.status, l7: [l7?.status, l7?.approval, l7?.note], l7Listed: text.includes('P4 p4-l7 apartment'),
      feat: feat.status, l1f: [l1f?.status, l1f?.featured], draft: draft.status, l1: (await unit('p4-l1'))?.status,
    }).toEqual({
      ap: 200, l4: ['PUBLISHED', 'approved'], l4Listed: true,
      de: 200, l7: ['DRAFT', 'declined', 'Photos missing'], l7Listed: false,
      feat: 200, l1f: ['FEATURED', true], draft: 200, l1: 'DRAFT',
    })
  })

  it('l. take-down: owner only; OFF_MARKET + withdrawn; hidden is 409; a later agency publish goes back to review', async () => {
    const w1 = await call('POST', `/api/admin/listing-approvals/${uuids['p4-l5']}`, 'owner', { decision: 'withdraw' })
    const l5 = await unit('p4-l5')
    const w2 = await call('POST', `/api/admin/listing-approvals/${uuids['p4-l6']}`, 'owner', { decision: 'withdraw', note: 'Wrong photos' })
    const hidden = await call('POST', `/api/admin/listing-approvals/${uuids['p4-l7']}`, 'owner', { decision: 'withdraw' })
    const before8 = pick(await unit('p4-l8'))
    const adm = await call('POST', `/api/admin/listing-approvals/${uuids['p4-l8']}`, 'administrator', { decision: 'withdraw' })
    const agc = await call('POST', `/api/admin/listing-approvals/${uuids['p4-l8']}`, 'adminA', { decision: 'withdraw' })
    const after8 = pick(await unit('p4-l8'))
    const repub = await save('adminA', 'p4-l5', { status: 'Published', statusKey: 'PUBLISHED' })
    const l5b = await unit('p4-l5')
    expect({
      w1: w1.status, l5: [l5?.status, l5?.featured, l5?.approval, l5?.reviewed_by, l5?.note], l5Listed: (await market()).includes('P4 p4-l5 apartment'),
      w2: w2.status, l6note: (await unit('p4-l6'))?.note, hidden: [hidden.status, hidden.json?.code],
      adm: adm.status, agc: agc.status, l8same: JSON.stringify(after8) === JSON.stringify(before8),
      repub: repub.status, l5b: [l5b?.status, l5b?.approval],
    }).toEqual({
      w1: 200, l5: ['OFF_MARKET', false, 'withdrawn', USERS.owner.id, null], l5Listed: false,
      w2: 200, l6note: 'Wrong photos', hidden: [409, 'LISTING_NOT_LIVE'],
      adm: 403, agc: 403, l8same: true,
      repub: 200, l5b: ['DRAFT', 'pending'],
    })
  })

  it('m. only the owner switches the occupied advert', async () => {
    expect((await save('owner', 'p4-l9', { status: 'Rented' })).status).toBe(200)
    const path = `/api/units/${uuids['p4-l9']}/advertise-while-occupied`
    const a = await call('PATCH', path, 'adminA', { enabled: true })
    const b = await call('PATCH', path, 'administrator', { enabled: true })
    const advert = (await unit('p4-l9'))?.advert
    const o = await call('PATCH', path, 'owner', { enabled: true })
    expect({ a: a.status, b: b.status, advert, ownerPassesRoleGate: o.status !== 403 }).toEqual({ a: 403, b: 403, advert: false, ownerPassesRoleGate: true })
  })

  it('n. guest houses: only the owner publishes or unpublishes; details and draft <-> paused stay open', async () => {
    const h = await call('POST', '/api/guesthouses', 'adminA', { name: 'P4 House', city: 'Gqeberha' })
    const id = h.json.id as string
    expect((await call('POST', `/api/guesthouses/${id}/rooms`, 'adminA', { name: 'Room', nightlyRate: 500 })).status).toBe(200)
    const body = { name: 'P4 House', city: 'Gqeberha' }
    const statusOf = async () => (await q<{ s: string; n: string }>(`SELECT status AS s, name AS n FROM guesthouses WHERE id = $1::uuid`, [id]))[0]
    const agencyPub = await call('PUT', `/api/guesthouses/${id}`, 'adminA', { ...body, status: 'published' })
    const s1 = (await statusOf()).s
    const admPub = await call('PUT', `/api/guesthouses/${id}`, 'administrator', { ...body, status: 'published' })
    const ownerPub = await call('PUT', `/api/guesthouses/${id}`, 'owner', { ...body, status: 'published' })
    const rename = await call('PUT', `/api/guesthouses/${id}`, 'adminA', { ...body, name: 'P4 House Renamed', status: 'published' })
    const renamed = (await statusOf()).n
    const pause = await call('PUT', `/api/guesthouses/${id}`, 'adminA', { ...body, name: 'P4 House Renamed', status: 'paused' })
    const h2 = await call('POST', '/api/guesthouses', 'adminA', { name: 'P4 House Two', city: 'Gqeberha' })
    const pause2 = await call('PUT', `/api/guesthouses/${h2.json.id}`, 'adminA', { name: 'P4 House Two', city: 'Gqeberha', status: 'paused' })
    expect({ agencyPub: agencyPub.status, s1, admPub: admPub.status, ownerPub: ownerPub.status, rename: rename.status, renamed, pause: pause.status, pause2: pause2.status }).toEqual({
      agencyPub: 403, s1: 'draft', admPub: 403, ownerPub: 200, rename: 200, renamed: 'P4 House Renamed', pause: 403, pause2: 200,
    })
  })

  it('o. hard delete is the owner\'s alone', async () => {
    expect((await save('owner', 'p4-spare', { status: 'Draft' })).status).toBe(200)
    const adm = await call('POST', '/api/persist', 'administrator', { resource: 'property', action: 'delete', id: 'p4-spare' })
    const still = Boolean(await unit('p4-spare'))
    const own = await call('POST', '/api/persist', 'owner', { resource: 'property', action: 'delete', id: 'p4-spare' })
    expect({ adm: adm.status, still, own: own.status, gone: !(await unit('p4-spare')) }).toEqual({ adm: 403, still: true, own: 200, gone: true })
  })

  it('p. legit, unchanged: an agency publish of a brand-new listing is DRAFT + pending', async () => {
    const r = await save('adminA', 'p4-new', { status: 'Published', statusKey: 'PUBLISHED' })
    const row = await unit('p4-new')
    expect({ r: r.status, status: row?.status, approval: row?.approval }).toEqual({ r: 200, status: 'DRAFT', approval: 'pending' })
  })
})
