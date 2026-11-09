import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * MKT-2: an agency save with statusKey VACANT is gated by super-admin
 * approval exactly like PUBLISHED (Angela's probe: 'AH-A Vacant try' went
 * public at once). Real Hono app (PF_SKIP_SERVE=1), real login, real
 * /api/persist and /api/public/marketplace, SCRATCH Postgres only.
 * Harness shape copied from server/auditRowIntegrity.http.pg.test.ts.
 */
const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  process.env.AUTH_SECRET = ['mkt2', 'vacant', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})

const TEST_FIXTURE_PW = ['mkt2', 'fixture', 'pw'].join('-')
const A = 'f2020000-0000-4000-8000-00000000000a'
const AG_A = 'mkt2-ag-a'
const BLD = 'f2022000-0000-4000-8000-000000000001'
const BLD_FE = 'mkt2-bld-a'
const USERS = {
  adminA: { id: 'f2021000-0000-4000-8000-000000000001', fe: 'mkt2-admin-a', client: A as string | null, role: 'AGENT_ADMIN' },
  superAdmin: { id: 'f2021000-0000-4000-8000-000000000002', fe: 'mkt2-super', client: null as string | null, role: 'SUPER_ADMIN' },
} as const
type UserKey = keyof typeof USERS
const P_PUB = 'mkt2-p-published'
const P_VAC = 'mkt2-p-vacant'
const TITLE_PUB = 'MKT2 Published try apartment'
const TITLE_VAC = 'MKT2 Vacant try apartment'
type App = { request: (path: string, init?: RequestInit) => Promise<Response> }

