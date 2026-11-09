import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Guest houses: only an agency admin (or the owning landlord / super admin)
 * may mark a booking paid or delete a guest house; a ground agent keeps the
 * other booking actions. Real Hono app (PF_SKIP_SERVE=1), real login,
 * SCRATCH Postgres only. Harness shape copied from
 * server/auditRowIntegrity.http.pg.test.ts.
 */
const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  process.env.AUTH_SECRET = ['ghroles', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})

const TEST_FIXTURE_PW = ['ghroles', 'fixture', 'pw'].join('-')
const A = 'a7030000-0000-4000-8000-00000000000a'
const AG_A = 'ghr-ag-a'
const USERS = {
  adminA: { id: 'a7031000-0000-4000-8000-000000000001', fe: 'ghr-admin-a', role: 'AGENT_ADMIN' },
  groundA: { id: 'a7031000-0000-4000-8000-000000000002', fe: 'ghr-ground-a', role: 'GROUND_AGENT' },
} as const
type UserKey = keyof typeof USERS
type App = { request: (path: string, init?: RequestInit) => Promise<Response> }

function isoIn(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

describe.skipIf(!url)('guest houses: payment and delete are admin-only (real app + Postgres)', () => {
  let db: typeof import('./db.js')
  let app: App
  const tokens: Partial<Record<UserKey, string>> = {}
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)
  let roomId = ''
  let n = 0

  async function cleanup() {
    await q(`DELETE FROM guesthouses WHERE client_id = $1::uuid`, [A]).catch(() => undefined)
    await q(`DELETE FROM notifications WHERE client_id = $1::uuid`, [A]).catch(() => undefined)
    await q(`DELETE FROM entity_id_map WHERE frontend_id LIKE 'ghr-%'`)
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [Object.values(USERS).map((u) => u.id)])
    await q(`DELETE FROM clients WHERE id = $1::uuid`, [A])
  }
  async function call(method: string, path: string, who: UserKey | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.82.1.${++n}` }
    if (who) headers.Authorization = `Bearer ${tokens[who]}`
    const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, json: (await res.json().catch(() => null)) as any }
  }
  async function newHouse(name: string): Promise<{ houseId: string; roomId: string }> {
    const h = await call('POST', '/api/guesthouses', 'adminA', { name, city: 'Gqeberha' })
    expect(h.status).toBe(200)
    const r = await call('POST', `/api/guesthouses/${h.json.id}/rooms`, 'adminA', { name: 'Room', nightlyRate: 600 })
    expect((await call('PUT', `/api/guesthouses/${h.json.id}`, 'adminA', { name, city: 'Gqeberha', status: 'published' })).status).toBe(200)
    return { houseId: h.json.id, roomId: r.json.id }
  }
  async function book(days: number): Promise<string> {
    const b = await call('POST', '/api/stays/bookings', null, { roomId, checkIn: isoIn(days), checkOut: isoIn(days + 1), guests: 1, guestName: 'Guest Person', guestEmail: 'ghr-guest@example.test' })
    expect(b.status, JSON.stringify(b.json)).toBe(200)
    return b.json.id
  }

  beforeAll(async () => {
    db = await import('./db.js')
    const { ensureGuesthouseTables } = await import('./guesthouses.js')
    await ensureGuesthouseTables()
    await cleanup()
    await q(`INSERT INTO clients (id, company_name, subdomain) VALUES ($1::uuid, 'GHR Agency A', 'ghr-a')`, [A])
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid)`, [AG_A, A])
    const { hashPassword } = await import('./auth.js')
    const hash = await hashPassword(TEST_FIXTURE_PW)
    for (const u of Object.values(USERS)) {
      await q(
        `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'GHR', 'Test', $5, TRUE, '{"mustChangePassword": false}'::jsonb)`,
        [u.id, A, `${u.fe}@example.test`, hash, u.role],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [u.fe, u.id])
    }
    app = (await import('./index.js')).default as unknown as App
    let i = 1
    for (const k of ['adminA', 'groundA'] as const) {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.82.0.${i++}` },
        body: JSON.stringify({ email: `${USERS[k].fe}@example.test`, password: TEST_FIXTURE_PW }),
      })
      expect(res.status).toBe(200)
      tokens[k] = ((await res.json()) as { token: string }).token
    }
    roomId = (await newHouse('GHR Main')).roomId
  })
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    if (db) await cleanup()
  })

  it('a ground agent cannot delete a guest house or mark a booking paid', async () => {
    const spare = await newHouse('GHR Spare')
    const bookingId = await book(10)
    const del = await call('DELETE', `/api/guesthouses/${spare.houseId}`, 'groundA')
    const pay = await call('POST', `/api/guesthouses/bookings/${bookingId}`, 'groundA', { action: 'payment', paymentStatus: 'paid' })
    expect({ del: del.status, pay: pay.status }).toEqual({ del: 403, pay: 403 })
  })

  it('the agency admin can do both', async () => {
    const spare = await newHouse('GHR Spare 2')
    const bookingId = await book(14)
    const pay = await call('POST', `/api/guesthouses/bookings/${bookingId}`, 'adminA', { action: 'payment', paymentStatus: 'paid' })
    const del = await call('DELETE', `/api/guesthouses/${spare.houseId}`, 'adminA')
    expect({ pay: pay.status, paid: pay.json?.paymentStatus, del: del.status }).toEqual({ pay: 200, paid: 'paid', del: 200 })
  })

  it('a ground agent can still confirm a booking', async () => {
    const bookingId = await book(18)
    const ok = await call('POST', `/api/guesthouses/bookings/${bookingId}`, 'groundA', { action: 'confirm' })
    expect({ status: ok.status, booking: ok.json?.status }).toEqual({ status: 200, booking: 'confirmed' })
  })
})
