/**
 * Actor identity hardening (fix/actor-session-auth).
 *
 * Drives the real Hono app (server/index.ts): real /api/auth/login session
 * issuance, real resolveSessionUser HMAC check, real resolveRequestActor,
 * real /api/bootstrap + buildBootstrap + filterBootstrapForActor, and real
 * /api/persist + requireActorAndGate + assertPersistAllowed. Only the `pg`
 * driver is faked: a Pool whose query() answers by SQL shape from a small
 * in-memory table set and records every write statement.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/** Test-only password fixtures, built at runtime (not credentials). */
const TEST_FIXTURE_PW = ['test', 'fixture', 'pw'].join('-')
const TEST_FIXTURE_NEW_PW = ['test', 'fixture', 'new', 'pw'].join('-')
const TEST_FIXTURE_WRONG_PW = ['test', 'fixture', 'wrong', 'pw'].join('-')
const TEST_FIXTURE_SHORT_PW = ['t', 'f'].join('-')
const TEST_FIXTURE_HASH = ['$2a', '10', 'test-fixture-hash'].join('$')


const env = vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  process.env.DATABASE_URL = 'postgres://pf:pf@127.0.0.1:5432/pf_test'
  process.env.AUTH_SECRET = 'test-secret-actor-session-auth'
  delete process.env.VERCEL
  delete process.env.ALLOW_DEMO_ACTOR
  return {}
})
void env

const HORIZON = 'a1000001-0001-4000-8000-000000000001'
const CAPE = 'a1000001-0001-4000-8000-000000000002'

type UserRow = {
  id: string
  fe: string
  email: string
  first: string
  last: string
  phone: string | null
  role: string
  client: string | null
  password_hash: string
  metadata: Record<string, unknown>
}

type PayoutRow = {
  id: string
  client_id: string
  status: string
  proposed_by: string | null
  approved_by: string | null
  payee_id: string | null
  submitted_at: string | null
}

const db = vi.hoisted(() => ({
  users: [] as UserRow[],
  payouts: [] as PayoutRow[],
  /** Params of each recorded write, same index as `writes`. */
  writeParams: [] as unknown[][],
  writes: [] as string[],
  sql: [] as string[],
  /** When set, every read throws this message (simulates a database failure). */
  failReads: '' as string,
}))

function agencyFeFor(client: string | null): string | null {
  if (client === HORIZON) return 'ag-horizon'
  if (client === CAPE) return 'ag-cape'
  return null
}

