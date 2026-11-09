import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * B1 p10: /api/persist/batch refuses more than 200 ops before any runs.
 * Real Hono app (PF_SKIP_SERVE=1), real login, SCRATCH Postgres only.
 * Harness copied from server/listingApprovals.vacant.http.pg.test.ts.
 */
const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  process.env.AUTH_SECRET = ['b1', 'cap', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})

const TEST_FIXTURE_PW = ['b1cap', 'fixture', 'pw'].join('-')
const A = 'fb020000-0000-4000-8000-00000000000a'
const AG_A = 'b1cap-ag-a'
const ADMIN = { id: 'fb021000-0000-4000-8000-000000000001', fe: 'b1cap-admin-a' }
type App = { request: (path: string, init?: RequestInit) => Promise<Response> }

describe.skipIf(!url)('B1 p10: /api/persist/batch is capped at 200 ops (real app + Postgres)', () => {
  let db: typeof import('./db.js')
  let app: App
  let token = ''
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)

  async function cleanup() {
    const ev = await q<{ backend_id: string }>(`SELECT backend_id::text AS backend_id FROM entity_id_map WHERE frontend_id LIKE 'b1cap-act-%'`).catch(() => [])
    if (ev.length) await q(`DELETE FROM event_log WHERE id = ANY($1::uuid[])`, [ev.map((e) => e.backend_id)])
    await q(`DELETE FROM event_log WHERE client_id = $1::uuid OR actor_user_id = $2::uuid`, [A, ADMIN.id])
    await q(`DELETE FROM entity_id_map WHERE frontend_id LIKE 'b1cap-%'`)
    await q(`DELETE FROM users WHERE id = $1::uuid`, [ADMIN.id])
    await q(`DELETE FROM clients WHERE id = $1::uuid`, [A])
  }
  const ops = (n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => ({
      resource: 'activity', action: 'upsert', id: `b1cap-act-${tag}-${i}`, data: { agencyId: AG_A, text: `cap ${tag} ${i}`, user: 'Admin A', at: '2026-11-09T10:00:00.000Z' },
    }))
  const stored = async (tag: string) => (await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM entity_id_map WHERE frontend_id LIKE $1`, [`b1cap-act-${tag}-%`]))[0].n
  const batch = (body: unknown) =>
    app.request('/api/persist/batch', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })

  beforeAll(async () => {
    db = await import('./db.js')
    await cleanup()
    await q(`INSERT INTO clients (id, company_name, subdomain) VALUES ($1::uuid, 'B1 Cap Agency', 'b1cap-a')`, [A])
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid)`, [AG_A, A])
    const { hashPassword } = await import('./auth.js')
    await q(
      `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, 'Cap', 'Test', 'AGENT_ADMIN', TRUE, '{"mustChangePassword": false}'::jsonb)`,
      [ADMIN.id, A, `${ADMIN.fe}@example.test`, await hashPassword(TEST_FIXTURE_PW)],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [ADMIN.fe, ADMIN.id])
    app = (await import('./index.js')).default as unknown as App
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.88.0.1' },
      body: JSON.stringify({ email: `${ADMIN.fe}@example.test`, password: TEST_FIXTURE_PW }),
    })
    expect(res.status).toBe(200)
    token = ((await res.json()) as { token: string }).token
  })
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    if (db) await cleanup()
  })

  it('201 ops: 400 persist_batch_too_large and none is written; 200 ops: 200', async () => {
    const big = await batch({ ops: ops(201, 'big') })
    const bigJson = (await big.json()) as { error?: string }
    const bigStored = await stored('big')
    const ok = await batch({ ops: ops(200, 'ok') })
    expect({ big: big.status, error: bigJson.error, bigStored, ok: ok.status, okStored: await stored('ok') }).toEqual({
      big: 400, error: 'persist_batch_too_large', bigStored: 0, ok: 200, okStored: 200,
    })
  })
})
