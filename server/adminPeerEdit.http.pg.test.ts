import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ADM-4: an Administrator cannot rewrite a peer Administrator's sign-in email
 * or role through plain /api/persist (no impersonation headers). Name, phone
 * and active stay editable. Real Hono app (PF_SKIP_SERVE=1), real login,
 * SCRATCH Postgres only. Harness copied from server/adminImpersonation.http.pg.test.ts.
 */
const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  process.env.AUTH_SECRET = ['adm4', 'peer', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})

const TEST_FIXTURE_PW = ['adm4', 'fixture', 'pw'].join('-')
const A = 'ad040000-0000-4000-8000-00000000000a'
const AG_A = 'adm4-ag-a'
const USERS = {
  owner: { id: 'ad041000-0000-4000-8000-000000000001', fe: 'adm4-owner', client: null as string | null, role: 'SUPER_ADMIN', meta: {} },
  administrator: { id: 'ad041000-0000-4000-8000-000000000002', fe: 'adm4-administrator', client: null as string | null, role: 'SUPER_ADMIN', meta: { platform_tier: 'administrator' } },
  administrator2: { id: 'ad041000-0000-4000-8000-000000000003', fe: 'adm4-administrator2', client: null as string | null, role: 'SUPER_ADMIN', meta: { platform_tier: 'administrator' } },
  agencyAdmin: { id: 'ad041000-0000-4000-8000-000000000004', fe: 'adm4-agency-admin', client: A as string | null, role: 'AGENT_ADMIN', meta: {} },
  tenant: { id: 'ad041000-0000-4000-8000-000000000005', fe: 'adm4-tenant', client: A as string | null, role: 'END_USER', meta: {} },
} as const
type UserKey = keyof typeof USERS
type App = { request: (path: string, init?: RequestInit) => Promise<Response> }
const emailOf = (k: UserKey) => `${USERS[k].fe}@example.test`