vi.mock('pg', () => {
  const answer = (sqlRaw: string, params: unknown[] = []): Record<string, unknown>[] => {
    const sql = sqlRaw.replace(/\s+/g, ' ').trim()
    db.sql.push(sql)
    if (sql.startsWith('UPDATE payout_instructions')) {
      db.writes.push(sql)
      db.writeParams.push(params)
      const row = db.payouts.find((p) => p.id === params[0])
      if (!row) return []
      const now = '2026-10-09T10:00:00.000Z'
      if (sql.includes("SET status = 'approved'")) {
        if (!['proposed', 'pending_approval'].includes(row.status)) return []
        if (!row.proposed_by || row.proposed_by === params[1]) return []
        row.status = 'approved'
        row.approved_by = String(params[1])
        return [{ updated_at: now }]
      }
      if (sql.includes("SET status = 'submitted'")) {
        if (row.status !== 'approved' || !row.approved_by) return []
        row.status = 'submitted'
        row.submitted_at = now
        return [{ submitted_at: now, updated_at: now }]
      }
      return []
    }
    if (/^(INSERT|UPDATE|DELETE)\b/i.test(sql)) {
      if (!/entity_id_map/i.test(sql)) {
        db.writes.push(sql)
        db.writeParams.push(params)
      }
      return []
    }
    if (/^(CREATE|ALTER|BEGIN|COMMIT|ROLLBACK)\b/i.test(sql)) return []
    if (db.failReads && /^SELECT\b/i.test(sql)) throw new Error(db.failReads)
    // auth.ts findUserById / findUserByEmail
    if (sql.includes('FROM users u LEFT JOIN clients c ON c.id = u.client_id')) {
      const hit = sql.includes('WHERE u.id = $1::uuid')
        ? db.users.find((u) => u.id === params[0])
        : db.users.find((u) => u.email.toLowerCase() === String(params[0]).toLowerCase())
      if (!hit) return []
      return [
        {
          id: hit.id,
          email: hit.email,
          password_hash: hit.password_hash,
          first_name: hit.first,
          last_name: hit.last,
          phone: hit.phone,
          role: hit.role,
          active: true,
          client_id: hit.client,
          metadata: hit.metadata,
          agency_fe: agencyFeFor(hit.client),
        },
      ]
    }
    // bootstrap users
    if (sql.startsWith('SELECT id, client_id, email, first_name, last_name, phone, role, active, metadata FROM users')) {
      return db.users.map((u) => ({
        id: u.id,
        client_id: u.client,
        email: u.email,
        first_name: u.first,
        last_name: u.last,
        phone: u.phone,
        role: u.role,
        active: true,
        metadata: u.metadata,
      }))
    }
    if (sql.startsWith('SELECT id, company_name, subdomain, status, city, created_at FROM clients')) {
      return [
        { id: HORIZON, company_name: 'Horizon', subdomain: 'horizon', status: 'active', city: 'PE', created_at: new Date('2026-01-01') },
        { id: CAPE, company_name: 'Cape', subdomain: 'cape', status: 'active', city: 'CT', created_at: new Date('2026-01-01') },
      ]
    }
    if (sql === 'SELECT id::text AS id, email FROM users') {
      return db.users.map((u) => ({ id: u.id, email: u.email }))
    }
    if (sql === 'SELECT entity_type, frontend_id, backend_id::text FROM entity_id_map') {
      return db.users.map((u) => ({ entity_type: 'user', frontend_id: u.fe, backend_id: u.id }))
    }
    if (sql.startsWith('SELECT backend_id::text FROM entity_id_map')) {
      const types = params[0] as string[]
      const fes = params[1] as string[]
      if (!types.includes('user')) return []
      const u = db.users.find((x) => fes.includes(x.fe))
      return u ? [{ backend_id: u.id }] : []
    }
    if (/SELECT metadata FROM users WHERE id = \$1::uuid/.test(sql)) {
      const u = db.users.find((x) => x.id === params[0])
      return u ? [{ metadata: u.metadata }] : []
    }
    if (sql.startsWith('SELECT id::text AS id, client_id::text AS client_id, status, proposed_by::text')) {
      const p = db.payouts.find((x) => x.id === params[0])
      return p ? [{ ...p }] : []
    }
    if (sql.startsWith('SELECT "id", "unit_id", "client_id", "agent_id", "applicant_id" FROM "applications"')) {
      if (params[0] !== 'd8000001-0001-4000-8000-000000000001') return []
      const tenant = db.users.find((u) => u.fe === 'u-tenant')!
      return [{ id: params[0], unit_id: null, client_id: HORIZON, agent_id: null, applicant_id: tenant.id }]
    }
    if (sql.startsWith('SELECT "id", "client_id" FROM "payout_instructions"')) {
      const p = db.payouts.find((x) => x.id === params[0])
      return p ? [{ id: p.id, client_id: p.client_id }] : []
    }
    if (/SELECT client_id FROM users WHERE id = \$1::uuid/.test(sql)) {
      const u = db.users.find((x) => x.id === params[0])
      return u ? [{ client_id: u.client }] : []
    }
    if (/SELECT status FROM clients WHERE id = \$1::uuid/.test(sql)) return [{ status: 'active' }]
    if (/SELECT COUNT\(\*\)/i.test(sql)) return [{ n: String(db.users.length) }]
    if (sql === 'SELECT 1 AS ok') return [{ ok: 1 }]
    // Every other read (units, leases, trust books, …) is an empty table here.
    return []
  }
  class Pool {
    async query(sql: string, params?: unknown[]) {
      return { rows: answer(sql, params) }
    }
    async connect() {
      return {
        query: async (sql: string, params?: unknown[]) => ({ rows: answer(sql, params) }),
        release: () => undefined,
      }
    }
    async end() {}
    on() {
      return this
    }
  }
  return { default: { Pool, types: { setTypeParser: () => undefined } }, Pool }
})

type App = { request: (path: string, init?: RequestInit) => Response | Promise<Response> }
let app: App
const tokens: Record<string, string> = {}

