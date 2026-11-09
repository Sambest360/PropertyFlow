import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GH-1: the public, signed-out guest-house list (GET /api/stays) must not
 * carry the host's phone or email; the detail already blanks both and staff
 * views keep them. Real Hono app (PF_SKIP_SERVE=1), real login, SCRATCH
 * Postgres only. Harness shape copied from server/auditRowIntegrity.http.pg.test.ts.
 */
const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  process.env.AUTH_SECRET = ['gh1', 'contact', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})

const TEST_FIXTURE_PW = ['gh1', 'fixture', 'pw'].join('-')
const B = 'b6010000-0000-4000-8000-00000000000b'
const AG_B = 'gh1-ag-b'
const ADMIN_B = { id: 'b6011000-0000-4000-8000-000000000001', fe: 'gh1-admin-b' }
const PHONE = '+27 82 000 0001'
const EMAIL = 'host-b-private@example.test'
type App = { request: (path: string, init?: RequestInit) => Promise<Response> }

describe.skipIf(!url)('GH-1: public /stays list hides host phone and email (real app + Postgres)', () => {
  let db: typeof import('./db.js')
  let app: App
  let token = ''
  let pubId = ''
  let draftId = ''
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)

  async function cleanup() {
    await q(`DELETE FROM guesthouses WHERE client_id = $1::uuid`, [B]).catch(() => undefined)
    await q(`DELETE FROM entity_id_map WHERE frontend_id LIKE 'gh1-%'`)
    await q(`DELETE FROM users WHERE id = $1::uuid`, [ADMIN_B.id])
    await q(`DELETE FROM clients WHERE id = $1::uuid`, [B])
  }
  async function call(method: string, path: string, auth: string | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (auth) headers.Authorization = `Bearer ${auth}`
    const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await res.text()
    let json: any = null
    try { json = JSON.parse(text) } catch { /* not json */ }
    return { status: res.status, json, text }
  }
  const house = { name: 'GH1 Hidden Host', city: 'Gqeberha', address: '12 Secret Rd', contactPhone: PHONE, contactEmail: EMAIL }

  beforeAll(async () => {
    db = await import('./db.js')
    const { ensureGuesthouseTables } = await import('./guesthouses.js')
    await ensureGuesthouseTables()
    await cleanup()
    await q(`INSERT INTO clients (id, company_name, subdomain) VALUES ($1::uuid, 'GH1 Agency B', 'gh1-b')`, [B])
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid)`, [AG_B, B])
    const { hashPassword } = await import('./auth.js')
    await q(
      `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, 'GH1', 'Test', 'AGENT_ADMIN', TRUE, '{"mustChangePassword": false}'::jsonb)`,
      [ADMIN_B.id, B, `${ADMIN_B.fe}@example.test`, await hashPassword(TEST_FIXTURE_PW)],
    )
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid)`, [ADMIN_B.fe, ADMIN_B.id])
    app = (await import('./index.js')).default as unknown as App
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.81.0.1' },
      body: JSON.stringify({ email: `${ADMIN_B.fe}@example.test`, password: TEST_FIXTURE_PW }),
    })
    expect(login.status).toBe(200)
    token = ((await login.json()) as { token: string }).token
    const created = await call('POST', '/api/guesthouses', token, house)
    expect(created.status, created.text).toBe(200)
    pubId = created.json.id
    expect((await call('POST', `/api/guesthouses/${pubId}/rooms`, token, { name: 'Room 1', nightlyRate: 650 })).status).toBe(200)
    expect((await call('PUT', `/api/guesthouses/${pubId}`, token, { ...house, status: 'published' })).status).toBe(200)
    const draft = await call('POST', '/api/guesthouses', token, { ...house, name: 'GH1 Draft House' })
    expect(draft.status).toBe(200)
    draftId = draft.json.id
  })
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    if (db) await cleanup()
  })

  it('a. signed out, the published item in GET /api/stays has no contact phone or email', async () => {
    const list = await call('GET', '/api/stays', null)
    const item = (list.json.items as Array<Record<string, unknown>>).find((i) => i.id === pubId)
    expect({ status: list.status, found: Boolean(item), phone: item?.contactPhone, email: item?.contactEmail }).toEqual({
      status: 200, found: true, phone: null, email: null,
    })
  })

  it("b. the host's phone and email appear nowhere in the list response", async () => {
    const list = await call('GET', '/api/stays', null)
    expect({ phone: list.text.includes(PHONE), email: list.text.includes(EMAIL) }).toEqual({ phone: false, email: false })
  })

  it('c. legit: detail still 200 with contact null; the draft is not listed and its detail is 404', async () => {
    const detail = await call('GET', `/api/stays/${pubId}`, null)
    const list = await call('GET', '/api/stays', null)
    const draft = await call('GET', `/api/stays/${draftId}`, null)
    expect({
      detail: detail.status, phone: detail.json?.contactPhone, email: detail.json?.contactEmail,
      draftListed: (list.json.items as Array<{ id: string }>).some((i) => i.id === draftId), draftDetail: draft.status,
    }).toEqual({ detail: 200, phone: null, email: null, draftListed: false, draftDetail: 404 })
  })

  it("d. legit: the agency admin's manager view keeps the real contact details", async () => {
    const own = await call('GET', `/api/guesthouses/${pubId}`, token)
    expect({ status: own.status, phone: own.json?.contactPhone, email: own.json?.contactEmail }).toEqual({ status: 200, phone: PHONE, email: EMAIL })
  })
})
