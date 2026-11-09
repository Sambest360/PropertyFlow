import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * P5: guest-house photo uploads go through the existing POST /api/photos and
 * are stored as /api/files/ URLs; photoList keeps uploads and http(s) links
 * and drops data: URLs. These pin TODAY's server behaviour (no server change
 * in P5), so they pass before and after. Real Hono app (PF_SKIP_SERVE=1),
 * real login, SCRATCH Postgres only. Harness copied from
 * server/guesthouseStaffRoles.http.pg.test.ts.
 */
const url = process.env.PF_TEST_PG_URL

const uploads = vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  process.env.AUTH_SECRET = ['p5', 'photos', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
  // A fresh uploads folder for this file only (removed in afterAll).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir } = require('node:os') as typeof import('node:os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'pf-p5-'))
  process.env.UPLOADS_DIR = dir
  return { dir }
})

const TEST_FIXTURE_PW = ['p5', 'fixture', 'pw'].join('-')
const A = 'f5050000-0000-4000-8000-00000000000a'
const AG_A = 'p5-ag-a'
const USERS = {
  owner: { id: 'f5051000-0000-4000-8000-000000000001', fe: 'p5-owner', client: null as string | null, role: 'SUPER_ADMIN' },
  adminA: { id: 'f5051000-0000-4000-8000-000000000002', fe: 'p5-admin-a', client: A as string | null, role: 'AGENT_ADMIN' },
  landlord: { id: 'f5051000-0000-4000-8000-000000000003', fe: 'p5-landlord', client: null as string | null, role: 'LANDLORD' },
} as const
type UserKey = keyof typeof USERS
type App = { request: (path: string, init?: RequestInit) => Promise<Response> }
/** A 1x1 PNG. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PEXELS = 'https://images.pexels.com/x.jpg'

describe.skipIf(!url)('P5: guest-house photo uploads and links (real app + Postgres)', () => {
  let db: typeof import('./db.js')
  let app: App
  const tokens: Partial<Record<UserKey, string>> = {}
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)
  let ip = 0
  let houseId = ''
  let roomId = ''
  let uploaded = ''

  async function cleanup() {
    await q(`DELETE FROM guesthouses WHERE client_id = $1::uuid OR owner_user_id = ANY($2::uuid[])`, [A, Object.values(USERS).map((u) => u.id)]).catch(() => undefined)
    await q(`DELETE FROM entity_id_map WHERE frontend_id LIKE 'p5-%'`)
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [Object.values(USERS).map((u) => u.id)])
    await q(`DELETE FROM clients WHERE id = $1::uuid`, [A])
  }
  async function call(method: string, path: string, who: UserKey | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.86.1.${++ip}` }
    if (who) headers.Authorization = `Bearer ${tokens[who]}`
    const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, type: res.headers.get('content-type'), json: (await res.clone().json().catch(() => null)) as any }
  }

  beforeAll(async () => {
    db = await import('./db.js')
    const { ensureGuesthouseTables } = await import('./guesthouses.js')
    await ensureGuesthouseTables()
    await cleanup()
    // Real agencies carry their front-end id in settings (the upload route finds the folder by it).
    await q(`INSERT INTO clients (id, company_name, subdomain, settings) VALUES ($1::uuid, 'P5 Agency A', 'p5-a', $2::jsonb)`, [A, JSON.stringify({ frontend_id: AG_A })])
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid)`, [AG_A, A])
    const { hashPassword } = await import('./auth.js')
    const hash = await hashPassword(TEST_FIXTURE_PW)
    for (const u of Object.values(USERS)) {
      await q(
        `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'P5', 'Test', $5, TRUE, '{"mustChangePassword": false}'::jsonb)`,
        [u.id, u.client, `${u.fe}@example.test`, hash, u.role],
      )
      await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [u.fe, u.id])
    }
    app = (await import('./index.js')).default as unknown as App
    let n = 0
    for (const k of Object.keys(USERS) as UserKey[]) {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.86.0.${++n}` },
        body: JSON.stringify({ email: `${USERS[k].fe}@example.test`, password: TEST_FIXTURE_PW }),
      })
      expect(res.status).toBe(200)
      tokens[k] = ((await res.json()) as { token: string }).token
    }
    const h = await call('POST', '/api/guesthouses', 'adminA', { name: 'P5 Photo House', city: 'Gqeberha' })
    houseId = h.json.id
    roomId = (await call('POST', `/api/guesthouses/${houseId}/rooms`, 'adminA', { name: 'Room', nightlyRate: 500 })).json.id
  })
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    if (db) await cleanup()
    const { rmSync } = await import('node:fs')
    rmSync(uploads.dir, { recursive: true, force: true })
  })

  it('an agency upload is stored under its agency folder and served back as an image', async () => {
    const up = await call('POST', '/api/photos', 'adminA', { dataUrl: PNG })
    uploaded = up.json?.url
    const got = await call('GET', uploaded, null)
    expect({ status: up.status, folder: String(uploaded).startsWith(`/api/files/agency/${A}/listings/`), get: got.status, type: got.type }).toEqual({
      status: 200, folder: true, get: 200, type: 'image/png',
    })
  })

  it('a landlord can upload too; no token is 401', async () => {
    const ll = await call('POST', '/api/photos', 'landlord', { dataUrl: PNG })
    const anon = await call('POST', '/api/photos', null, { dataUrl: PNG })
    expect({ ll: ll.status, folder: String(ll.json?.url).startsWith('/api/files/listings/'), anon: anon.status }).toEqual({ ll: 200, folder: true, anon: 401 })
  })

  it('house and room photos keep the upload and the link, in order, and drop a data: URL', async () => {
    const photos = [uploaded, PEXELS, 'data:image/png;base64,AAAA']
    await call('PUT', `/api/guesthouses/${houseId}`, 'adminA', { name: 'P5 Photo House', city: 'Gqeberha', photos })
    await call('PUT', `/api/guesthouses/${houseId}/rooms/${roomId}`, 'adminA', { name: 'Room', nightlyRate: 500, photos })
    const house = (await q<{ photos: string[] }>(`SELECT photos FROM guesthouses WHERE id = $1::uuid`, [houseId]))[0].photos
    const room = (await q<{ photos: string[] }>(`SELECT photos FROM guesthouse_rooms WHERE id = $1::uuid`, [roomId]))[0].photos
    expect({ house, room }).toEqual({ house: [uploaded, PEXELS], room: [uploaded, PEXELS] })
  })

  it('the public stay page returns those photos once the owner publishes', async () => {
    const pub = await call('PUT', `/api/guesthouses/${houseId}`, 'owner', { name: 'P5 Photo House', city: 'Gqeberha', photos: [uploaded, PEXELS], status: 'published' })
    const stay = await call('GET', `/api/stays/${houseId}`, null)
    expect({ pub: pub.status, status: stay.status, photos: stay.json?.photos }).toEqual({ pub: 200, status: 200, photos: [uploaded, PEXELS] })
  })
})
