import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ADM-2: an Administrator (SUPER_ADMIN + metadata.platform_tier
 * 'administrator') cannot take over the owner's account by impersonating the
 * owner's row with a lying X-Role. Reproduces Angela's probe through the real
 * Hono app (PF_SKIP_SERVE=1), real login, real resolveRequestActor
 * (NODE_ENV production) and real /api/persist, on a SCRATCH Postgres only.
 * Harness shape copied from server/auditRowIntegrity.http.pg.test.ts.
 */
const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  process.env.AUTH_SECRET = ['adm2', 'impersonation', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})

const TEST_FIXTURE_PW = ['adm2', 'fixture', 'pw'].join('-')
const A = 'ad020000-0000-4000-8000-00000000000a'
const AG_A = 'adm2-ag-a'
const USERS = {
  owner: { id: 'ad021000-0000-4000-8000-000000000001', fe: 'adm2-owner', client: null as string | null, role: 'SUPER_ADMIN', meta: {} },
  administrator: { id: 'ad021000-0000-4000-8000-000000000002', fe: 'adm2-administrator', client: null as string | null, role: 'SUPER_ADMIN', meta: { platform_tier: 'administrator' } },
  agencyAdmin: { id: 'ad021000-0000-4000-8000-000000000003', fe: 'adm2-agency-admin', client: A as string | null, role: 'AGENT_ADMIN', meta: {} },
  tenant: { id: 'ad021000-0000-4000-8000-000000000004', fe: 'adm2-tenant', client: A as string | null, role: 'END_USER', meta: {} },
} as const
type UserKey = keyof typeof USERS
const ATTACKER_EMAIL = 'attacker-owned@example.test'
type App = { request: (path: string, init?: RequestInit) => Promise<Response> }

describe.skipIf(!url)('ADM-2: Administrator cannot impersonate a super-admin row (real app + Postgres)', () => {
  let db: typeof import('./db.js')
  let app: App
  const tokens: Partial<Record<UserKey, string>> = {}
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)
  const ids = Object.values(USERS).map((u) => u.id)

  async function cleanup() {
    await q(`DELETE FROM event_log WHERE actor_user_id = ANY($1::uuid[]) OR subject_id = ANY($1::uuid[]) OR client_id = $2::uuid`, [ids, A])
    await q(`DELETE FROM auth_tokens WHERE user_id = ANY($1::uuid[])`, [ids]).catch(() => undefined)
    await q(`DELETE FROM entity_id_map WHERE frontend_id LIKE 'adm2-%'`)
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[]) OR email = $2`, [ids, ATTACKER_EMAIL])
    await q(`DELETE FROM clients WHERE id = $1::uuid`, [A])
  }

  async function login(key: UserKey, n: number): Promise<string> {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.78.0.${n}` },
      body: JSON.stringify({ email: `${USERS[key].fe}@example.test`, password: TEST_FIXTURE_PW }),
    })
    expect(res.status, `login ${key}`).toBe(200)
    return ((await res.json()) as { token: string }).token
  }

  const asHeaders = (who: UserKey, target: UserKey, role: string) => ({
    'content-type': 'application/json',
    Authorization: `Bearer ${tokens[who]}`,
    'X-User-Id': USERS[target].fe,
    'X-Role': role,
    'X-Agency-Id': '',
  })
  const ownerEmail = async () => (await q<{ email: string }>(`SELECT email FROM users WHERE id = $1::uuid`, [USERS.owner.id]))[0]?.email

  beforeAll(async () => {
    db = await import('./db.js')
    await cleanup()
    await q(`INSERT INTO clients (id, company_name, subdomain) VALUES ($1::uuid, 'ADM2 Agency A', 'adm2-a')`, [A])
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid)`, [AG_A, A])
    const { hashPassword } = await import('./auth.js')
    const hash = await hashPassword(TEST_FIXTURE_PW)
    for (const u of Object.values(USERS)) {
      await q(
        `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'ADM2', 'Test', $5, TRUE, $6::jsonb)`,
        [u.id, u.client, `${u.fe}@example.test`, hash, u.role, JSON.stringify({ mustChangePassword: false, ...u.meta })],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [u.fe, u.id])
    }
    app = (await import('./index.js')).default as unknown as App
    let n = 1
    for (const key of ['administrator', 'agencyAdmin'] as const) tokens[key] = await login(key, n++)
  })
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    if (db) await cleanup()
  })

  const upsertOwnerEmail = (who: UserKey) =>
    app.request('/api/persist', {
      method: 'POST',
      headers: asHeaders(who, 'owner', 'tenant'),
      body: JSON.stringify({ resource: 'user', action: 'upsert', id: USERS.owner.fe, data: { email: ATTACKER_EMAIL } }),
    })

  it("h. Administrator posing as the owner with X-Role tenant cannot change the owner's email, and no reset reaches the attacker", async () => {
    const before = await ownerEmail()
    const res = await upsertOwnerEmail('administrator')
    const after = await ownerEmail()
    const forgot = await app.request('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.78.0.50' },
      body: JSON.stringify({ email: ATTACKER_EMAIL }),
    })
    const tokensForOwner = await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM auth_tokens WHERE user_id = $1::uuid`, [USERS.owner.id]).catch(() => [{ n: 0 }])
    expect({ status: res.status, before, after, forgotOk: forgot.status < 500, ownerTokens: tokensForOwner[0].n }).toEqual({
      status: 403,
      before: `${USERS.owner.fe}@example.test`,
      after: `${USERS.owner.fe}@example.test`,
      forgotOk: true,
      ownerTokens: 0,
    })
  })

  it('i. control: an agency admin sending the same headers is refused (unchanged)', async () => {
    const res = await upsertOwnerEmail('agencyAdmin')
    expect({ status: res.status, email: await ownerEmail() }).toEqual({ status: 403, email: `${USERS.owner.fe}@example.test` })
  })

  it('j. legit: an Administrator can still view as a tenant, and the impersonation is logged', async () => {
    await q(`DELETE FROM event_log WHERE event_type = 'impersonation' AND subject_id = $1::uuid`, [USERS.tenant.id])
    const res = await app.request('/api/bootstrap', { headers: asHeaders('administrator', 'tenant', 'tenant') })
    const logged = await q<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM event_log WHERE event_type = 'impersonation' AND subject_id = $1::uuid AND actor_user_id = $2::uuid`,
      [USERS.tenant.id, USERS.administrator.id],
    )
    expect({ status: res.status, logged: logged[0].n }).toEqual({ status: 200, logged: 1 })
  })
})
