/**
 * Route actor checks (fix/route-actor-checks, stacked on #80).
 *
 * Real Hono app (server/index.ts), real login/session, real
 * resolveRequestActor, real scope gate (assertTenancyReadable,
 * requireActorAndGate) and real route handlers. Only the `pg` driver is
 * faked: a Pool answering by SQL shape and recording writes.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  process.env.DATABASE_URL = 'postgres://pf:pf@127.0.0.1:5432/pf_test'
  process.env.AUTH_SECRET = 'test-secret-route-actor-checks'
  delete process.env.VERCEL
  delete process.env.ALLOW_DEMO_ACTOR
})

const HORIZON = 'a1000001-0001-4000-8000-000000000001'
const CAPE = 'a1000001-0001-4000-8000-000000000002'
const uid = (n: string) => `b9000001-0001-4000-8000-0000000000${n}`
const UNIT_A = 'c4000001-0001-4000-8000-000000000001'
const LEASE_MINE = 'd5000001-0001-4000-8000-000000000001'
const LEASE_OTHER = 'd5000001-0001-4000-8000-000000000002'
const PAY_MINE = 'e6000001-0001-4000-8000-000000000001'
const PAY_OTHER = 'e6000001-0001-4000-8000-000000000002'
const PAY_CAPE = 'e6000001-0001-4000-8000-000000000003'
const APP_1 = 'f7000001-0001-4000-8000-000000000001'

type UserRow = { id: string; fe: string; role: string; client: string | null; hash: string }

const db = vi.hoisted(() => ({
  users: [] as Array<{ id: string; fe: string; role: string; client: string | null; hash: string }>,
  map: [] as Array<{ entity_type: string; frontend_id: string; backend_id: string }>,
  writes: [] as Array<{ sql: string; params: unknown[] }>,
  sql: [] as string[],
}))

vi.mock('pg', () => {
  const agencyFe = (c: string | null) =>
    c === 'a1000001-0001-4000-8000-000000000001' ? 'ag-horizon' : c === 'a1000001-0001-4000-8000-000000000002' ? 'ag-cape' : null
  const leases: Record<string, Record<string, unknown>> = {
    'd5000001-0001-4000-8000-000000000001': {
      id: 'd5000001-0001-4000-8000-000000000001',
      unit_id: 'c4000001-0001-4000-8000-000000000001',
      client_id: 'a1000001-0001-4000-8000-000000000001',
      tenant_id: 'b9000001-0001-4000-8000-000000000002',
      metadata: { eSign: { envelopeId: 'SF-111' } },
    },
    'd5000001-0001-4000-8000-000000000002': {
      id: 'd5000001-0001-4000-8000-000000000002',
      unit_id: 'c4000001-0001-4000-8000-000000000001',
      client_id: 'a1000001-0001-4000-8000-000000000001',
      tenant_id: 'b9000001-0001-4000-8000-000000000003',
      metadata: { eSign: { envelopeId: 'SF-222' } },
    },
  }
  const payments: Record<string, Record<string, unknown>> = {
    'e6000001-0001-4000-8000-000000000001': {
      id: 'e6000001-0001-4000-8000-000000000001', amount: '1000', status: 'DUE', payment_type: 'RENT',
      party_name: 'Tenant', party_user_id: 'b9000001-0001-4000-8000-000000000002',
      client_id: 'a1000001-0001-4000-8000-000000000001', unit_id: null,
    },
    'e6000001-0001-4000-8000-000000000002': {
      id: 'e6000001-0001-4000-8000-000000000002', amount: '1000', status: 'DUE', payment_type: 'RENT',
      party_name: 'Other', party_user_id: 'b9000001-0001-4000-8000-000000000003',
      client_id: 'a1000001-0001-4000-8000-000000000001', unit_id: null,
    },
    'e6000001-0001-4000-8000-000000000003': {
      id: 'e6000001-0001-4000-8000-000000000003', amount: '1000', status: 'DUE', payment_type: 'RENT',
      party_name: 'Cape tenant', party_user_id: null,
      client_id: 'a1000001-0001-4000-8000-000000000002', unit_id: null,
    },
  }
  const answer = (raw: string, params: unknown[] = []): Record<string, unknown>[] => {
    const sql = raw.replace(/\s+/g, ' ').trim()
    db.sql.push(sql)
    if (/^(INSERT|UPDATE|DELETE)\b/i.test(sql)) {
      if (!/entity_id_map/i.test(sql)) db.writes.push({ sql, params })
      // notifications owned by: NTF-mine → u-tenant (02), NTF-other → u-tenant2 (03)
      if (sql.startsWith('UPDATE notifications SET read_at = NOW() WHERE id = $1::uuid AND user_id = $2::uuid')) {
        const owner: Record<string, string> = {
          'a8000001-0001-4000-8000-000000000001': 'b9000001-0001-4000-8000-000000000002',
          'a8000001-0001-4000-8000-000000000002': 'b9000001-0001-4000-8000-000000000003',
        }
        return owner[String(params[0])] === params[1] ? [{ id: params[0] }] : []
      }
      return []
    }
    if (/^(CREATE|ALTER|BEGIN|COMMIT|ROLLBACK)\b/i.test(sql)) return []
    if (sql.includes('FROM users u LEFT JOIN clients c ON c.id = u.client_id')) {
      const hit = sql.includes('WHERE u.id = $1::uuid')
        ? db.users.find((u) => u.id === params[0])
        : db.users.find((u) => `${u.fe}@example.test` === String(params[0]).toLowerCase())
      if (!hit) return []
      return [{
        id: hit.id, email: `${hit.fe}@example.test`, password_hash: hit.hash, first_name: hit.fe,
        last_name: 'X', phone: null, role: hit.role, active: true, client_id: hit.client,
        metadata: { frontend_id: hit.fe }, agency_fe: agencyFe(hit.client),
      }]
    }
    if (sql === 'SELECT id::text AS id, email FROM users') {
      return db.users.map((u) => ({ id: u.id, email: `${u.fe}@example.test` }))
    }
    if (sql === 'SELECT entity_type, frontend_id, backend_id::text FROM entity_id_map') return db.map
    if (sql.startsWith('SELECT backend_id::text FROM entity_id_map')) {
      const types = params[0] as string[]
      const fes = params[1] as string[]
      const r = db.map.find((m) => types.includes(m.entity_type) && fes.includes(m.frontend_id))
      return r ? [{ backend_id: r.backend_id }] : []
    }
    if (/SELECT client_id FROM users WHERE id = \$1::uuid/.test(sql)) {
      const u = db.users.find((x) => x.id === params[0])
      return u ? [{ client_id: u.client }] : []
    }
    if (/SELECT status FROM clients WHERE id = \$1::uuid/.test(sql)) return [{ status: 'active' }]
    if (sql.includes('FROM leases WHERE id = $1::uuid')) {
      const l = leases[String(params[0])]
      return l ? [l] : []
    }
    if (sql.includes('FROM payments WHERE id = $1::uuid')) {
      const p = payments[String(params[0])]
      return p ? [p] : []
    }
    if (sql.startsWith('SELECT * FROM applications WHERE id = $1::uuid FOR UPDATE')) {
      return [{
        id: params[0], client_id: 'a1000001-0001-4000-8000-000000000001',
        unit_id: 'c4000001-0001-4000-8000-000000000001',
        applicant_id: 'b9000001-0001-4000-8000-000000000002', agent_id: null, status: 'SUBMITTED',
        monthly_income: null, metadata: null,
      }]
    }
    if (sql.includes('FROM "applications" WHERE id = $1::uuid')) {
      return [{ id: params[0], unit_id: 'c4000001-0001-4000-8000-000000000001', client_id: 'a1000001-0001-4000-8000-000000000001', agent_id: null }]
    }
    if (sql.startsWith('SELECT (SELECT COUNT(*)::text')) {
      return [{ leads: '1', payments: '2', documents: '3', notifications: '4', threads: '5', messages: '6', clients: params.length ? '1' : '2', units: '7' }]
    }
    return []
  }
  class Pool {
    async query(sql: string, params?: unknown[]) {
      return { rows: answer(sql, params), rowCount: 1 }
    }
    async connect() {
      return {
        query: async (sql: string, params?: unknown[]) => ({ rows: answer(sql, params), rowCount: 1 }),
        release: () => undefined,
      }
    }
    async end() {}
    on() {
      return this
    }
  }
  return { default: { Pool }, Pool }
})

type App = { request: (path: string, init?: RequestInit) => Response | Promise<Response> }
let app: App
const tokens: Record<string, string> = {}

function u(fe: string, n: string, role: string, client: string | null): UserRow {
  return { id: uid(n), fe, role, client, hash: '' }
}

beforeAll(async () => {
  const { hashPassword } = await import('./auth')
  const hash = await hashPassword('pw-correct')
  db.users = [
    u('u-sa', '01', 'SUPER_ADMIN', null),
    u('u-tenant', '02', 'END_USER', HORIZON),
    u('u-tenant2', '03', 'END_USER', HORIZON),
    u('u-james', '04', 'GROUND_AGENT', HORIZON),
    u('u-admin', '05', 'AGENCY_ADMIN', HORIZON),
    u('u-ll', '06', 'LANDLORD', HORIZON),
    u('u-con', '07', 'CONTRACTOR', HORIZON),
  ].map((x) => ({ ...x, hash }))
  db.map = [
    ...db.users.map((x) => ({ entity_type: 'user', frontend_id: x.fe, backend_id: x.id })),
    { entity_type: 'tenancy', frontend_id: 'TN-mine', backend_id: LEASE_MINE },
    { entity_type: 'tenancy', frontend_id: 'TN-other', backend_id: LEASE_OTHER },
    { entity_type: 'payment', frontend_id: 'PAY-mine', backend_id: PAY_MINE },
    { entity_type: 'payment', frontend_id: 'PAY-other', backend_id: PAY_OTHER },
    { entity_type: 'payment', frontend_id: 'PAY-cape', backend_id: PAY_CAPE },
    { entity_type: 'application', frontend_id: 'APP-1', backend_id: APP_1 },
    { entity_type: 'notification', frontend_id: 'NTF-mine', backend_id: 'a8000001-0001-4000-8000-000000000001' },
    { entity_type: 'notification', frontend_id: 'NTF-other', backend_id: 'a8000001-0001-4000-8000-000000000002' },
  ]
  app = (await import('./index')).default as unknown as App
  let ip = 1
  for (const fe of ['u-sa', 'u-tenant', 'u-james', 'u-admin', 'u-ll', 'u-con']) {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${ip++}` },
      body: JSON.stringify({ email: `${fe}@example.test`, password: 'pw-correct' }),
    })
    expect(res.status).toBe(200)
    tokens[fe] = ((await res.json()) as { token: string }).token
  }
})

beforeEach(async () => {
  const { resetImpersonationLogDedupe } = await import('./requestActor')
  resetImpersonationLogDedupe()
  db.writes = []
  db.sql = []
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('ALLOW_DEMO_ACTOR', '')
  vi.stubEnv('PAYFAST_MERCHANT_ID', '10000100')
  vi.stubEnv('PAYFAST_MERCHANT_KEY', '46f0cd694581a')
  vi.stubEnv('ESIGN_PROVIDER', 'signiflow')
  vi.stubEnv('ESIGN_SIGNIFLOW_API_KEY', 'k')
  vi.stubEnv('ESIGN_SIGNIFLOW_API_URL', 'https://signiflow.test')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const SA_HEADERS = { 'X-User-Id': 'u-sa', 'X-Role': 'super_admin' }
const auth = (fe: string) => ({ Authorization: `Bearer ${tokens[fe]}` })
const post = (path: string, headers: Record<string, string>, body: unknown) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

describe('no session in production gives 401 (forged super_admin headers included)', () => {
  const cases: Array<[string, () => Promise<Response>]> = [
    ['payfast/create', () => post('/api/payfast/create', SA_HEADERS, { paymentId: 'PAY-mine' })],
    ['esign/create-envelope', () => post('/api/esign/create-envelope', SA_HEADERS, { tenancyId: 'TN-mine', tenant: { email: 't@x.test' } })],
    ['esign/status', () => post('/api/esign/status', SA_HEADERS, { tenancyId: 'TN-mine', envelopeId: 'SF-111' })],
    ['counts', () => app.request('/api/counts', { headers: SA_HEADERS })],
    ['notify/dunning-notice', () => post('/api/notify/dunning-notice', SA_HEADERS, { email: 'v@x.test' })],
    ['applications/:id/approve', () => post('/api/applications/APP-1/approve', SA_HEADERS, { actorUserId: 'u-sa' })],
  ]
  for (const [name, call] of cases) {
    it(name, async () => {
      const res = await call()
      expect(res.status).toBe(401)
      expect(db.writes).toEqual([])
    })
  }
})

describe('dunning-notice is staff-only', () => {
  for (const fe of ['u-tenant', 'u-ll', 'u-con']) {
    it(`${fe} gets 403`, async () => {
      const res = await post('/api/notify/dunning-notice', { ...auth(fe), ...SA_HEADERS }, { email: 'v@x.test' })
      expect(res.status).toBe(403)
    })
  }
  it('a ground agent is accepted (202)', async () => {
    const res = await post('/api/notify/dunning-notice', auth('u-james'), { email: 'v@x.test' })
    expect(res.status).toBe(202)
  })
})

describe('payfast/create', () => {
  it("a tenant cannot start checkout for someone else's payment", async () => {
    const res = await post('/api/payfast/create', { ...auth('u-tenant'), ...SA_HEADERS }, { paymentId: 'PAY-other' })
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe('payment_not_yours')
  })
  it('a tenant can start checkout for their own payment', async () => {
    const res = await post('/api/payfast/create', auth('u-tenant'), { paymentId: 'PAY-mine' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; fields: Record<string, string> }
    expect(body.ok).toBe(true)
    expect(body.fields.m_payment_id).toBe('PAY-mine')
    expect(body.fields.notify_url).toMatch(/\/api\/payfast\/itn$/)
  })
  it("staff can start checkout for a payment in their agency, not another agency's", async () => {
    expect((await post('/api/payfast/create', auth('u-james'), { paymentId: 'PAY-other' })).status).toBe(200)
    expect((await post('/api/payfast/create', auth('u-james'), { paymentId: 'PAY-cape' })).status).toBe(403)
  })
  it('a landlord who is not the payer gets 403', async () => {
    expect((await post('/api/payfast/create', auth('u-ll'), { paymentId: 'PAY-mine' })).status).toBe(403)
  })
  it('ITN stays unauthenticated: no session reaches its own verification (400, not 401)', async () => {
    const res = await app.request('/api/payfast/itn', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'm_payment_id=PAY-mine&payment_status=COMPLETE&amount_gross=1000.00&signature=bad',
    })
    expect(res.status).toBe(400)
    expect(db.writes).toEqual([])
  })
})

describe('esign create-envelope / status', () => {
  function stubSigniflow() {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        calls.push(url)
        return Response.json({ DocIDField: 111, ResultField: 'Success', DocStatusField: 'Completed', StatusField: 'Completed' })
      }),
    )
    return calls
  }

  it('a tenant cannot create an envelope for a lease outside their scope', async () => {
    const calls = stubSigniflow()
    const res = await post('/api/esign/create-envelope', { ...auth('u-tenant'), ...SA_HEADERS }, {
      tenancyId: 'TN-other', pdfUrl: 'data:application/pdf;base64,JVBERi0x', tenant: { name: 'X', email: 'x@x.test' },
    })
    expect(res.status).toBe(403)
    expect(calls).toEqual([])
  })

  it('a tenant cannot read the status of a lease outside their scope', async () => {
    const calls = stubSigniflow()
    const res = await post('/api/esign/status', auth('u-tenant'), { tenancyId: 'TN-other', envelopeId: 'SF-222' })
    expect(res.status).toBe(403)
    expect(calls).toEqual([])
  })

  it("a tenant cannot poll another lease's envelope through their own lease", async () => {
    const calls = stubSigniflow()
    const res = await post('/api/esign/status', auth('u-tenant'), { tenancyId: 'TN-mine', envelopeId: 'SF-222' })
    expect(res.status).toBe(403)
    expect(calls).toEqual([])
  })

  it('status requires tenancyId', async () => {
    const res = await post('/api/esign/status', auth('u-tenant'), { envelopeId: 'SF-111' })
    expect(res.status).toBe(400)
  })

  it('unknown lease gives 404', async () => {
    const res = await post('/api/esign/create-envelope', auth('u-admin'), { tenancyId: 'TN-nope', tenant: { email: 'x@x.test' } })
    expect(res.status).toBe(404)
  })

  it('happy path: the tenant polls their own lease envelope', async () => {
    const calls = stubSigniflow()
    const res = await post('/api/esign/status', auth('u-tenant'), { tenancyId: 'TN-mine', envelopeId: 'SF-111' })
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
    expect(calls.length).toBeGreaterThan(0)
  })

  it("happy path: the agency admin creates an envelope for a lease in their agency", async () => {
    const calls = stubSigniflow()
    const res = await post('/api/esign/create-envelope', auth('u-admin'), {
      tenancyId: 'TN-other', pdfUrl: 'data:application/pdf;base64,JVBERi0x', tenant: { name: 'X', email: 'x@x.test' },
    })
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
    expect(calls.length).toBeGreaterThan(0)
  })
})

describe('counts', () => {
  it('super admin gets platform counts', async () => {
    const res = await app.request('/api/counts', { headers: auth('u-sa') })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, string>
    expect(body.scope).toBe('platform')
    expect(body.clients).toBe('2')
  })
  it('agency admin gets counts for their agency only', async () => {
    const res = await app.request('/api/counts', { headers: auth('u-admin') })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, string>
    expect(body.scope).toBe('agency')
    expect(body.agencyId).toBe('ag-horizon')
    const q = db.sql.find((s) => s.startsWith('SELECT (SELECT COUNT(*)::text'))!
    expect(q).toContain('FROM leads WHERE client_id = $1::uuid')
  })
  it('a tenant gets 403', async () => {
    expect((await app.request('/api/counts', { headers: { ...auth('u-tenant'), ...SA_HEADERS } })).status).toBe(403)
  })
})

describe('approve audits the verified actor', () => {
  it('logs the session user even when the body claims another id', async () => {
    const res = await post('/api/applications/APP-1/approve', auth('u-admin'), { actorUserId: 'u-sa' })
    expect(res.status).toBe(200)
    const decided = db.writes.find((w) => w.sql.startsWith("UPDATE applications SET status = 'APPROVED'"))
    expect(decided).toBeDefined()
    expect(decided!.params[1]).toBe(uid('05'))
    expect(decided!.params[1]).not.toBe(uid('01'))
  })
})

describe('payfast/create amount comes from the payment record', () => {
  it('no amount sent: charges the stored amount', async () => {
    const res = await post('/api/payfast/create', auth('u-tenant'), { paymentId: 'PAY-mine' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { fields: Record<string, string> }
    expect(body.fields.amount).toBe('1000.00')
  })
  it('matching amount sent: accepted, stored amount charged', async () => {
    const res = await post('/api/payfast/create', auth('u-tenant'), { paymentId: 'PAY-mine', amountCents: 100000 })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { fields: Record<string, string> }
    expect(body.fields.amount).toBe('1000.00')
  })
  it('tampered amount: refused with 409 amount_mismatch, no checkout fields', async () => {
    const res = await post('/api/payfast/create', auth('u-tenant'), { paymentId: 'PAY-mine', amountCents: 100 })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { ok: boolean; error: string; fields?: unknown }
    expect(body.ok).toBe(false)
    expect(body.error).toBe('amount_mismatch')
    expect(body.fields).toBeUndefined()
  })
  it('non-numeric amount: 400', async () => {
    const res = await post('/api/payfast/create', auth('u-tenant'), { paymentId: 'PAY-mine', amountCents: 'lots' })
    expect(res.status).toBe(400)
  })
})

describe('notifications/mark-read: own notifications only', () => {
  it("marking another user's notification id updates nothing", async () => {
    const res = await post('/api/notifications/mark-read', auth('u-tenant'), { ids: ['NTF-other'] })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { updated: number }).updated).toBe(0)
    const w = db.writes.find((x) => x.sql.startsWith('UPDATE notifications'))!
    expect(w.sql).toContain('AND user_id = $2::uuid')
    expect(w.params[1]).toBe(uid('02'))
  })
  it('marking your own notification works', async () => {
    const res = await post('/api/notifications/mark-read', auth('u-tenant'), { ids: ['NTF-mine'] })
    expect(((await res.json()) as { updated: number }).updated).toBe(1)
  })
  it("naming another user's id gives 403, even for an agency admin", async () => {
    for (const fe of ['u-tenant', 'u-admin']) {
      const res = await post('/api/notifications/mark-read', auth(fe), { userId: 'u-tenant2', all: true })
      expect(res.status).toBe(403)
    }
    expect(db.writes).toEqual([])
  })
  it('mark all only touches the actor (body userId cannot widen it)', async () => {
    const res = await post('/api/notifications/mark-read', auth('u-tenant'), { all: true })
    expect(res.status).toBe(200)
    const w = db.writes.find((x) => x.sql.startsWith('UPDATE notifications'))!
    expect(w.sql).toContain('WHERE user_id = $1::uuid')
    expect(w.params[0]).toBe(uid('02'))
  })
})

describe('impersonation is audited', () => {
  const impersonate = { 'X-User-Id': 'u-tenant', 'X-Role': 'tenant', 'X-Agency-Id': 'ag-horizon' }
  const logs = () => db.writes.filter((w) => w.sql.startsWith('INSERT INTO event_log') && w.sql.includes("'impersonation'"))

  it('a super admin acting as a tenant writes who impersonated whom and the route', async () => {
    const res = await post('/api/notifications/mark-read', { ...auth('u-sa'), ...impersonate }, { ids: ['NTF-mine'] })
    expect(res.status).toBe(200)
    // Acted as the tenant: the tenant's own notification was marked.
    expect(((await res.json()) as { updated: number }).updated).toBe(1)
    const [log] = logs()
    expect(log).toBeDefined()
    const [clientId, subjectId, actorUserId, payloadJson] = log.params as [string, string, string, string]
    expect(actorUserId).toBe(uid('01'))
    expect(subjectId).toBe(uid('02'))
    expect(clientId).toBe(HORIZON)
    expect(JSON.parse(payloadJson)).toEqual({
      impersonatorUserId: 'u-sa',
      impersonatorEmail: 'u-sa@example.test',
      impersonatedUserId: 'u-tenant',
      impersonatedRole: 'tenant',
      impersonatedAgencyId: 'ag-horizon',
      route: 'POST /api/notifications/mark-read',
    })
  })

  it('repeated GET polls log once per minute; writes log every time', async () => {
    await app.request('/api/counts', { headers: { ...auth('u-sa'), ...impersonate } })
    await app.request('/api/counts', { headers: { ...auth('u-sa'), ...impersonate } })
    expect(logs()).toHaveLength(1)
    await post('/api/notifications/mark-read', { ...auth('u-sa'), ...impersonate }, { ids: ['NTF-mine'] })
    await post('/api/notifications/mark-read', { ...auth('u-sa'), ...impersonate }, { ids: ['NTF-mine'] })
    expect(logs()).toHaveLength(3)
  })

  it('no audit row when the super admin is not impersonating, or a non-admin sends headers', async () => {
    await app.request('/api/counts', { headers: auth('u-sa') })
    await app.request('/api/counts', { headers: { ...auth('u-sa'), 'X-User-Id': 'u-sa', 'X-Role': 'super_admin' } })
    await app.request('/api/counts', { headers: { ...auth('u-admin'), ...impersonate } })
    expect(logs()).toHaveLength(0)
  })
})
