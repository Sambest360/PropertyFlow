import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * R1: a listing with 7+ rooms saves every room. Room 7's old default layout
 * (y = 101) is clamped to 100 instead of failing the rooms_layout_y_check.
 * Real Hono app (PF_SKIP_SERVE=1), real login and /api/persist, SCRATCH
 * Postgres only. Harness shape copied from
 * server/listingApprovals.vacant.http.pg.test.ts.
 */
const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  process.env.AUTH_SECRET = ['r1', 'rooms', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})

const TEST_FIXTURE_PW = ['r1', 'fixture', 'pw'].join('-')
const A = 'f1010000-0000-4000-8000-00000000000a'
const AG_A = 'r1-ag-a'
const BLD = 'f1012000-0000-4000-8000-000000000001'
const BLD_FE = 'r1-bld-a'
const ADMIN = { id: 'f1011000-0000-4000-8000-000000000001', fe: 'r1-admin-a' }
const P_FE = 'r1-p-seven-rooms'
type App = { request: (path: string, init?: RequestInit) => Promise<Response> }

const oldDefault = (i: number) => ({ x: 5 + (i % 2) * 48, y: 5 + Math.floor(i / 2) * 32, w: 42, h: 28 })

describe.skipIf(!url)('R1: rooms layout stays inside the CHECK range (real app + Postgres)', () => {
  let db: typeof import('./db.js')
  let app: App
  let token = ''
  let unitUuid = ''
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)

  async function cleanup() {
    await q(`DELETE FROM rooms WHERE client_id = $1::uuid`, [A])
    const units = await q<{ id: string }>(`SELECT id::text AS id FROM units WHERE client_id = $1::uuid`, [A])
    const ids = units.map((u) => u.id)
    if (ids.length) {
      await q(`DELETE FROM listing_approvals WHERE unit_id = ANY($1::uuid[])`, [ids]).catch(() => undefined)
      await q(`DELETE FROM event_log WHERE subject_id = ANY($1::uuid[])`, [ids])
      await q(`DELETE FROM units WHERE id = ANY($1::uuid[])`, [ids])
    }
    await q(`DELETE FROM event_log WHERE client_id = $1::uuid`, [A])
    await q(`DELETE FROM notifications WHERE user_id = $1::uuid`, [ADMIN.id]).catch(() => undefined)
    await q(`DELETE FROM buildings WHERE client_id = $1::uuid`, [A])
    await q(`DELETE FROM entity_id_map WHERE frontend_id LIKE 'r1-%'`)
    await q(`DELETE FROM users WHERE id = $1::uuid`, [ADMIN.id])
    await q(`DELETE FROM clients WHERE id = $1::uuid`, [A])
  }
  const persist = (body: Record<string, unknown>) =>
    app.request('/api/persist', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  const room = (id: string, i: number, layout: Record<string, unknown>) =>
    persist({ resource: 'room', action: 'upsert', id, data: { propertyId: P_FE, agencyId: AG_A, name: `Bedroom ${i + 1}`, kind: 'bedroom', beds: 1, layout } })
  const stored = async (fe: string) =>
    (
      await q<{ x: string; y: string; w: string; h: string }>(
        `SELECT r.layout_x::text AS x, r.layout_y::text AS y, r.layout_w::text AS w, r.layout_h::text AS h
           FROM rooms r WHERE r.unit_id = $1::uuid AND r.name = $2`,
        [unitUuid, fe],
      )
    )[0]

  beforeAll(async () => {
    db = await import('./db.js')
    await cleanup()
    await q(`INSERT INTO clients (id, company_name, subdomain) VALUES ($1::uuid, 'R1 Agency A', 'r1-a')`, [A])
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid)`, [AG_A, A])
    const { hashPassword } = await import('./auth.js')
    await q(
      `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, 'R1', 'Test', 'AGENT_ADMIN', TRUE, '{"mustChangePassword": false}'::jsonb)`,
      [ADMIN.id, A, `${ADMIN.fe}@example.test`, await hashPassword(TEST_FIXTURE_PW)],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [ADMIN.fe, ADMIN.id])
    await q(`INSERT INTO buildings (id, client_id, name, address, city, province) VALUES ($1::uuid, $2::uuid, 'R1 Block', '1 Room St', 'Gqeberha', 'EC')`, [BLD, A])
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('building', $1, $2::uuid)`, [BLD_FE, BLD])
    app = (await import('./index.js')).default as unknown as App
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.83.0.1' },
      body: JSON.stringify({ email: `${ADMIN.fe}@example.test`, password: TEST_FIXTURE_PW }),
    })
    expect(login.status).toBe(200)
    token = ((await login.json()) as { token: string }).token
    const prop = await persist({
      resource: 'property', action: 'upsert', id: P_FE,
      data: { title: 'R1 Seven room house', type: 'Apartment', beds: 7, rent: 15000, listingMode: 'rent', status: 'Draft', statusKey: 'DRAFT', agencyId: AG_A, agentId: ADMIN.fe, buildingId: BLD_FE, titleTypeConfirmed: true },
    })
    expect(prop.status, await prop.clone().text()).toBe(200)
    unitUuid = ((await prop.json()) as { uuid: string }).uuid
  })
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    if (db) await cleanup()
  })

  it("h. all 7 rooms save with the old default layouts; room 7's y=101 is stored as 100", async () => {
    const statuses: number[] = []
    for (let i = 0; i < 7; i++) statuses.push((await room(`r1-room-${i + 1}`, i, oldDefault(i))).status)
    const ys: string[] = []
    for (let i = 0; i < 7; i++) ys.push((await stored(`Bedroom ${i + 1}`))?.y ?? 'missing')
    expect({ statuses, ys }).toEqual({
      statuses: [200, 200, 200, 200, 200, 200, 200],
      ys: ['5.00', '5.00', '37.00', '37.00', '69.00', '69.00', '100.00'],
    })
  })

  it('i. out-of-range values are clamped into 0..100 and rounded to 2 decimals', async () => {
    const res = await room('r1-room-x', 99, { x: -1, y: 150, w: 101, h: 28.004 })
    expect({ status: res.status, row: await stored('Bedroom 100') }).toEqual({ status: 200, row: { x: '0.00', y: '100.00', w: '100.00', h: '28.00' } })
  })
})