describe.skipIf(!url)("ADM-4: an Administrator cannot change a peer Administrator's email or role (real app + Postgres)", () => {
  let db: typeof import('./db.js')
  let app: App
  const tokens: Partial<Record<UserKey, string>> = {}
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)
  const ids = Object.values(USERS).map((u) => u.id)
  let ip = 0

  async function cleanup() {
    await q(`DELETE FROM event_log WHERE actor_user_id = ANY($1::uuid[]) OR subject_id = ANY($1::uuid[]) OR client_id = $2::uuid`, [ids, A])
    await q(`DELETE FROM auth_tokens WHERE user_id = ANY($1::uuid[])`, [ids]).catch(() => undefined)
    await q(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [ids]).catch(() => undefined)
    await q(`DELETE FROM entity_id_map WHERE frontend_id LIKE 'adm4-%'`)
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids])
    await q(`DELETE FROM clients WHERE id = $1::uuid`, [A])
  }
  async function login(key: UserKey, password = TEST_FIXTURE_PW) {
    return app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.84.0.${++ip}` },
      body: JSON.stringify({ email: emailOf(key), password }),
    })
  }
  async function call(method: string, path: string, who: UserKey | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.84.1.${++ip}` }
    if (who) headers.Authorization = `Bearer ${tokens[who]}`
    const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, json: (await res.json().catch(() => null)) as any }
  }
  const upsertUser = (who: UserKey, target: UserKey, data: Record<string, unknown>) =>
    call('POST', '/api/persist', who, { resource: 'user', action: 'upsert', id: USERS[target].fe, data: { id: USERS[target].fe, ...data } })
  const row = async (k: UserKey) =>
    (
      await q<{ email: string; role: string; first_name: string; last_name: string; phone: string | null; active: boolean; must: string | null }>(
        `SELECT email, role, first_name, last_name, phone, active, metadata->>'mustChangePassword' AS must FROM users WHERE id = $1::uuid`,
        [USERS[k].id],
      )
    )[0]
  const bootstrapRow = async (who: UserKey, target: UserKey) => {
    const b = await call('GET', '/api/bootstrap', who)
    expect(b.status).toBe(200)
    const u = (b.json.users as Array<Record<string, unknown>>).find((x) => x.id === USERS[target].fe)
    expect(u, `${target} in ${who}'s bootstrap`).toBeTruthy()
    return u!
  }

  beforeAll(async () => {
    db = await import('./db.js')
    await cleanup()
    await q(`INSERT INTO clients (id, company_name, subdomain) VALUES ($1::uuid, 'ADM4 Agency A', 'adm4-a')`, [A])
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid)`, [AG_A, A])
    const { hashPassword } = await import('./auth.js')
    const hash = await hashPassword(TEST_FIXTURE_PW)
    for (const u of Object.values(USERS)) {
      await q(
        `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'ADM4', 'Test', $5, TRUE, $6::jsonb)`,
        [u.id, u.client, `${u.fe}@example.test`, hash, u.role, JSON.stringify({ mustChangePassword: false, ...u.meta })],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [u.fe, u.id])
    }
    app = (await import('./index.js')).default as unknown as App
    for (const k of Object.keys(USERS) as UserKey[]) {
      const r = await login(k)
      expect(r.status, `login ${k}`).toBe(200)
      tokens[k] = ((await r.json()) as { token: string }).token
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

  it("c. a plain email upsert on a peer Administrator is 403; no reset reaches the new address", async () => {
    const res = await upsertUser('administrator', 'administrator2', { email: 'lateral@example.test' })
    await call('POST', '/api/auth/forgot-password', null, { email: 'lateral@example.test' })
    const tokensFor = await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM auth_tokens WHERE user_id = $1::uuid`, [USERS.administrator2.id]).catch(() => [{ n: 0 }])
    expect({ status: res.status, email: (await row('administrator2')).email, tokens: tokensFor[0].n }).toEqual({ status: 403, email: emailOf('administrator2'), tokens: 0 })
  })

  it('c2. the whole bootstrap row with a new email and name is 403, and nothing changes', async () => {
    const u = await bootstrapRow('administrator', 'administrator2')
    const res = await upsertUser('administrator', 'administrator2', { ...u, email: 'lateral2@example.test', name: 'Renamed' })
    const r = await row('administrator2')
    expect({ status: res.status, email: r.email, first: r.first_name }).toEqual({ status: 403, email: emailOf('administrator2'), first: 'ADM4' })
  })

  it("c3. changing a peer's role is 403 and the role stays SUPER_ADMIN", async () => {
    const res = await upsertUser('administrator', 'administrator2', { role: 'tenant' })
    expect({ status: res.status, role: (await row('administrator2')).role }).toEqual({ status: 403, role: 'SUPER_ADMIN' })
  })

  it('c4. password fields on a peer are ignored: 200, name changes, the old password still works', async () => {
    const res = await upsertUser('administrator', 'administrator2', { name: 'Pw Try', password: 'n'.repeat(14), tempPassword: 't'.repeat(14) })
    const r = await row('administrator2')
    const relog = await login('administrator2')
    expect({ status: res.status, first: r.first_name, relog: relog.status, must: r.must === 'true' }).toEqual({ status: 200, first: 'Pw', relog: 200, must: false })
  })

  it('d. name, phone and active stay editable on a peer (whole row, same email and role)', async () => {
    const u = await bootstrapRow('administrator', 'administrator2')
    const res = await upsertUser('administrator', 'administrator2', { ...u, name: 'Renamed Peer', phone: '+27 82 111 2222', active: false })
    const r = await row('administrator2')
    expect({ status: res.status, name: `${r.first_name} ${r.last_name}`, phone: r.phone, active: r.active, email: r.email }).toEqual({
      status: 200, name: 'Renamed Peer', phone: '+27 82 111 2222', active: false, email: emailOf('administrator2'),
    })
    await q(`UPDATE users SET active = TRUE WHERE id = $1::uuid`, [USERS.administrator2.id])
  })

  it('e. control: the owner stays protected, and the dedicated routes still refuse a peer', async () => {
    const owner = await upsertUser('administrator', 'owner', { email: 'lateral3@example.test' })
    const viaEmail = await call('POST', '/api/admin/users/email', 'administrator', { userId: USERS.administrator2.fe, email: 'lateral4@example.test' })
    const viaReset = await call('POST', '/api/auth/reset-password', 'administrator', { userId: USERS.administrator2.fe })
    expect({ owner: owner.status, ownerEmail: (await row('owner')).email, viaEmail: viaEmail.status, viaReset: viaReset.status }).toEqual({
      owner: 403, ownerEmail: emailOf('owner'), viaEmail: 403, viaReset: 403,
    })
  })

  it("f. legit: an Administrator edits a tenant's name", async () => {
    const res = await upsertUser('administrator', 'tenant', { name: 'Tina Tenant' })
    expect({ status: res.status, first: (await row('tenant')).first_name }).toEqual({ status: 200, first: 'Tina' })
  })

  it('g. legit: an Administrator edits their own name and phone', async () => {
    const res = await upsertUser('administrator', 'administrator', { name: 'Ada Admin', phone: '+27 83 000 1111' })
    const r = await row('administrator')
    expect({ status: res.status, first: r.first_name, phone: r.phone }).toEqual({ status: 200, first: 'Ada', phone: '+27 83 000 1111' })
  })

  it("h. legit: the owner changes an Administrator's email", async () => {
    const res = await upsertUser('owner', 'administrator2', { email: 'owner-set@example.test' })
    expect({ status: res.status, email: (await row('administrator2')).email }).toEqual({ status: 200, email: 'owner-set@example.test' })
  })
})