describe.skipIf(!url)('MKT-2: VACANT needs approval like PUBLISHED (real app + Postgres)', () => {
  let db: typeof import('./db.js')
  let app: App
  const tokens: Partial<Record<UserKey, string>> = {}
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)

  async function cleanup() {
    const units = await q<{ id: string }>(`SELECT id::text AS id FROM units WHERE client_id = $1::uuid`, [A]).catch(() => [])
    const ids = units.map((u) => u.id)
    if (ids.length) {
      await q(`DELETE FROM listing_approvals WHERE unit_id = ANY($1::uuid[])`, [ids]).catch(() => undefined)
      await q(`DELETE FROM event_log WHERE subject_id = ANY($1::uuid[])`, [ids])
      await q(`DELETE FROM units WHERE id = ANY($1::uuid[])`, [ids])
    }
    await q(`DELETE FROM event_log WHERE client_id = $1::uuid`, [A])
    await q(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [Object.values(USERS).map((u) => u.id)]).catch(() => undefined)
    await q(`DELETE FROM units WHERE client_id = $1::uuid`, [A])
    await q(`DELETE FROM buildings WHERE client_id = $1::uuid`, [A])
    await q(`DELETE FROM entity_id_map WHERE frontend_id LIKE 'mkt2-%'`)
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [Object.values(USERS).map((u) => u.id)])
    await q(`DELETE FROM clients WHERE id = $1::uuid`, [A])
  }

  async function login(key: UserKey, n: number): Promise<string> {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.79.0.${n}` },
      body: JSON.stringify({ email: `${USERS[key].fe}@example.test`, password: TEST_FIXTURE_PW }),
    })
    expect(res.status, `login ${key}`).toBe(200)
    return ((await res.json()) as { token: string }).token
  }

  const uuids: Record<string, string> = {}
  const save = async (id: string, title: string, statusKey: string, status: string, who: UserKey = 'adminA') => {
    const res = await app.request('/api/persist', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokens[who]}` },
      body: JSON.stringify({
        resource: 'property',
        action: 'upsert',
        id,
        data: {
          title, type: 'Apartment', beds: 2, rent: 9000, listingMode: 'rent', status, statusKey,
          agencyId: AG_A, agentId: USERS.adminA.fe, buildingId: BLD_FE, titleTypeConfirmed: true,
        },
      }),
    })
    const json = (await res.clone().json().catch(() => ({}))) as { uuid?: string }
    if (json.uuid) uuids[id] = json.uuid
    return res
  }
  /** By the uuid /api/persist returned (the id-map cache may skip re-writing a map row this file cleaned up). */
  const stored = async (fe: string) =>
    (
      await q<{ id: string; status: string; approval: string | null }>(
        `SELECT u.id::text AS id, u.status_config_key AS status, a.status AS approval
           FROM units u LEFT JOIN listing_approvals a ON a.unit_id = u.id
          WHERE u.id = $1::uuid`,
        [uuids[fe] ?? '00000000-0000-4000-8000-000000000000'],
      )
    )[0]
  const marketText = async () => (await (await app.request('/api/public/marketplace?lite=0')).text())

  beforeAll(async () => {
    db = await import('./db.js')
    await cleanup()
    await q(`INSERT INTO clients (id, company_name, subdomain) VALUES ($1::uuid, 'MKT2 Agency A', 'mkt2-a')`, [A])
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid)`, [AG_A, A])
    const { hashPassword } = await import('./auth.js')
    const hash = await hashPassword(TEST_FIXTURE_PW)
    for (const u of Object.values(USERS)) {
      await q(
        `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'MKT2', 'Test', $5, TRUE, '{"mustChangePassword": false}'::jsonb)`,
        [u.id, u.client, `${u.fe}@example.test`, hash, u.role],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [u.fe, u.id])
    }
    await q(
      `INSERT INTO buildings (id, client_id, name, address, city, province) VALUES ($1::uuid, $2::uuid, 'MKT2 Block', '2 Vacant St', 'Gqeberha', 'EC')`,
      [BLD, A],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('building', $1, $2::uuid)`, [BLD_FE, BLD])
    app = (await import('./index.js')).default as unknown as App
    tokens.adminA = await login('adminA', 1)
    tokens.superAdmin = await login('superAdmin', 2)
  })
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    if (db) await cleanup()
  })

  it('h. both PUBLISHED and VACANT agency saves are stored as DRAFT with a pending approval', async () => {
    const r1 = await save(P_PUB, TITLE_PUB, 'PUBLISHED', 'Published')
    const r2 = await save(P_VAC, TITLE_VAC, 'VACANT', 'Published')
    const pub = await stored(P_PUB)
    const vac = await stored(P_VAC)
    expect({ s1: r1.status, s2: r2.status, pub: [pub?.status, pub?.approval], vac: [vac?.status, vac?.approval] }).toEqual({
      s1: 200, s2: 200, pub: ['DRAFT', 'pending'], vac: ['DRAFT', 'pending'],
    })
  })

  it('i. the public marketplace shows neither', async () => {
    const text = await marketText()
    expect({ pub: text.includes(TITLE_PUB), vac: text.includes(TITLE_VAC) }).toEqual({ pub: false, vac: false })
  })

  it('j. after a super admin approves the VACANT one, it appears publicly', async () => {
    const vac = await stored(P_VAC)
    const res = await app.request(`/api/admin/listing-approvals/${vac!.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokens.superAdmin}` },
      body: JSON.stringify({ decision: 'approve' }),
    })
    const after = await stored(P_VAC)
    const text = await marketText()
    expect({ status: res.status, approval: after?.approval, listed: text.includes(TITLE_VAC) }).toEqual({ status: 200, approval: 'approved', listed: true })
  })

  describe('C2: status keys with spaces go through the gate like the trimmed key', () => {
    it("b. agency ' VACANT' and 'VACANT ' are stored DRAFT with a pending approval", async () => {
      const r1 = await save('mkt2-c2-lead', 'MKT2 C2 leading space flat', ' VACANT', 'Published')
      const r2 = await save('mkt2-c2-trail', 'MKT2 C2 trailing space flat', 'VACANT ', 'Published')
      const a = await stored('mkt2-c2-lead')
      const b = await stored('mkt2-c2-trail')
      expect({ s: [r1.status, r2.status], a: [a?.status, a?.approval], b: [b?.status, b?.approval] }).toEqual({
        s: [200, 200], a: ['DRAFT', 'pending'], b: ['DRAFT', 'pending'],
      })
    })

    it("c. the owner's ' vacant ' is stored VACANT, approved and public", async () => {
      const res = await save('mkt2-c2-owner', 'MKT2 C2 owner vacant flat', ' vacant ', 'Published', 'superAdmin')
      const row = await stored('mkt2-c2-owner')
      const text = await marketText()
      expect({ status: res.status, key: row?.status, approval: row?.approval, listed: text.includes('MKT2 C2 owner vacant flat') }).toEqual({
        status: 200, key: 'VACANT', approval: 'approved', listed: true,
      })
    })

    it('d. legit, unchanged: PUBLISHED -> DRAFT + pending; OCCUPIED stored with no approval row', async () => {
      await save('mkt2-c2-pub', 'MKT2 C2 published flat', 'PUBLISHED', 'Published')
      await save('mkt2-c2-occ', 'MKT2 C2 occupied flat', 'OCCUPIED', 'Rented')
      const pub = await stored('mkt2-c2-pub')
      const occ = await stored('mkt2-c2-occ')
      expect({ pub: [pub?.status, pub?.approval], occ: [occ?.status, occ?.approval] }).toEqual({ pub: ['DRAFT', 'pending'], occ: ['OCCUPIED', null] })
    })
  })
})
