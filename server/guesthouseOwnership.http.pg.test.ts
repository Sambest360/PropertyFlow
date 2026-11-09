import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Guest houses belong to the person and agency that created them, like
 * properties: the creator is recorded, the owner can reassign to any agency's
 * staff or a private landlord, an agency admin only within their agency, and
 * everyone else cannot reassign. Real Hono app (PF_SKIP_SERVE=1), real login,
 * SCRATCH Postgres only. Harness copied from server/guesthousePhotos.http.pg.test.ts.
 */
const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  process.env.AUTH_SECRET = ['gho', 'owner', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})

const TEST_FIXTURE_PW = ['gho', 'fixture', 'pw'].join('-')
const A = 'f6060000-0000-4000-8000-00000000000a'
const B = 'f6060000-0000-4000-8000-00000000000b'
const USERS = {
  owner: { id: 'f6061000-0000-4000-8000-000000000001', fe: 'gho-owner', client: null as string | null, role: 'SUPER_ADMIN', meta: {} },
  administrator: { id: 'f6061000-0000-4000-8000-000000000002', fe: 'gho-administrator', client: null as string | null, role: 'SUPER_ADMIN', meta: { platform_tier: 'administrator' } },
  principalA: { id: 'f6061000-0000-4000-8000-000000000003', fe: 'gho-principal-a', client: A as string | null, role: 'AGENCY_ADMIN', meta: {} },
  adminA: { id: 'f6061000-0000-4000-8000-000000000004', fe: 'gho-admin-a', client: A as string | null, role: 'AGENT_ADMIN', meta: {} },
  groundA: { id: 'f6061000-0000-4000-8000-000000000005', fe: 'gho-ground-a', client: A as string | null, role: 'GROUND_AGENT', meta: {} },
  adminB: { id: 'f6061000-0000-4000-8000-000000000006', fe: 'gho-admin-b', client: B as string | null, role: 'AGENT_ADMIN', meta: {} },
  landlord: { id: 'f6061000-0000-4000-8000-000000000007', fe: 'gho-landlord', client: null as string | null, role: 'LANDLORD', meta: {} },
} as const
type UserKey = keyof typeof USERS
type App = { request: (path: string, init?: RequestInit) => Promise<Response> }

