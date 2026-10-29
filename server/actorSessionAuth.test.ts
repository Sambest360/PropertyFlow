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
  bank_account_id?: string | null
}

type DepositRow = {
  id: string
  client_id: string
  status: string
  release_proposed_by: string | null
  release_approved_by: string | null
  held_cents?: number
  expected_cents?: number
  interest_accrued_cents?: number
  metadata?: Record<string, unknown>
}

const db = vi.hoisted(() => ({
  users: [] as UserRow[],
  payouts: [] as PayoutRow[],
  deposits: [] as DepositRow[],
  /** Params of each recorded write, same index as `writes`. */
  writeParams: [] as unknown[][],
  writes: [] as string[],
  sql: [] as string[],
  /** When set, every read throws this message (simulates a database failure). */
  failReads: '' as string,
  /** When set, INSERT INTO event_log throws (simulates an audit failure). */
  failEventLog: false as boolean,
  /** Deposit rows snapshot taken at BEGIN, restored on ROLLBACK. */
  txSnapshot: null as null | string,
  /** Params of each bootstrap refund read-back query. */
  refundEventQueries: [] as unknown[][],
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
    if (sql.startsWith('UPDATE deposit_holdings')) {
      db.writes.push(sql)
      db.writeParams.push(params)
      const row = db.deposits.find((d) => d.id === params[0])
      if (!row) return []
      const now = '2026-10-09T10:00:00.000Z'
      if (sql.includes("SET status = 'release_proposed'")) {
        if (row.status !== 'held') return []
        row.status = 'release_proposed'
        row.release_proposed_by = String(params[1])
        row.release_approved_by = null
        return [{ updated_at: now }]
      }
      if (sql.includes("SET status = 'release_approved'")) {
        if (row.status !== 'release_proposed') return []
        if (!row.release_proposed_by || row.release_proposed_by === params[1]) return []
        row.status = 'release_approved'
        row.release_approved_by = String(params[1])
        return [{ updated_at: now }]
      }
      if (sql.includes("SET status = 'held'")) {
        const rejecting = sql.includes('IS DISTINCT FROM')
        const from = rejecting ? 'release_proposed' : String(params[1])
        if (row.status !== from) return []
        if (!rejecting && params[3] !== true && row.release_proposed_by !== params[2]) return []
        if (rejecting && row.release_proposed_by === params[1]) return []
        row.status = 'held'
        row.release_proposed_by = null
        row.release_approved_by = null
        return [{ updated_at: now }]
      }
      if (sql.includes("SET status = 'refunded'")) {
        if (row.status !== 'release_approved' || row.release_approved_by === params[1]) return []
        row.status = 'refunded'
        return [{ updated_at: now }]
      }
      return []
    }
    if (sql === 'BEGIN') {
      db.txSnapshot = JSON.stringify(db.deposits)
      return []
    }
    if (sql === 'COMMIT') {
      db.txSnapshot = null
      return []
    }
    if (sql === 'ROLLBACK') {
      if (db.txSnapshot) {
        const saved = JSON.parse(db.txSnapshot) as DepositRow[]
        for (const r of db.deposits) Object.assign(r, saved.find((x) => x.id === r.id))
      }
      db.txSnapshot = null
      return []
    }
    if (sql.startsWith('INSERT INTO event_log') && db.failEventLog) {
      throw new Error('event_log insert failed (test)')
    }
    if (sql.startsWith('SELECT * FROM deposit_holdings')) {
      return db.deposits.map((d) => ({
        ...d,
        occupancy_id: 'occ-1',
        expected_cents: d.expected_cents ?? d.held_cents ?? 0,
        statutory_deadline_on: null,
        interest_rate_unknown: false,
        created_at: new Date('2026-10-01'),
        updated_at: new Date('2026-10-01'),
      }))
    }
    if (sql.startsWith('SELECT id::text AS id, subject_id::text AS subject_id, payload, created_at FROM event_log')) {
      db.refundEventQueries.push(params)
      const subjects = params[0] as string[]
      const clients = params[1] as string[]
      return db.writes
        .map((w, k) => ({ w, p: db.writeParams[k], k }))
        .filter(
          (x) =>
            x.w.startsWith('INSERT INTO event_log') &&
            x.p[2] === 'deposit_refund_recorded' &&
            subjects.includes(String(x.p[3])) &&
            clients.includes(String(x.p[1])),
        )
        .map((x) => ({ id: x.p[0], subject_id: x.p[3], payload: JSON.parse(String(x.p[5])), created_at: new Date(Date.UTC(2026, 0, 1) + x.k * 1000) }))
    }
    if (sql.startsWith('SELECT status, held_cents, expected_cents, interest_accrued_cents FROM deposit_holdings')) {
      const d = db.deposits.find((x) => x.id === params[0])
      return d
        ? [{ status: d.status, held_cents: d.held_cents ?? 0, expected_cents: d.expected_cents ?? d.held_cents ?? 0, interest_accrued_cents: d.interest_accrued_cents ?? 0 }]
        : []
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
    if (sql.startsWith('SELECT id::text AS id, client_id::text AS client_id, status, release_proposed_by::text')) {
      const d = db.deposits.find((x) => x.id === params[0])
      return d ? [{ ...d }] : []
    }
    if (sql.startsWith('SELECT DISTINCT client_id::text AS client_id FROM payout_instructions WHERE bank_account_id')) {
      const owners = new Set(db.payouts.filter((p) => p.bank_account_id === params[0]).map((p) => p.client_id))
      return [...owners].map((client_id) => ({ client_id }))
    }
    if (sql.startsWith('SELECT "id", "client_id" FROM "deposit_holdings"')) {
      const d = db.deposits.find((x) => x.id === params[0])
      return d ? [{ id: d.id, client_id: d.client_id }] : []
    }
    if (sql.startsWith('SELECT "id", "client_id" FROM "payout_instructions"')) {
      const p = db.payouts.find((x) => x.id === params[0])
      return p ? [{ id: p.id, client_id: p.client_id }] : []
    }
    if (sql.startsWith('SELECT 1 AS ok FROM users WHERE id = $1::uuid')) {
      return db.users.some((x) => x.id === params[0]) ? [{ ok: 1 }] : []
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
  vi.stubEnv('NODE_ENV', 'production')
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

  it('CR7: X-Role agency-admin headers with no session cannot reach the help desk', async () => {
    production()
    const res = await bootstrap({ 'X-User-Id': 'u-admin', 'X-Role': 'agent_admin', 'X-Agency-Id': 'ag-horizon' })
    expect(res.status).toBe(401)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.supportTickets).toBeUndefined()
    const persist = await app.request('/api/persist', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...SA_HEADERS },
      body: JSON.stringify({
        resource: 'support_ticket',
        action: 'upsert',
        id: 'HD-x',
        data: { status: 'resolved', resolutionNote: 'x' },
      }),
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

  it('NODE_ENV=production alone refuses demo headers on bootstrap and persist', async () => {
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

  it('ALLOW_DEMO_ACTOR=1 is ignored on NODE_ENV=production', async () => {
    vi.stubEnv('ALLOW_DEMO_ACTOR', '1')
    vi.stubEnv('NODE_ENV', 'production')
    expect((await bootstrap({ 'X-User-Id': 'u-tenant', 'X-Role': 'tenant' })).status).toBe(401)
  })

  it('ALLOW_DEMO_ACTOR=1 is ignored in production (sign-in required)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '1')
    const res = await bootstrap({ 'X-User-Id': 'u-tenant', 'X-Role': 'tenant' })
    expect(res.status).toBe(401)
    expect(JSON.stringify(await res.json())).toMatch(/sign[- ]in required/i)
    const persist = await app.request('/api/persist', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-User-Id': 'u-tenant', 'X-Role': 'tenant' },
      body: JSON.stringify({ op: 'upsert', resource: 'ticket', id: 'tk-x', data: {} }),
    })
    expect(persist.status).toBe(401)
    const text = JSON.stringify(await persist.json())
    expect(text).toMatch(/Sign-in required/)
    expect(text).not.toMatch(/X-User-Id/)
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
    expect(upd).toContain("'mustChangePassword', false")
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

describe('Follow-up: deposit release dual control and payout bank account', () => {
  const DH = (n: number) => `c8000001-0001-4000-8000-0000000000${String(n).padStart(2, '0')}`
  const PO = (n: number) => `c7000001-0001-4000-8000-0000000000${String(n).padStart(2, '0')}`
  const uuidOf = (fe: string) => db.users.find((u) => u.fe === fe)!.id
  const extra: string[] = []

  beforeAll(async () => {
    const { hashPassword } = await import('./auth')
    const hash = await hashPassword(TEST_FIXTURE_PW)
    db.users.push(
      { ...user('u-dep-admin2', '21', 'AGENCY_ADMIN', HORIZON), password_hash: hash },
      { ...user('u-dep-alloc', '22', 'AGENCY_ADMIN', HORIZON), password_hash: hash },
      { ...user('u-dep-np', '23', 'AGENCY_ADMIN', HORIZON), password_hash: hash },
      { ...user('u-dep-cape', '24', 'AGENCY_ADMIN', CAPE), password_hash: hash },
    )
    // Allocator only: may propose a release, not approve one.
    db.users.find((u) => u.fe === 'u-dep-alloc')!.metadata.enabledPermissions = ['trust.view', 'trust.allocate']
    db.users.find((u) => u.fe === 'u-dep-np')!.metadata.enabledPermissions = ['trust.view']
    extra.push('u-dep-admin2', 'u-dep-alloc', 'u-dep-np', 'u-dep-cape')
    for (const fe of extra) tokens[fe] = await login(`${fe}@example.test`)
  })

  afterAll(() => {
    db.users = db.users.filter((u) => !extra.includes(u.fe))
  })

  beforeEach(() => {
    db.deposits = [
      { id: DH(1), client_id: HORIZON, status: 'held', release_proposed_by: null, release_approved_by: null },
      // Proposed by u-admin.
      { id: DH(2), client_id: HORIZON, status: 'release_proposed', release_proposed_by: uuidOf('u-admin'), release_approved_by: null },
      // Legacy proposed row without a proposer.
      { id: DH(3), client_id: HORIZON, status: 'release_proposed', release_proposed_by: null, release_approved_by: null },
    ]
    db.payouts = [
      { id: PO(1), client_id: HORIZON, status: 'approved', proposed_by: null, approved_by: null, payee_id: 'u-ll', submitted_at: null, bank_account_id: 'BA-HZN-1' },
      { id: PO(2), client_id: CAPE, status: 'approved', proposed_by: null, approved_by: null, payee_id: 'u-x', submitted_at: null, bank_account_id: 'BA-CAPE-1' },
      { id: PO(3), client_id: HORIZON, status: 'approved', proposed_by: null, approved_by: null, payee_id: 'u-x', submitted_at: null, bank_account_id: 'BA-SHARED' },
      { id: PO(4), client_id: CAPE, status: 'approved', proposed_by: null, approved_by: null, payee_id: 'u-x', submitted_at: null, bank_account_id: 'BA-SHARED' },
    ]
  })

  const call = (fe: string, id: string, s: 'propose-release' | 'approve-release') =>
    app.request(`/api/trust/deposits/${id}/${s}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokens[fe]}` },
      body: '{}',
    })
  const persist = (fe: string, body: Record<string, unknown>) =>
    app.request('/api/persist', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokens[fe]}` },
      body: JSON.stringify(body),
    })

  it('persist never takes a deposit status or release_*_by from the payload', async () => {
    const res = await persist('u-admin', {
      resource: 'deposit_holding',
      action: 'upsert',
      id: DH(9),
      data: {
        agencyId: 'ag-horizon',
        occupancyId: 'occ-1',
        expectedCents: 1000,
        heldCents: 1000,
        status: 'release_approved',
        releaseProposedBy: 'u-admin',
        releaseApprovedBy: 'u-dep-admin2',
      },
    })
    expect(res.status).toBe(200)
    const i = db.writes.findIndex((w) => w.startsWith('INSERT INTO deposit_holdings'))
    expect(i).toBeGreaterThanOrEqual(0)
    const sql = db.writes[i]
    expect(sql).toContain("CASE WHEN $6::bigint > 0 THEN 'held' ELSE 'expected' END")
    expect(sql).toContain('NULL, NULL')
    expect(sql).toContain("WHEN deposit_holdings.status = 'expected' AND EXCLUDED.held_cents > 0 THEN 'held'")
    expect(sql).not.toMatch(/release_proposed_by = EXCLUDED/)
    expect(sql).not.toMatch(/release_approved_by = EXCLUDED/)
    const params = db.writeParams[i]
    expect(params).not.toContain('release_approved')
    expect(params).not.toContain(uuidOf('u-admin'))
    expect(params).not.toContain(uuidOf('u-dep-admin2'))
  })

  it('propose: held -> release_proposed by the actor; a second propose is a 409', async () => {
    const res = await call('u-dep-alloc', DH(1), 'propose-release')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { deposit: Record<string, unknown> }
    expect(body.deposit).toMatchObject({ id: DH(1), status: 'release_proposed', releaseProposedBy: 'u-dep-alloc' })
    expect(db.deposits[0]).toMatchObject({ status: 'release_proposed', release_proposed_by: uuidOf('u-dep-alloc') })
    expect((await call('u-admin', DH(1), 'propose-release')).status).toBe(409)
  })

  it('the proposer cannot approve their own release', async () => {
    expect((await call('u-admin', DH(2), 'approve-release')).status).toBe(403)
    expect(db.deposits[1].status).toBe('release_proposed')
  })

  it('a second same-agency admin with trust.approve_payout approves; again is a 409', async () => {
    const res = await call('u-dep-admin2', DH(2), 'approve-release')
    expect(res.status).toBe(200)
    expect(db.deposits[1]).toMatchObject({ status: 'release_approved', release_approved_by: uuidOf('u-dep-admin2') })
    expect((await call('u-dep-admin2', DH(2), 'approve-release')).status).toBe(409)
  })

  it('approve needs trust.approve_payout: an allocator-only admin may propose but not approve', async () => {
    expect((await call('u-dep-alloc', DH(2), 'approve-release')).status).toBe(403)
    expect(db.deposits[1].status).toBe('release_proposed')
  })

  it('other agencies, no-permission admins and portal / field roles get 403 on both routes', async () => {
    for (const fe of ['u-dep-cape', 'u-dep-np', 'u-ll', 'u-tenant', 'u-james']) {
      expect((await call(fe, DH(1), 'propose-release')).status, `${fe} propose`).toBe(403)
      expect((await call(fe, DH(2), 'approve-release')).status, `${fe} approve`).toBe(403)
    }
    expect(db.deposits.map((d) => d.status)).toEqual(['held', 'release_proposed', 'release_proposed'])
  })

  it('approve without a recorded proposer, or of a held deposit, is a 409', async () => {
    expect((await call('u-dep-admin2', DH(3), 'approve-release')).status).toBe(409)
    expect((await call('u-dep-admin2', DH(1), 'approve-release')).status).toBe(409)
  })

  it('a race: the conditional UPDATE loses with 409 when the row moved after the read', async () => {
    // The row is read as release_proposed, then another approver wins first.
    const row = db.deposits[1]
    const realFind = db.deposits.find.bind(db.deposits)
    let reads = 0
    db.deposits.find = ((pred: (d: DepositRow) => boolean) => {
      const hit = realFind(pred)
      if (hit === row && ++reads === 2) row.status = 'release_approved'
      return hit
    }) as typeof db.deposits.find
    try {
      expect((await call('u-dep-admin2', DH(2), 'approve-release')).status).toBe(409)
    } finally {
      db.deposits.find = realFind as typeof db.deposits.find
    }
  })

  it('an unknown deposit is a 404 and no session is a 401', async () => {
    expect((await call('u-admin', DH(77), 'propose-release')).status).toBe(404)
    production()
    expect((await app.request(`/api/trust/deposits/${DH(1)}/propose-release`, { method: 'POST', body: '{}' })).status).toBe(401)
  })

  const payout = (bankAccountId: unknown, n = 50) => ({
    resource: 'payout_instruction',
    action: 'upsert',
    id: PO(n),
    data: { agencyId: 'ag-horizon', propertyId: 'p-1', payeeId: 'u-ll', amountCents: 5000, bankAccountId },
  })

  it("a payout may name a bank account already on file for the actor's agency, or none", async () => {
    expect((await persist('u-admin', payout('BA-HZN-1', 51))).status).toBe(200)
    expect((await persist('u-admin', payout('', 52))).status).toBe(200)
  })

  it("a payout naming another agency's, a shared or an unknown bank account is refused", async () => {
    for (const bank of ['BA-CAPE-1', 'BA-SHARED', 'BA-NEW-999']) {
      expect((await persist('u-admin', payout(bank))).status, bank).toBe(403)
    }
    expect(db.writes.some((w) => w.startsWith('INSERT INTO payout_instructions'))).toBe(false)
  })
})

describe('D2: deposit reject, cancel, refund record and held_cents lock', () => {
  const DH = (n: number) => `c8000002-0001-4000-8000-0000000000${String(n).padStart(2, '0')}`
  const uuidOf = (fe: string) => db.users.find((u) => u.fe === fe)!.id
  const extra = ['u-d2-admin2', 'u-d2-admin3', 'u-d2-alloc', 'u-d2-cape']

  beforeAll(async () => {
    const { hashPassword } = await import('./auth')
    const hash = await hashPassword(TEST_FIXTURE_PW)
    db.users.push(
      { ...user('u-d2-admin2', '31', 'AGENCY_ADMIN', HORIZON), password_hash: hash },
      { ...user('u-d2-admin3', '32', 'AGENCY_ADMIN', HORIZON), password_hash: hash },
      { ...user('u-d2-alloc', '33', 'AGENCY_ADMIN', HORIZON), password_hash: hash },
      { ...user('u-d2-cape', '34', 'AGENCY_ADMIN', CAPE), password_hash: hash },
    )
    db.users.find((u) => u.fe === 'u-d2-alloc')!.metadata.enabledPermissions = ['trust.view', 'trust.allocate']
    for (const fe of extra) tokens[fe] = await login(`${fe}@example.test`)
  })
  afterAll(() => {
    db.users = db.users.filter((u) => !extra.includes(u.fe))
  })

  beforeEach(() => {
    db.writes = []
    db.writeParams = []
    db.deposits = [
      { id: DH(1), client_id: HORIZON, status: 'held', release_proposed_by: null, release_approved_by: null, held_cents: 100000, interest_accrued_cents: 0 },
      // Proposed by the allocator-only admin.
      { id: DH(2), client_id: HORIZON, status: 'release_proposed', release_proposed_by: uuidOf('u-d2-alloc'), release_approved_by: null, held_cents: 100000, interest_accrued_cents: 0 },
      // Proposed by u-admin, approved by u-d2-admin2.
      { id: DH(3), client_id: HORIZON, status: 'release_approved', release_proposed_by: uuidOf('u-admin'), release_approved_by: uuidOf('u-d2-admin2'), held_cents: 100000, interest_accrued_cents: 1500 },
    ]
  })

  const post = (fe: string, id: string, step: string, body: unknown = {}) =>
    app.request(`/api/trust/deposits/${id}/${step}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokens[fe]}` },
      body: JSON.stringify(body),
    })
  const events = () =>
    db.writes
      .map((w, i) => ({ w, p: db.writeParams[i] }))
      .filter((x) => x.w.startsWith('INSERT INTO event_log'))
      .map((x) => ({ type: x.p[2], actor: x.p[4], payload: JSON.parse(String(x.p[5])) }))
  const goodSplit = { refundedCents: 81500, interestCents: 1500, deductions: [{ reason: 'Broken window', amountCents: 20000 }] }

  it('reject: an approver who is not the proposer sends it back to held with the reason, metadata and an event', async () => {
    const res = await post('u-d2-admin2', DH(2), 'reject-release', { reason: 'Inspection not done' })
    expect(res.status).toBe(200)
    expect(db.deposits[1]).toMatchObject({ status: 'held', release_proposed_by: null })
    expect(events()).toEqual([
      expect.objectContaining({
        type: 'deposit_release_rejected',
        actor: uuidOf('u-d2-admin2'),
        payload: expect.objectContaining({ from: 'release_proposed', to: 'held', reason: 'Inspection not done' }),
      }),
    ])
    // A second reject (now held) is a 409.
    expect((await post('u-d2-admin2', DH(2), 'reject-release', { reason: 'Too late' })).status).toBe(409)
  })

  it('reject without a reason, under 3 or over 500 characters, is a 400 (3 is accepted)', async () => {
    expect((await post('u-d2-admin2', DH(2), 'reject-release', {})).status).toBe(400)
    expect((await post('u-d2-admin2', DH(2), 'reject-release', { reason: '   ' })).status).toBe(400)
    expect((await post('u-d2-admin2', DH(2), 'reject-release', { reason: 'x'.repeat(501) })).status).toBe(400)
    // Spec: 3 to 500 characters (trimmed).
    expect((await post('u-d2-admin2', DH(2), 'reject-release', { reason: 'no' })).status).toBe(400)
    expect((await post('u-d2-admin2', DH(2), 'reject-release', { reason: ' ab ' })).status).toBe(400)
    expect((await post('u-d2-admin2', DH(2), 'reject-release', { reason: 'abc' })).status).toBe(200)
    expect(db.deposits[1].status).toBe('held')
    expect(events()).toHaveLength(1)
  })

  it('reject is refused for the proposer, an allocator-only admin, and from a non-proposed state', async () => {
    db.deposits[1].release_proposed_by = uuidOf('u-d2-admin2')
    expect((await post('u-d2-admin2', DH(2), 'reject-release', { reason: 'mine' })).status).toBe(403)
    expect((await post('u-d2-alloc', DH(2), 'reject-release', { reason: 'no perm' })).status).toBe(403)
    expect((await post('u-d2-admin3', DH(1), 'reject-release', { reason: 'held' })).status).toBe(409)
    expect((await post('u-d2-admin3', DH(3), 'reject-release', { reason: 'approved' })).status).toBe(409)
    expect(db.deposits.map((d) => d.status)).toEqual(['held', 'release_proposed', 'release_approved'])
  })

  it('cancel: the proposer (even allocator-only) cancels a proposed release back to held', async () => {
    const res = await post('u-d2-alloc', DH(2), 'cancel-release')
    expect(res.status).toBe(200)
    expect(db.deposits[1]).toMatchObject({ status: 'held', release_proposed_by: null })
    expect(events()[0]).toMatchObject({ actor: uuidOf('u-d2-alloc'), payload: { cancelledBy: 'u-d2-alloc' } })
    expect(events()[0]).toMatchObject({ type: 'deposit_release_cancelled', payload: { from: 'release_proposed', to: 'held' } })
  })

  it('cancel: a super admin cancels an approved release back to held', async () => {
    expect((await post('u-sa', DH(3), 'cancel-release')).status).toBe(200)
    expect(db.deposits[2]).toMatchObject({ status: 'held', release_approved_by: null })
    expect(events()[0]).toMatchObject({ payload: { from: 'release_approved', to: 'held' } })
  })

  it('cancel: the proposer cancels their approved release back to held', async () => {
    expect((await post('u-admin', DH(3), 'cancel-release')).status).toBe(200)
    expect(db.deposits[2].status).toBe('held')
  })

  it('cancel is refused for a same-agency trust approver who is not the proposer (proposer or super admin only)', async () => {
    expect((await post('u-d2-admin3', DH(3), 'cancel-release')).status).toBe(403)
    expect((await post('u-d2-admin2', DH(2), 'cancel-release')).status).toBe(403)
    expect(db.deposits.map((d) => d.status)).toEqual(['held', 'release_proposed', 'release_approved'])
    expect(events()).toEqual([])
  })

  it('cancel is refused for a non-proposer allocator and from held or refunded', async () => {
    expect((await post('u-d2-alloc', DH(3), 'cancel-release')).status).toBe(403)
    expect((await post('u-d2-alloc', DH(1), 'cancel-release')).status).toBe(409)
    db.deposits[2].status = 'refunded'
    expect((await post('u-sa', DH(3), 'cancel-release')).status).toBe(409)
  })

  it('cancel race: the proposer changes between check and update -> 409, nothing written', async () => {
    const row = db.deposits[1] // proposed by u-d2-alloc
    const realFind = db.deposits.find.bind(db.deposits)
    let reads = 0
    db.deposits.find = ((pred: (d: DepositRow) => boolean) => {
      const hit = realFind(pred)
      // After the route's read, someone else re-proposes before the UPDATE.
      if (hit === row && ++reads === 2) row.release_proposed_by = uuidOf('u-d2-admin2')
      return hit
    }) as typeof db.deposits.find
    try {
      expect((await post('u-d2-alloc', DH(2), 'cancel-release')).status).toBe(409)
    } finally {
      db.deposits.find = realFind as typeof db.deposits.find
    }
    expect(row.status).toBe('release_proposed')
    expect(events()).toEqual([])
    const upd = db.writes.findIndex((w) => w.startsWith('UPDATE deposit_holdings'))
    expect(db.writes[upd]).toContain('AND ($4::boolean OR release_proposed_by = $3::uuid)')
    expect(db.writeParams[upd].slice(2)).toEqual([uuidOf('u-d2-alloc'), false])
  })

  it('a super admin cancel passes the is-super flag and is not tied to the proposer', async () => {
    expect((await post('u-sa', DH(2), 'cancel-release')).status).toBe(200)
    const upd = db.writes.findIndex((w) => w.startsWith('UPDATE deposit_holdings'))
    expect(db.writeParams[upd][3]).toBe(true)
  })

  it('an over-long cancel reason is a 400, not truncated', async () => {
    expect((await post('u-d2-alloc', DH(2), 'cancel-release', { reason: 'x'.repeat(501) })).status).toBe(400)
    expect(db.deposits[1].status).toBe('release_proposed')
    expect((await post('u-d2-alloc', DH(2), 'cancel-release', { reason: 'x'.repeat(500) })).status).toBe(200)
    expect(events()[0].payload.reason).toHaveLength(500)
  })

  it('another agency admin (with trust permissions) gets 403 on reject, cancel and refund', async () => {
    db.users.find((u) => u.fe === 'u-d2-cape')!.metadata.enabledPermissions = ['trust.view', 'trust.allocate', 'trust.approve_payout']
    expect((await post('u-d2-cape', DH(2), 'reject-release', { reason: 'Not ours' })).status).toBe(403)
    expect((await post('u-d2-cape', DH(2), 'cancel-release')).status).toBe(403)
    expect((await post('u-d2-cape', DH(3), 'refund', goodSplit)).status).toBe(403)
    expect(db.deposits.map((d) => d.status)).toEqual(['held', 'release_proposed', 'release_approved'])
    expect(events()).toEqual([])
  })

  it('refund: a second person (not the approver) records a balanced split; copy says recorded, not bank-confirmed', async () => {
    const res = await post('u-d2-admin3', DH(3), 'refund', goodSplit)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { deposit: { status: string; refund: Record<string, unknown> } }
    expect(body.deposit.status).toBe('refunded')
    expect(body.deposit.refund).toMatchObject({
      ...goodSplit,
      heldCents: 100000,
      interestEnteredBy: 'u-d2-admin3',
      recordedBy: 'u-d2-admin3',
      bankConfirmed: false,
      label: 'Refund recorded (not bank-confirmed)',
    })
    expect(db.deposits[2]).not.toHaveProperty('metadata')
    expect(db.writes.some((w) => /metadata/.test(w) && w.includes('deposit_holdings'))).toBe(false)
    const ev = events()
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ type: 'deposit_refund_recorded', actor: uuidOf('u-d2-admin3'), payload: { from: 'release_approved', to: 'refunded', refund: goodSplit } })
    expect(JSON.stringify(body)).not.toMatch(/settled|Refunded|paid/)
    expect(String(body.deposit.refund.label)).not.toMatch(/^Refunded|settled|paid/i)
    // Recording again is a 409.
    expect((await post('u-d2-admin3', DH(3), 'refund', goodSplit)).status).toBe(409)
  })

  it('refund without a second person (the approver records it) is refused', async () => {
    expect((await post('u-d2-admin2', DH(3), 'refund', goodSplit)).status).toBe(403)
    expect(db.deposits[2].status).toBe('release_approved')
    expect(events()).toEqual([])
  })

  it('refund only from release_approved, and needs approve permission', async () => {
    expect((await post('u-d2-admin3', DH(2), 'refund', goodSplit)).status).toBe(409)
    expect((await post('u-d2-admin3', DH(1), 'refund', goodSplit)).status).toBe(409)
    expect((await post('u-d2-alloc', DH(3), 'refund', goodSplit)).status).toBe(403)
  })

  it('an unbalanced refund split is a 400 (refunded + deductions must equal held + interest)', async () => {
    for (const split of [
      { ...goodSplit, refundedCents: 81499 },
      { ...goodSplit, interestCents: 0 },
      { refundedCents: 100000, interestCents: 1500, deductions: [] },
      { ...goodSplit, refundedCents: -1, deductions: [{ reason: 'x', amountCents: 102501 }] },
      { ...goodSplit, refundedCents: 815.5 },
      { ...goodSplit, refundedCents: 83000, interestCents: -1500 },
      { ...goodSplit, interestCents: 1500.5, refundedCents: 81500.5 },
      { ...goodSplit, interestCents: '1500' },
      { refundedCents: 101500, deductions: [] },
    ]) {
      expect((await post('u-d2-admin3', DH(3), 'refund', split)).status, JSON.stringify(split)).toBe(400)
    }
    expect(db.deposits[2].status).toBe('release_approved')
  })

  it('a balanced split with no deductions, or several, is accepted', async () => {
    expect((await post('u-d2-admin3', DH(3), 'refund', { refundedCents: 101500, interestCents: 1500, deductions: [] })).status).toBe(200)
    db.deposits[2].status = 'release_approved'
    const many = { refundedCents: 1500, interestCents: 1500, deductions: [{ reason: 'Paint', amountCents: 60000 }, { reason: 'Cleaning', amountCents: 40000 }] }
    expect((await post('u-d2-admin3', DH(3), 'refund', many)).status).toBe(200)
  })

  it('every deduction needs a non-empty reason (400 otherwise)', async () => {
    for (const reason of ['', '   ', undefined]) {
      const split = { ...goodSplit, deductions: [{ reason, amountCents: 20000 }] }
      expect((await post('u-d2-admin3', DH(3), 'refund', split)).status, String(reason)).toBe(400)
    }
    expect(db.deposits[2].status).toBe('release_approved')
  })

  it('negative interest is a 400', async () => {
    const res = await post('u-d2-admin3', DH(3), 'refund', { refundedCents: 80000, interestCents: -500, deductions: [{ reason: 'x', amountCents: 19500 }] })
    expect(res.status).toBe(400)
    expect(db.deposits[2].status).toBe('release_approved')
  })

  it('interest is not checked against the stored accrued interest', async () => {
    // Row accrued 1500; staff enter 4000 and the split balances against held + 4000.
    const res = await post('u-d2-admin3', DH(3), 'refund', { refundedCents: 104000, interestCents: 4000, deductions: [] })
    expect(res.status).toBe(200)
  })

  it('each transition writes exactly one audit row, inside the transaction', async () => {
    const steps: [string, string, string, unknown][] = [
      ['u-d2-alloc', DH(1), 'propose-release', {}],
      ['u-d2-admin2', DH(1), 'reject-release', { reason: 'Not yet' }],
      ['u-d2-alloc', DH(1), 'propose-release', {}],
      ['u-d2-alloc', DH(1), 'cancel-release', {}],
      ['u-d2-alloc', DH(1), 'propose-release', {}],
      ['u-d2-admin2', DH(1), 'approve-release', {}],
      ['u-d2-admin3', DH(1), 'refund', { refundedCents: 100000, interestCents: 0, deductions: [] }],
    ]
    const types = ['deposit_release_proposed', 'deposit_release_rejected', 'deposit_release_proposed', 'deposit_release_cancelled', 'deposit_release_proposed', 'deposit_release_approved', 'deposit_refund_recorded']
    for (const [k, [fe, id, step, body]] of steps.entries()) {
      const before = events().length
      const sqlBefore = db.sql.length
      expect((await post(fe, id, step, body)).status, step).toBe(200)
      const ev = events()
      expect(ev.length - before, step).toBe(1)
      expect(ev[ev.length - 1].type).toBe(types[k])
      const tx = db.sql.slice(sqlBefore)
      const b = tx.indexOf('BEGIN')
      const u = tx.findIndex((q) => q.startsWith('UPDATE deposit_holdings'))
      const e = tx.findIndex((q) => q.startsWith('INSERT INTO event_log'))
      const c = tx.indexOf('COMMIT')
      expect(b >= 0 && b < u && u < e && e < c, step).toBe(true)
    }
    expect(db.deposits[0].status).toBe('refunded')
  })

  it('a refused or conflicting transition writes no audit row', async () => {
    await post('u-d2-admin2', DH(1), 'approve-release')
    await post('u-d2-admin3', DH(3), 'refund', { ...goodSplit, refundedCents: 1 })
    expect(events()).toEqual([])
  })

  it('a failed audit insert rolls back the status change', async () => {
    db.failEventLog = true
    try {
      expect((await post('u-d2-admin2', DH(2), 'reject-release', { reason: 'Not yet' })).status).toBe(500)
      expect((await post('u-d2-admin3', DH(3), 'refund', goodSplit)).status).toBe(500)
      expect((await post('u-d2-alloc', DH(1), 'propose-release')).status).toBe(500)
    } finally {
      db.failEventLog = false
    }
    expect(db.deposits.map((d) => [d.status, d.release_proposed_by])).toEqual([
      ['held', null],
      ['release_proposed', uuidOf('u-d2-alloc')],
      ['release_approved', uuidOf('u-admin')],
    ])
    expect(db.sql.filter((q) => q === 'ROLLBACK').length).toBeGreaterThanOrEqual(3)
  })

  it('the refund breakdown survives a reload: bootstrap reads it back from event_log', async () => {
    expect((await post('u-d2-admin3', DH(3), 'refund', goodSplit)).status).toBe(200)
    const res = await app.request('/api/bootstrap', { headers: { Authorization: `Bearer ${tokens['u-admin']}` } })
    expect(res.status).toBe(200)
    const boot = (await res.json()) as { depositHoldings?: Array<{ id: string; status: string; refund: Record<string, unknown> | null }> }
    const dep = boot.depositHoldings?.find((d) => d.status === 'refunded')
    expect(dep?.refund).toMatchObject({ ...goodSplit, heldCents: 100000, interestEnteredBy: 'u-d2-admin3', bankConfirmed: false })
    const held = boot.depositHoldings?.find((d) => d.status === 'held')
    expect(held?.refund ?? null).toBeNull()
  })

  it("bootstrap reads refund rows only for the loaded deposits in the actor's agency; an old own refund still shows", async () => {
    db.users.find((u) => u.fe === 'u-d2-cape')!.metadata.enabledPermissions = ['trust.view', 'trust.allocate', 'trust.approve_payout']
    db.deposits.push({ id: DH(9), client_id: CAPE, status: 'release_approved', release_proposed_by: uuidOf('u-cape-agent'), release_approved_by: uuidOf('u-cape-agent'), held_cents: 50000, interest_accrued_cents: 0 })
    // Own (Horizon) refund first, so it is the OLDEST row.
    expect((await post('u-d2-admin3', DH(3), 'refund', goodSplit)).status).toBe(200)
    expect((await post('u-d2-cape', DH(9), 'refund', { refundedCents: 50000, interestCents: 0, deductions: [] })).status).toBe(200)
    // 450 newer refund rows for other deposits: a global LIMIT 400 would drop ours.
    for (let n = 0; n < 450; n++) {
      db.writes.push('INSERT INTO event_log (noise)')
      db.writeParams.push([`e-${n}`, CAPE, 'deposit_refund_recorded', `c8000009-0000-4000-8000-${String(n).padStart(12, '0')}`, null, JSON.stringify({ refund: { refundedCents: 1 } })])
    }
    db.refundEventQueries = []
    const res = await app.request('/api/bootstrap', { headers: { Authorization: `Bearer ${tokens['u-admin']}` } })
    expect(res.status).toBe(200)
    expect(db.refundEventQueries).toHaveLength(1)
    expect(db.refundEventQueries[0][0]).toEqual([DH(3)])
    expect(db.refundEventQueries[0][1]).toEqual([HORIZON])
    expect(db.sql.find((q) => q.includes("event_type = 'deposit_refund_recorded'"))).not.toMatch(/LIMIT/)
    const text = await res.text()
    expect(text).not.toContain(DH(9))
    expect(text).not.toContain('"refundedCents":50000')
    const boot = JSON.parse(text) as { depositHoldings: Array<{ status: string; refund: Record<string, unknown> | null }> }
    expect(boot.depositHoldings.find((d) => d.status === 'refunded')?.refund).toMatchObject(goodSplit)
  })

  it('portal and field roles get 403 on reject, cancel and refund', async () => {
    for (const fe of ['u-ll', 'u-tenant', 'u-james']) {
      expect((await post(fe, DH(2), 'reject-release', { reason: 'Not yet' })).status, `${fe} reject`).toBe(403)
      expect((await post(fe, DH(2), 'cancel-release')).status, `${fe} cancel`).toBe(403)
      expect((await post(fe, DH(3), 'refund', goodSplit)).status, `${fe} refund`).toBe(403)
    }
    expect(db.deposits.map((d) => d.status)).toEqual(['held', 'release_proposed', 'release_approved'])
  })

  it('the same user cannot propose and then approve', async () => {
    expect((await post('u-d2-admin2', DH(1), 'propose-release')).status).toBe(200)
    expect((await post('u-d2-admin2', DH(1), 'approve-release')).status).toBe(403)
    expect(db.deposits[0].status).toBe('release_proposed')
  })

  const persistDeposit = (id: string, heldCents: number, extra: Record<string, unknown> = {}) =>
    app.request('/api/persist', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokens['u-admin']}` },
      body: JSON.stringify({
        resource: 'deposit_holding',
        action: 'upsert',
        id,
        data: { agencyId: 'ag-horizon', occupancyId: 'occ-1', expectedCents: 100000, heldCents, ...extra },
      }),
    })

  it('held_cents is locked once a release is proposed: persist with a new amount is a 409', async () => {
    for (const id of [DH(2), DH(3)]) {
      const res = await persistDeposit(id, 90000)
      expect(res.status, id).toBe(409)
    }
    expect(db.writes.some((w) => w.startsWith('INSERT INTO deposit_holdings'))).toBe(false)
  })

  it('expected_cents and interest_accrued_cents are locked after propose too (409)', async () => {
    expect((await persistDeposit(DH(2), 100000, { expectedCents: 120000 })).status).toBe(409)
    expect((await persistDeposit(DH(2), 100000, { interestAccruedCents: 99 })).status).toBe(409)
    expect((await persistDeposit(DH(3), 100000, { interestAccruedCents: 0 })).status).toBe(409)
    expect(db.writes.some((w) => w.startsWith('INSERT INTO deposit_holdings'))).toBe(false)
    expect((await persistDeposit(DH(3), 100000, { interestAccruedCents: 1500 })).status).toBe(200)
    expect((await persistDeposit(DH(1), 100000, { expectedCents: 120000, interestAccruedCents: 50 })).status).toBe(200)
    const sql = db.writes.find((w) => w.startsWith('INSERT INTO deposit_holdings'))!
    expect(sql).toContain("WHEN deposit_holdings.status IN ('release_proposed','release_approved','refunded') THEN deposit_holdings.expected_cents")
    expect(sql).toContain("WHEN deposit_holdings.status IN ('release_proposed','release_approved','refunded') THEN deposit_holdings.interest_accrued_cents")
  })

  it('a held deposit can still change amount, and a locked one may persist the same amount', async () => {
    expect((await persistDeposit(DH(1), 90000)).status).toBe(200)
    expect((await persistDeposit(DH(2), 100000)).status).toBe(200)
    const sql = db.writes.find((w) => w.startsWith('INSERT INTO deposit_holdings'))!
    expect(sql).toContain("WHEN deposit_holdings.status IN ('release_proposed','release_approved','refunded') THEN deposit_holdings.held_cents")
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
