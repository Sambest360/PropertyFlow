import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GH-2: GET /api/stays/bookings/mine returns only bookings made by the
 * caller's account, never bookings that merely share the caller's email. A
 * stranger who self-registers with a guest's address (unverified) must not
 * see that guest's bookings. Real Hono app (PF_SKIP_SERVE=1), real
 * register/login, SCRATCH Postgres only. Harness shape copied from
 * server/auditRowIntegrity.http.pg.test.ts.
 */
const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  process.env.AUTH_SECRET = ['gh2', 'mine', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})

const TEST_FIXTURE_PW = ['gh2', 'fixture', 'pw'].join('-')
const A = 'a6020000-0000-4000-8000-00000000000a'
const AG_A = 'gh2-ag-a'
const USERS = {
  adminA: { id: 'a6021000-0000-4000-8000-000000000001', fe: 'gh2-admin-a', client: A as string | null, role: 'AGENT_ADMIN' },
  tenant: { id: 'a6021000-0000-4000-8000-000000000002', fe: 'gh2-tenant', client: null as string | null, role: 'END_USER' },
  /** P4: only the owner publishes a guest house. */
  owner: { id: 'a6021000-0000-4000-8000-000000000003', fe: 'gh2-owner', client: null as string | null, role: 'SUPER_ADMIN' },
} as const
type UserKey = keyof typeof USERS
const VICTIM = 'victim-guest@example.test'
type App = { request: (path: string, init?: RequestInit) => Promise<Response> }

function isoIn(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

describe.skipIf(!url)('GH-2: my bookings only by account, never by matching email (real app + Postgres)', () => {
  let db: typeof import('./db.js')
  let app: App
  const tokens: Partial<Record<UserKey, string>> = {}
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)
  let roomId = ''
  let victimRef = ''

  async function cleanup() {
    await q(`DELETE FROM guesthouses WHERE client_id = $1::uuid`, [A]).catch(() => undefined)
    await q(`DELETE FROM notifications WHERE client_id = $1::uuid`, [A]).catch(() => undefined)
    await q(`DELETE FROM entity_id_map WHERE frontend_id LIKE 'gh2-%'`)
    const reg = await q<{ id: string; client_id: string | null }>(`SELECT id::text AS id, client_id::text AS client_id FROM users WHERE email = $1`, [VICTIM])
    for (const r of reg) {
      await q(`DELETE FROM auth_tokens WHERE user_id = $1::uuid`, [r.id]).catch(() => undefined)
      await q(`DELETE FROM notifications WHERE user_id = $1::uuid`, [r.id]).catch(() => undefined)
      await q(`DELETE FROM entity_id_map WHERE backend_id = $1::uuid`, [r.id])
      await q(`DELETE FROM users WHERE id = $1::uuid`, [r.id])
    }
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [Object.values(USERS).map((u) => u.id)])
    await q(`DELETE FROM clients WHERE id = $1::uuid`, [A])
  }

  async function login(key: UserKey, n: number): Promise<string> {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.80.0.${n}` },
      body: JSON.stringify({ email: `${USERS[key].fe}@example.test`, password: TEST_FIXTURE_PW }),
    })
    expect(res.status, `login ${key}`).toBe(200)
    return ((await res.json()) as { token: string }).token
  }
  async function call(method: string, path: string, token: string | null, body?: unknown, ip = '10.80.1.1') {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': ip }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, json: (await res.json().catch(() => null)) as any }
  }

  beforeAll(async () => {
    db = await import('./db.js')
    const { ensureGuesthouseTables } = await import('./guesthouses.js')
    await ensureGuesthouseTables()
    await cleanup()
    await q(`INSERT INTO clients (id, company_name, subdomain) VALUES ($1::uuid, 'GH2 Agency A', 'gh2-a')`, [A])
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid)`, [AG_A, A])
    const { hashPassword } = await import('./auth.js')
    const hash = await hashPassword(TEST_FIXTURE_PW)
    for (const u of Object.values(USERS)) {
      await q(
        `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'GH2', 'Test', $5, TRUE, '{"mustChangePassword": false}'::jsonb)`,
        [u.id, u.client, `${u.fe}@example.test`, hash, u.role],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [u.fe, u.id])
    }
    app = (await import('./index.js')).default as unknown as App
    tokens.adminA = await login('adminA', 1)
    tokens.tenant = await login('tenant', 2)
    tokens.owner = await login('owner', 3)
    const house = await call('POST', '/api/guesthouses', tokens.adminA!, { name: 'GH2 Seaview', city: 'Gqeberha' })
    expect(house.status, JSON.stringify(house.json)).toBe(200)
    const room = await call('POST', `/api/guesthouses/${house.json.id}/rooms`, tokens.adminA!, { name: 'Garden Room', nightlyRate: 700, maxGuests: 2 })
    expect(room.status).toBe(200)
    roomId = room.json.id
    const pub = await call('PUT', `/api/guesthouses/${house.json.id}`, tokens.owner!, { name: 'GH2 Seaview', city: 'Gqeberha', status: 'published' })
    expect(pub.status).toBe(200)
  })
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    if (db) await cleanup()
  })

  it("a. an unverified account registered with the guest's email sees none of the guest's bookings", async () => {
    const booked = await call('POST', '/api/stays/bookings', null, {
      roomId, checkIn: isoIn(20), checkOut: isoIn(22), guests: 2,
      guestName: 'Victim Guest', guestEmail: VICTIM, guestPhone: '+27 82 111 2222', message: 'door code please',
    }, '10.80.2.1')
    expect(booked.status, JSON.stringify(booked.json)).toBe(200)
    victimRef = booked.json.reference
    const reg = await call('POST', '/api/auth/register', null, {
      email: VICTIM, password: ['gh2', 'stranger', 'pw', '12'].join('-'), firstName: 'Stranger', lastName: 'Danger', phone: '+27 83 000 0000', role: 'tenant',
    }, '10.80.2.2')
    expect(reg.status, JSON.stringify(reg.json)).toBe(201)
    const mine = await call('GET', '/api/stays/bookings/mine', reg.json.token as string)
    expect({ status: mine.status, bookings: mine.json }).toEqual({ status: 200, bookings: [] })
  })

  it('b. legit: a booking made while signed in shows in my bookings', async () => {
    const booked = await call('POST', '/api/stays/bookings', tokens.tenant!, {
      roomId, checkIn: isoIn(30), checkOut: isoIn(31), guests: 1, guestName: 'GH2 Tenant', guestEmail: `${USERS.tenant.fe}@example.test`,
    }, '10.80.2.3')
    expect(booked.status).toBe(200)
    const mine = await call('GET', '/api/stays/bookings/mine', tokens.tenant!)
    expect({ status: mine.status, refs: (mine.json as Array<{ reference: string }>).map((b) => b.reference) }).toEqual({ status: 200, refs: [booked.json.reference] })
  })

  it('c. legit: reference + email lookup still returns the signed-out booking', async () => {
    const found = await call('POST', '/api/stays/bookings/lookup', null, { reference: victimRef, email: VICTIM }, '10.80.2.4')
    expect({ status: found.status, ref: found.json?.reference }).toEqual({ status: 200, ref: victimRef })
  })
})