describe.skipIf(!url)('guest houses belong to their creator and agency (real app + Postgres)', () => {
  let db: typeof import('./db.js')
  let app: App
  const tokens: Partial<Record<UserKey, string>> = {}
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)
  let ip = 0
  const ids = Object.values(USERS).map((u) => u.id)

  async function cleanup() {
    await q(`DELETE FROM guesthouses WHERE client_id = ANY($1::uuid[]) OR owner_user_id = ANY($2::uuid[])`, [[A, B], ids]).catch(() => undefined)
    await q(`DELETE FROM entity_id_map WHERE frontend_id LIKE 'gho-%'`)
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids])
    await q(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [[A, B]])
  }
  async function call(method: string, path: string, who: UserKey, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.93.1.${(++ip % 250) + 1}`, Authorization: `Bearer ${tokens[who]}` }
    const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, json: (await res.json().catch(() => null)) as any }
  }
  const row = async (id: string) =>
    (await q<{ client_id: string | null; owner_user_id: string | null }>(`SELECT client_id::text AS client_id, owner_user_id::text AS owner_user_id FROM guesthouses WHERE id = $1::uuid`, [id]))[0]
  const create = async (who: UserKey, extra: Record<string, unknown> = {}) => call('POST', '/api/guesthouses', who, { name: `GHO ${who} house`, city: 'Gqeberha', ...extra })

  beforeAll(async () => {
    db = await import('./db.js')
    const { ensureGuesthouseTables } = await import('./guesthouses.js')
    await ensureGuesthouseTables()
    await cleanup()
    await q(`INSERT INTO clients (id, company_name, subdomain) VALUES ($1::uuid, 'GHO Agency A', 'gho-a'), ($2::uuid, 'GHO Agency B', 'gho-b')`, [A, B])
    const { hashPassword } = await import('./auth.js')
    const hash = await hashPassword(TEST_FIXTURE_PW)
    for (const u of Object.values(USERS)) {
      await q(
        `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'GHO', $5, $6, TRUE, $7::jsonb)`,
        [u.id, u.client, `${u.fe}@example.test`, hash, u.fe, u.role, JSON.stringify({ mustChangePassword: false, ...u.meta })],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [u.fe, u.id])
    }
    app = (await import('./index.js')).default as unknown as App
    let n = 0
    for (const k of Object.keys(USERS) as UserKey[]) {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.93.0.${++n}` },
        body: JSON.stringify({ email: `${USERS[k].fe}@example.test`, password: TEST_FIXTURE_PW }),
      })
      expect(res.status, `login ${k}`).toBe(200)
      tokens[k] = ((await res.json()) as { token: string }).token
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

  it('a new guest house belongs to its creator and their agency; the list shows who', async () => {
    const g = await create('groundA')
    const l = await create('landlord')
    const list = await call('GET', '/api/guesthouses', 'principalA')
    const mine = list.json.find((h: any) => h.id === g.json.id)
    expect({
      ground: await row(g.json.id),
      landlord: await row(l.json.id),
      listed: [mine?.agencyId, mine?.ownerUserId, mine?.agencyName, mine?.hostName],
      bSees: (await call('GET', '/api/guesthouses', 'adminB')).json.some((h: any) => h.id === g.json.id),
    }).toEqual({
      ground: { client_id: A, owner_user_id: USERS.groundA.id },
      landlord: { client_id: null, owner_user_id: USERS.landlord.id },
      listed: [A, USERS.groundA.id, 'GHO Agency A', 'GHO gho-ground-a'],
      bSees: false,
    })
  })

  it('assignees: the owner sees every agency and landlords; an agency admin only their staff; others nothing', async () => {
    const owner = (await call('GET', '/api/guesthouses/assignees', 'owner')).json
    const adminA = (await call('GET', '/api/guesthouses/assignees', 'adminA')).json
    const ground = (await call('GET', '/api/guesthouses/assignees', 'groundA')).json
    const adm = (await call('GET', '/api/guesthouses/assignees', 'administrator')).json
    const has = (o: any, k: UserKey) => o.people.some((p: any) => p.id === USERS[k].id)
    expect({
      owner: [owner.canAssign, owner.agencies.some((a: any) => a.id === B), has(owner, 'landlord'), has(owner, 'adminB')],
      adminA: [adminA.canAssign, adminA.agencies.map((a: any) => a.id), has(adminA, 'groundA'), has(adminA, 'adminB'), has(adminA, 'landlord')],
      ground: ground.canAssign,
      administrator: adm.canAssign,
    }).toEqual({
      owner: [true, true, true, true],
      adminA: [true, [A], true, false, false],
      ground: false,
      administrator: false,
    })
  })

  it('an agency admin reassigns within their agency only; staff and Administrators cannot reassign', async () => {
    const h = (await create('adminA')).json.id
    const ok = await call('PUT', `/api/guesthouses/${h}`, 'adminA', { name: 'GHO moved', city: 'Gqeberha', ownerUserId: USERS.groundA.id })
    const after = await row(h)
    const cross = await call('PUT', `/api/guesthouses/${h}`, 'adminA', { name: 'GHO moved', city: 'Gqeberha', ownerUserId: USERS.adminB.id })
    const ground = await call('PUT', `/api/guesthouses/${h}`, 'groundA', { name: 'GHO moved', city: 'Gqeberha', ownerUserId: USERS.principalA.id })
    expect({ ok: ok.status, after, cross: cross.status, ground: ground.status, still: await row(h) }).toEqual({
      ok: 200,
      after: { client_id: A, owner_user_id: USERS.groundA.id },
      cross: 403,
      ground: 200, // a details edit still saves; the ownerUserId is ignored
      still: { client_id: A, owner_user_id: USERS.groundA.id },
    })
  })

  it('the owner can move a house to another agency or to a private landlord; a mismatched pair is 400', async () => {
    const h = (await create('owner', { agencyId: A, ownerUserId: USERS.adminA.id })).json.id
    const created = await row(h)
    const toB = await call('PUT', `/api/guesthouses/${h}`, 'owner', { name: 'GHO x', city: 'Gqeberha', agencyId: B, ownerUserId: USERS.adminB.id })
    const atB = await row(h)
    const bad = await call('PUT', `/api/guesthouses/${h}`, 'owner', { name: 'GHO x', city: 'Gqeberha', agencyId: A, ownerUserId: USERS.adminB.id })
    const toLl = await call('PUT', `/api/guesthouses/${h}`, 'owner', { name: 'GHO x', city: 'Gqeberha', agencyId: null, ownerUserId: USERS.landlord.id })
    const llSees = (await call('GET', '/api/guesthouses', 'landlord')).json.some((x: any) => x.id === h)
    expect({ created, toB: toB.status, atB, bad: bad.status, toLl: toLl.status, final: await row(h), llSees }).toEqual({
      created: { client_id: A, owner_user_id: USERS.adminA.id },
      toB: 200,
      atB: { client_id: B, owner_user_id: USERS.adminB.id },
      bad: 400,
      toLl: 200,
      final: { client_id: null, owner_user_id: USERS.landlord.id },
      llSees: true,
    })
  })
})