function user(
  fe: string,
  uuidTail: string,
  role: string,
  client: string | null,
  extra: Partial<UserRow> = {},
): UserRow {
  return {
    id: `b9000001-0001-4000-8000-0000000000${uuidTail}`,
    fe,
    email: `${fe}@example.test`,
    first: fe.replace(/^u-/, '').toUpperCase(),
    last: 'Person',
    phone: `08200000${uuidTail}`,
    role,
    client,
    password_hash: '',
    metadata: {
      frontend_id: fe,
      idNumberOrPassport: `ID-${fe}`,
      verification: {
        status: 'approved',
        profile: { idNumberOrPassport: `ID-${fe}`, company: 'Co' },
        documents: [
          {
            key: 'id',
            label: 'ID',
            name: `${fe}-id.pdf`,
            mimeType: 'application/pdf',
            dataUrl: `data:application/pdf;base64,DOC-${fe}`,
            uploadedAt: '2026-01-01',
          },
        ],
      },
    },
    ...extra,
  }
}

async function login(email: string): Promise<string> {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${Object.keys(tokens).length + 1}` },
    body: JSON.stringify({ email, password: TEST_FIXTURE_PW }),
  })
  expect(res.status).toBe(200)
  const body = (await res.json()) as { token: string }
  return body.token
}

const SA_HEADERS = { 'X-User-Id': 'u-sa', 'X-Role': 'super_admin' }

beforeAll(async () => {
  const { hashPassword } = await import('./auth')
  const hash = await hashPassword(TEST_FIXTURE_PW)
  db.users = [
    user('u-sa', '01', 'SUPER_ADMIN', null),
    user('u-tenant', '02', 'END_USER', HORIZON),
    user('u-tenant2', '03', 'END_USER', HORIZON),
    user('u-james', '04', 'GROUND_AGENT', HORIZON),
    user('u-admin', '05', 'AGENCY_ADMIN', HORIZON),
    user('u-ll', '06', 'LANDLORD', HORIZON),
    user('u-cape-agent', '07', 'GROUND_AGENT', CAPE),
  ].map((u) => ({ ...u, password_hash: hash }))
  const mod = await import('./index')
  app = mod.default as unknown as App
  for (const fe of ['u-sa', 'u-tenant', 'u-james', 'u-admin']) {
    tokens[fe] = await login(`${fe}@example.test`)
  }
})

beforeEach(() => {
  db.writes = []
  db.writeParams = []
  db.sql = []
  db.failReads = ''
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function production() {
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('ALLOW_DEMO_ACTOR', '')
}

type Boot = {
  scoped?: boolean
  actor?: { userId: string; role: string; agencyId: string | null } | null
  users: Array<Record<string, unknown>>
}

async function bootstrap(headers: Record<string, string>): Promise<Response> {
  return app.request('/api/bootstrap?lite=1', { headers })
}

describe('actor identity: session first, demo headers only outside production', () => {
  it('no session gives 401 on bootstrap (production)', async () => {
    production()
    const res = await bootstrap({})
    expect(res.status).toBe(401)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.users).toBeUndefined()
    // 401 is decided before any table is read.
    expect(db.sql.some((s) => s.includes('FROM users ORDER BY email'))).toBe(false)
  })

  it('no session gives 401 on bootstrap (not production, no demo headers)', async () => {
    const res = await bootstrap({})
    expect(res.status).toBe(401)
  })

  it('super_admin X-Role headers with no session give 401 in production mode', async () => {
    production()
    const res = await bootstrap(SA_HEADERS)
    expect(res.status).toBe(401)
    const persist = await app.request('/api/persist', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...SA_HEADERS },
      body: JSON.stringify({ resource: 'agency', action: 'upsert', id: 'ag-evil', data: { id: 'ag-evil', name: 'Evil' } }),
    })
    expect(persist.status).toBe(401)
    expect(db.writes).toEqual([])
  })

  it('body actor fields with no session give 401 in production mode', async () => {
    production()
    const persist = await app.request('/api/persist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        resource: 'agency',
        action: 'upsert',
        id: 'ag-evil',
        actorUserId: 'u-sa',
        actorRole: 'super_admin',
        data: { id: 'ag-evil', name: 'Evil' },
      }),
    })
    expect(persist.status).toBe(401)
    expect(db.writes).toEqual([])
  })

  it('a tenant session plus an X-Role super_admin header gets tenant scope', async () => {
    production()
    const res = await bootstrap({ Authorization: `Bearer ${tokens['u-tenant']}`, ...SA_HEADERS })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Boot
    expect(body.actor).toEqual({ userId: 'u-tenant', role: 'tenant', agencyId: 'ag-horizon' })
    expect(body.scoped).toBe(true)
  })

  it('the same trick via the pf_session cookie also gets tenant scope', async () => {
    production()
    const res = await bootstrap({ Cookie: `pf_session=${tokens['u-tenant']}`, ...SA_HEADERS })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Boot
    expect(body.actor?.userId).toBe('u-tenant')
    expect(body.actor?.role).toBe('tenant')
  })

  it('the same trick on /api/persist gives 403 and writes nothing', async () => {
    production()
    const res = await app.request('/api/persist', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${tokens['u-tenant']}`,
        ...SA_HEADERS,
        'X-Agency-Id': 'null',
      },
      body: JSON.stringify({ resource: 'agency', action: 'upsert', id: 'ag-evil', data: { id: 'ag-evil', name: 'Evil' } }),
    })
    expect([401, 403]).toContain(res.status)
    expect(res.status).toBe(403)
    expect(db.writes).toEqual([])
  })

  it('the same trick on /api/persist/batch gives 403 and writes nothing', async () => {
    production()
    const res = await app.request('/api/persist/batch', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${tokens['u-tenant']}`,
        ...SA_HEADERS,
      },
      body: JSON.stringify({
        ops: [{ resource: 'agency', action: 'upsert', id: 'ag-evil', data: { id: 'ag-evil', name: 'Evil' } }],
      }),
    })
    expect(res.status).toBe(403)
    expect(db.writes).toEqual([])
  })

  it('a forged / tampered token is not a session (production)', async () => {
    production()
    const [h, , s] = tokens['u-tenant'].split('.')
    const forgedBody = Buffer.from(
      JSON.stringify({ sub: db.users[0].id, fe: 'u-sa', role: 'super_admin', agency: null, exp: 9_999_999_999 }),
    ).toString('base64url')
    const res = await bootstrap({ Authorization: `Bearer ${h}.${forgedBody}.${s}`, ...SA_HEADERS })
    expect(res.status).toBe(401)
  })

  it('super admin impersonation through headers still works (production)', async () => {
    production()
    const res = await bootstrap({
      Authorization: `Bearer ${tokens['u-sa']}`,
      'X-User-Id': 'u-tenant',
      'X-Role': 'tenant',
      'X-Agency-Id': 'ag-horizon',
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Boot
    expect(body.actor).toEqual({ userId: 'u-tenant', role: 'tenant', agencyId: 'ag-horizon' })
    expect(body.scoped).toBe(true)
  })

  it('super admin session without headers keeps every user with full fields', async () => {
    production()
    const res = await bootstrap({ Authorization: `Bearer ${tokens['u-sa']}` })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Boot
    expect(body.actor?.role).toBe('super_admin')
    expect(body.users.map((u) => u.id).sort()).toEqual(db.users.map((u) => u.fe).sort())
    const t2 = body.users.find((u) => u.id === 'u-tenant2')!
    expect(t2.email).toBe('u-tenant2@example.test')
    expect(JSON.stringify(t2)).toContain('DOC-u-tenant2')
  })

  it('not-production mode still accepts demo headers (local dev + tests)', async () => {
    const res = await bootstrap({ 'X-User-Id': 'u-tenant', 'X-Role': 'tenant', 'X-Agency-Id': 'ag-horizon' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Boot
    expect(body.actor).toEqual({ userId: 'u-tenant', role: 'tenant', agencyId: 'ag-horizon' })
  })

  it('ALLOW_DEMO_ACTOR=1 opts a Vercel deployment back into demo headers', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '1')
    const res = await bootstrap({ 'X-User-Id': 'u-tenant', 'X-Role': 'tenant' })
    expect(res.status).toBe(200)
  })

  it('VERCEL_ENV alone (no VERCEL) refuses demo headers', async () => {
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
    vi.stubEnv('VERCEL_ENV', 'preview')
    const res = await bootstrap(SA_HEADERS)
    expect(res.status).toBe(401)
  })

  it('NODE_ENV=production alone refuses demo headers on bootstrap and persist', async () => {
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
    vi.stubEnv('NODE_ENV', 'production')
    const res = await bootstrap(SA_HEADERS)
    expect(res.status).toBe(401)
    const persist = await app.request('/api/persist', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...SA_HEADERS },
      body: JSON.stringify({ resource: 'user', action: 'upsert', id: 'u-tenant2', data: { name: 'Hacked', role: 'super_admin' } }),
    })
    expect([401, 403]).toContain(persist.status)
    expect(db.writes).toEqual([])
  })

  it('ALLOW_DEMO_ACTOR=1 still overrides NODE_ENV=production and VERCEL_ENV', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '1')
    const res = await bootstrap({ 'X-User-Id': 'u-tenant', 'X-Role': 'tenant' })
    expect(res.status).toBe(200)
  })

  it('notifications/mark-read and dunning-notice ignore forged headers in production', async () => {
    production()
    const mark = await app.request('/api/notifications/mark-read', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...SA_HEADERS },
      body: JSON.stringify({ all: true, userId: 'u-tenant2' }),
    })
    expect(mark.status).toBe(401)
    const dun = await app.request('/api/notify/dunning-notice', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...SA_HEADERS },
      body: JSON.stringify({ email: 'victim@example.test' }),
    })
    expect(dun.status).toBe(401)
    expect(db.writes).toEqual([])
  })
})

describe('bootstrap users: narrowed and redacted for non-super-admins', () => {
  function assertNoPrivate(u: Record<string, unknown>) {
    expect(u.email).toBeUndefined()
    expect(u.phone).toBeUndefined()
    expect(u.idNumberOrPassport).toBeUndefined()
    const v = u.verification as Record<string, unknown> | undefined
    if (v) {
      expect(v.documents).toBeUndefined()
      expect(v.profile).toBeUndefined()
    }
  }

  it('a tenant bootstrap has no other user id, email, phone, ID number or docs beyond agency staff names', async () => {
    production()
    const res = await bootstrap({ Authorization: `Bearer ${tokens['u-tenant']}` })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Boot
    const ids = body.users.map((u) => u.id).sort()
    // Self + own agency's staff only. No other tenant, landlord, or other agency.
    expect(ids).toEqual(['u-admin', 'u-james', 'u-tenant'])
    const self = body.users.find((u) => u.id === 'u-tenant')!
    expect(self.email).toBe('u-tenant@example.test')
    for (const u of body.users.filter((x) => x.id !== 'u-tenant')) {
      assertNoPrivate(u)
      expect(Object.keys(u).sort()).toEqual(
        expect.arrayContaining(['id', 'name', 'role', 'agencyId', 'active']),
      )
      expect(typeof u.name).toBe('string')
    }
    const json = JSON.stringify(body.users)
    for (const other of db.users.filter((u) => u.fe !== 'u-tenant')) {
      expect(json).not.toContain(other.email)
      expect(json).not.toContain(other.phone!)
      expect(json).not.toContain(`ID-${other.fe}`)
      expect(json).not.toContain(`DOC-${other.fe}`)
    }
    expect(json).not.toContain('u-tenant2')
    expect(json).not.toContain('u-ll')
    expect(json).not.toContain('u-cape-agent')
  })

  it('a ground agent sees own agency users redacted, nothing from other agencies', async () => {
    production()
    const res = await bootstrap({ Authorization: `Bearer ${tokens['u-james']}` })
    const body = (await res.json()) as Boot
    const ids = body.users.map((u) => u.id).sort()
    expect(ids).toEqual(['u-admin', 'u-james', 'u-ll', 'u-tenant', 'u-tenant2'])
    for (const u of body.users.filter((x) => x.id !== 'u-james')) assertNoPrivate(u)
  })

  it("an agency users.manage admin sees their agency's users in full, nothing from other agencies", async () => {
    production()
    const res = await bootstrap({ Authorization: `Bearer ${tokens['u-admin']}` })
    const body = (await res.json()) as Boot
    const ids = body.users.map((u) => u.id).sort()
    expect(ids).toEqual(['u-admin', 'u-james', 'u-ll', 'u-tenant', 'u-tenant2'])
    const t2 = body.users.find((u) => u.id === 'u-tenant2')!
    expect(t2.email).toBe('u-tenant2@example.test')
    expect(JSON.stringify(t2)).toContain('DOC-u-tenant2')
    expect(JSON.stringify(body.users)).not.toContain('u-cape-agent')
  })
})

describe('public marketplace errors', () => {
  it('a marketplace 500 returns a generic error, never database text', async () => {
    db.failReads = 'relation "units" does not exist (host=db.internal user=pf_owner)'
    const res = await app.request('/api/public/marketplace')
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ error: 'marketplace_failed', message: 'Listings are unavailable right now.' })
    expect(text).not.toContain('relation')
    expect(text).not.toContain('db.internal')
  })
})

describe('Jim B7: password change goes through a route that checks the current password', () => {
  const xff = (n: number) => ({ 'x-forwarded-for': `10.7.0.${n}` })

  it('no session gives 401 and writes nothing', async () => {
    const res = await app.request('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...xff(1) },
      body: JSON.stringify({ currentPassword: TEST_FIXTURE_PW, newPassword: TEST_FIXTURE_NEW_PW }),
    })
    expect(res.status).toBe(401)
    expect(db.writes.some((w) => w.includes('password_hash'))).toBe(false)
  })

  it('a wrong current password gives 401 and writes nothing', async () => {
    const res = await app.request('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokens['u-tenant']}`, ...xff(2) },
      body: JSON.stringify({ currentPassword: TEST_FIXTURE_WRONG_PW, newPassword: TEST_FIXTURE_NEW_PW }),
    })
    expect(res.status).toBe(401)
    expect(db.writes.some((w) => w.includes('password_hash'))).toBe(false)
  })

  it('the right current password stores a new hash for the session user and clears mustChangePassword', async () => {
    const res = await app.request('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokens['u-tenant']}`, ...xff(3) },
      body: JSON.stringify({ currentPassword: TEST_FIXTURE_PW, newPassword: TEST_FIXTURE_NEW_PW }),
    })
    expect(res.status).toBe(200)
    const upd = db.writes.find((w) => w.startsWith('UPDATE users SET password_hash = $2'))
    expect(upd).toBeTruthy()
    expect(upd).toContain('"mustChangePassword": false')
  })

  it('a short new password is a 400', async () => {
    const res = await app.request('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokens['u-tenant']}`, ...xff(4) },
      body: JSON.stringify({ currentPassword: TEST_FIXTURE_PW, newPassword: TEST_FIXTURE_SHORT_PW }),
    })
    expect(res.status).toBe(400)
  })

  it('a tenant cannot set a passwordHash through /api/persist', async () => {
    const res = await app.request('/api/persist', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokens['u-tenant']}` },
      body: JSON.stringify({
        resource: 'user',
        action: 'upsert',
        id: 'u-tenant',
        data: { id: 'u-tenant', name: 'T P', passwordHash: TEST_FIXTURE_HASH },
      }),
    })
    expect(res.status).toBe(200)
    const ins = db.writes.find((w) => w.startsWith('INSERT INTO users'))
    expect(ins).toBeTruthy()
    expect(ins).not.toContain('password_hash = COALESCE(EXCLUDED.password_hash')
  })
})

describe('Jim B8: reserved super-admin emails', () => {
  it('registering a listed address is refused with 403 and nothing is inserted', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.8.0.1' },
      body: JSON.stringify({
        email: 'Super@PropertyFlow.app',
        password: TEST_FIXTURE_NEW_PW,
        firstName: 'Mal',
        lastName: 'Lory',
        phone: '0820000000',
        role: 'tenant',
      }),
    })
    expect(res.status).toBe(403)
    expect(db.writes.some((w) => w.startsWith('INSERT INTO users'))).toBe(false)
  })

  it('an END_USER row that carries a listed email signs in as a tenant, not a super admin', async () => {
    const { hashPassword } = await import('./auth')
    const row = { ...user('u-squat', '09', 'END_USER', null), email: 'sambampo200@gmail.com', password_hash: await hashPassword(TEST_FIXTURE_PW) }
    row.metadata = { frontend_id: 'u-squat', frontend_role: 'super_admin' }
    db.users.push(row)
    try {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.8.0.2' },
        body: JSON.stringify({ email: 'sambampo200@gmail.com', password: TEST_FIXTURE_PW }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { token: string; user: { role: string } }
      expect(body.user.role).toBe('tenant')
      // The session actor is a tenant too: a super-admin-only route refuses it.
      const persist = await app.request('/api/persist', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${body.token}` },
        body: JSON.stringify({ resource: 'user', action: 'delete', id: 'u-tenant2' }),
      })
      expect(persist.status).toBe(403)
    } finally {
      db.users = db.users.filter((u) => u.fe !== 'u-squat')
    }
  })
})

describe('Jim B5: trust writes and payout dual control', () => {
  const PO = (n: number) => `c7000001-0001-4000-8000-0000000000${String(n).padStart(2, '0')}`
  const uuidOf = (fe: string) => db.users.find((u) => u.fe === fe)!.id
  const extra: string[] = []

  beforeAll(async () => {
    const { hashPassword } = await import('./auth')
    const hash = await hashPassword(TEST_FIXTURE_PW)
    db.users.push(
      { ...user('u-admin2', '11', 'AGENCY_ADMIN', HORIZON), password_hash: hash },
      { ...user('u-admin-np', '12', 'AGENCY_ADMIN', HORIZON), password_hash: hash },
      { ...user('u-cape-admin', '13', 'AGENCY_ADMIN', CAPE), password_hash: hash },
      { ...user('u-contractor', '14', 'CONTRACTOR', HORIZON), password_hash: hash },
    )
    db.users.find((u) => u.fe === 'u-admin-np')!.metadata.enabledPermissions = ['trust.view', 'assets.view']
    extra.push('u-admin2', 'u-admin-np', 'u-cape-admin', 'u-contractor')
    for (const fe of ['u-admin2', 'u-admin-np', 'u-cape-admin', 'u-ll', 'u-contractor']) {
      tokens[fe] = await login(`${fe}@example.test`)
    }
  })

  afterAll(() => {
    db.users = db.users.filter((u) => !extra.includes(u.fe))
  })

  beforeEach(() => {
    db.payouts = [
      // Proposed by u-admin, payee the landlord.
      { id: PO(1), client_id: HORIZON, status: 'proposed', proposed_by: uuidOf('u-admin'), approved_by: null, payee_id: 'u-ll', submitted_at: null },
      // Already approved (by u-admin2).
      { id: PO(2), client_id: HORIZON, status: 'approved', proposed_by: uuidOf('u-admin'), approved_by: uuidOf('u-admin2'), payee_id: 'u-ll', submitted_at: null },
      // Payee is u-admin2 themselves.
      { id: PO(3), client_id: HORIZON, status: 'proposed', proposed_by: uuidOf('u-admin'), approved_by: null, payee_id: 'u-admin2', submitted_at: null },
    ]
  })

  const persist = (fe: string, body: Record<string, unknown>) =>
    app.request('/api/persist', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokens[fe]}` },
      body: JSON.stringify(body),
    })
  const step = (fe: string, id: string, s: 'approve' | 'submit') =>
    app.request(`/api/trust/payouts/${id}/${s}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokens[fe]}` },
      body: '{}',
    })
  const trustRow = (resource: string, extraData: Record<string, unknown> = {}) => ({
    resource,
    action: 'upsert',
    id: `${resource}-new-1`,
    data: { agencyId: 'ag-horizon', propertyId: 'p-1', amountCents: 1000, ...extraData },
  })
  const TRUST = ['trust_transaction', 'trust_allocation', 'csv_import_batch', 'payout_instruction', 'deposit_holding']

  it('tenants, landlords, contractors and field agents get 403 on every trust resource', async () => {
    for (const fe of ['u-tenant', 'u-ll', 'u-contractor', 'u-james']) {
      for (const r of TRUST) {
        const res = await persist(fe, trustRow(r))
        expect(res.status, `${fe} ${r}`).toBe(403)
      }
    }
    expect(db.writes.filter((w) => /trust_|payout_|deposit_|csv_import/.test(w))).toEqual([])
  })

  it('an agency admin without trust permissions gets 403', async () => {
    for (const r of TRUST) {
      expect((await persist('u-admin-np', trustRow(r))).status, r).toBe(403)
    }
  })

  it("an agency admin cannot write another agency's trust rows", async () => {
    expect((await persist('u-admin', trustRow('trust_allocation', { agencyId: 'ag-cape' }))).status).toBe(403)
    expect((await persist('u-cape-admin', { resource: 'payout_instruction', action: 'upsert', id: PO(1), data: { agencyId: 'ag-cape' } })).status).toBe(403)
  })

  it('an agency admin with trust permissions writes their own agency trust rows', async () => {
    for (const r of ['csv_import_batch', 'deposit_holding', 'trust_transaction']) {
      const res = await persist('u-admin', trustRow(r))
      expect(res.status, r).toBe(200)
    }
  })

  it('a payout created through persist is always a fresh proposal by the actor', async () => {
    const res = await persist('u-admin', {
      resource: 'payout_instruction',
      action: 'upsert',
      id: PO(9),
      data: {
        agencyId: 'ag-horizon',
        propertyId: 'p-1',
        payeeId: 'u-ll',
        amountCents: 5000,
        status: 'settled',
        approvedBy: 'u-admin2',
        proposedBy: 'u-admin2',
        submittedAt: '2026-10-01',
        settledAt: '2026-10-02',
        partnerPayoutId: 'FAKE-1',
      },
    })
    expect(res.status).toBe(200)
    const i = db.writes.findIndex((w) => w.startsWith('INSERT INTO payout_instructions'))
    expect(i).toBeGreaterThanOrEqual(0)
    const sql = db.writes[i]
    expect(sql).toContain("'proposed', $10::uuid, NULL, NULL, NULL, NULL")
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING')
    const params = db.writeParams[i]
    expect(params[9]).toBe(uuidOf('u-admin')) // proposed_by = actor, not the payload
    expect(params).not.toContain('FAKE-1')
    expect(params).not.toContain('settled')
  })

  it('approving or submitting through generic persist is refused, even for a super admin', async () => {
    for (const fe of ['u-admin2', 'u-sa']) {
      const res = await persist(fe, {
        resource: 'payout_instruction',
        action: 'upsert',
        id: PO(1),
        data: { agencyId: 'ag-horizon', status: 'approved', approvedBy: fe },
      })
      expect(res.status, fe).toBe(403)
    }
    expect(db.payouts[0].status).toBe('proposed')
  })

  it('the proposer cannot approve their own payout', async () => {
    const res = await step('u-admin', PO(1), 'approve')
    expect(res.status).toBe(403)
    expect(db.payouts[0].status).toBe('proposed')
  })

  it('a second admin of the same agency with trust.approve_payout approves it', async () => {
    const res = await step('u-admin2', PO(1), 'approve')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { instruction: { status: string; approvedBy: string } }
    expect(body.instruction).toMatchObject({ status: 'approved', approvedBy: 'u-admin2' })
    expect(db.payouts[0]).toMatchObject({ status: 'approved', approved_by: uuidOf('u-admin2') })
    // Approving again is a conflict, not a second approval.
    expect((await step('u-admin2', PO(1), 'approve')).status).toBe(409)
  })

  it('landlords (incl. the payee), tenants, contractors, field agents, other agencies and no-permission admins cannot approve', async () => {
    for (const fe of ['u-ll', 'u-tenant', 'u-contractor', 'u-james', 'u-cape-admin', 'u-admin-np']) {
      expect((await step(fe, PO(1), 'approve')).status, fe).toBe(403)
    }
    expect(db.payouts[0].status).toBe('proposed')
  })

  it('the payee cannot approve a payout to themselves', async () => {
    expect((await step('u-admin2', PO(3), 'approve')).status).toBe(403)
    expect(db.payouts[2].status).toBe('proposed')
  })

  it('submit moves approved -> submitted only (never settled), and refuses a proposed payout', async () => {
    expect((await step('u-admin', PO(1), 'submit')).status).toBe(409)
    expect((await step('u-ll', PO(2), 'submit')).status).toBe(403)
    const res = await step('u-admin', PO(2), 'submit')
    expect(res.status).toBe(200)
    expect(db.payouts[1].status).toBe('submitted')
    const upd = db.writes.find((w) => w.includes("SET status = 'submitted'"))!
    expect(upd).toContain('settled_at = NULL')
    expect(upd).toContain('partner_payout_id = NULL')
  })

  it('no session gives 401 on the payout routes', async () => {
    production()
    const res = await app.request(`/api/trust/payouts/${PO(1)}/approve`, { method: 'POST', body: '{}' })
    expect(res.status).toBe(401)
  })
})

describe('Jim B5: applicants cannot approve their own application', () => {
  it('a tenant session approving their own application gets 403 and nothing is written', async () => {
    const res = await app.request('/api/applications/d8000001-0001-4000-8000-000000000001/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokens['u-tenant']}` },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(403)
    expect(db.writes).toEqual([])
  })
})
