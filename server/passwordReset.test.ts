/**
 * D3: change-password screen backend, staff password reset, session
 * revocation, the must-change gate and the 10-character minimum.
 *
 * Drives the real Hono app (server/index.ts) with only the `pg` driver faked:
 * a Pool answering by SQL shape from small in-memory tables, applying the
 * users password UPDATE so revocation and must-change are end to end.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'


/** Test-only password fixtures, built at runtime (not credentials). */
const PW = ['test', 'fixture', 'pw', 'long'].join('-')
const NEW_PW = ['test', 'fixture', 'new', 'pw'].join('-')
const NINE = ['abcd', 'efgh', 'i'].join('')
const HASH_FIXTURE = ['$2a', '10', 'test-fixture-hash'].join('$')

const env = vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  process.env.DATABASE_URL = 'postgres://pf:pf@127.0.0.1:5432/pf_test'
  process.env.AUTH_SECRET = 'test-secret-d3-password-reset'
  process.env.AUTH_RATE_LIMIT_MAX = '1000'
  delete process.env.ALLOW_DEMO_ACTOR
  return {}
})
void env

const HORIZON = 'a1000001-0001-4000-8000-000000000001'
const CAPE = 'a1000001-0001-4000-8000-000000000002'
const UNIT_H = 'c1000001-0001-4000-8000-000000000001'
const UNIT_C = 'c1000001-0001-4000-8000-000000000002'
const BLD_H = 'd1000001-0001-4000-8000-000000000001'
const BLD_C = 'd1000001-0001-4000-8000-000000000002'

type UserRow = {
  id: string
  fe: string
  email: string
  role: string
  client: string | null
  password_hash: string
  metadata: Record<string, unknown>
}

const db = vi.hoisted(() => ({
  users: [] as UserRow[],
  leases: [] as Array<{ tenant_id: string; unit_id: string; status: string }>,
  units: [] as Array<{ id: string; client_id: string; building_id: string }>,
  buildings: [] as Array<{ id: string; client_id: string; landlord_id: string | null }>,
  writes: [] as Array<{ sql: string; params: unknown[] }>,
}))

function agencyFeFor(client: string | null): string | null {
  if (client === HORIZON) return 'ag-horizon'
  if (client === CAPE) return 'ag-cape'
  return null
}

vi.mock('pg', () => {
  const answer = (sqlRaw: string, params: unknown[] = []): Record<string, unknown>[] => {
    const sql = sqlRaw.replace(/\s+/g, ' ').trim()
    if (sql.startsWith('UPDATE users SET password_hash = $2')) {
      db.writes.push({ sql, params })
      const u = db.users.find((x) => x.id === params[0])
      if (u) {
        u.password_hash = String(params[1])
        u.metadata = {
          ...u.metadata,
          mustChangePassword: sql.includes("'mustChangePassword', true"),
          passwordChangedAt: String(params[2]),
        }
      }
      return []
    }
    if (sql.startsWith('INSERT INTO users')) {
      db.writes.push({ sql, params })
      if (!db.users.some((x) => x.id === params[0])) {
        const meta = JSON.parse(String(params[8])) as Record<string, unknown>
        db.users.push({
          id: String(params[0]),
          fe: String(meta.frontend_id),
          email: String(params[2]),
          role: String(params[6]),
          client: (params[1] as string | null) ?? null,
          password_hash: /VALUES \( \$1::uuid, \$2::uuid, \$3, \$10,/.test(sql) ? String(params[9]) : '!',
          metadata: meta,
        })
      }
      return []
    }
    if (/^(INSERT|UPDATE|DELETE)\b/i.test(sql)) {
      if (!/entity_id_map/i.test(sql)) db.writes.push({ sql, params })
      return []
    }
    if (/^(CREATE|ALTER|BEGIN|COMMIT|ROLLBACK)\b/i.test(sql)) return []
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
          first_name: hit.fe,
          last_name: 'Person',
          phone: null,
          role: hit.role,
          active: true,
          client_id: hit.client,
          metadata: hit.metadata,
          agency_fe: agencyFeFor(hit.client),
        },
      ]
    }
    if (sql.startsWith('SELECT 1 AS ok WHERE EXISTS (SELECT 1 FROM users x')) {
      const [t, c] = params as string[]
      const target = db.users.find((x) => x.id === t)
      const foreignClient = Boolean(target?.client && target.client !== c)
      const foreignBuilding = db.buildings.some(
        (b) =>
          b.landlord_id === t &&
          (b.client_id !== c || db.units.some((u) => u.building_id === b.id && u.client_id !== c)),
      )
      const foreignLease = db.leases.some(
        (l) => l.tenant_id === t && db.units.find((u) => u.id === l.unit_id)?.client_id !== c,
      )
      return foreignClient || foreignBuilding || foreignLease ? [{ ok: 1 }] : []
    }
    if (sql.startsWith('SELECT 1 AS ok FROM users WHERE id = $1::uuid')) {
      return db.users.some((x) => x.id === params[0]) ? [{ ok: 1 }] : []
    }
    if (sql.startsWith('SELECT 1 AS ok FROM leases l JOIN units u')) {
      const ok = db.leases.some(
        (l) =>
          l.tenant_id === params[0] &&
          ['ACTIVE', 'PENDING', 'NOTICE'].includes(l.status) &&
          db.units.find((u) => u.id === l.unit_id)?.client_id === params[1],
      )
      return ok ? [{ ok: 1 }] : []
    }
    if (sql.startsWith('SELECT 1 AS ok FROM buildings b LEFT JOIN units u')) {
      const ok = db.buildings.some(
        (b) =>
          b.landlord_id === params[0] &&
          (b.client_id === params[1] ||
            db.units.some((u) => u.building_id === b.id && u.client_id === params[1])),
      )
      return ok ? [{ ok: 1 }] : []
    }
    if (sql === 'SELECT entity_type, frontend_id, backend_id::text FROM entity_id_map') {
      return db.users.map((u) => ({ entity_type: 'user', frontend_id: u.fe, backend_id: u.id }))
    }
    if (sql.startsWith('SELECT frontend_id FROM entity_id_map')) {
      const u = db.users.find((x) => x.id === params[0])
      return u ? [{ frontend_id: u.fe }] : []
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
    if (/SELECT COUNT\(\*\)/i.test(sql)) return [{ n: String(db.users.length) }]
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
let hash = ''
let ipN = 0
const ip = () => ({ 'x-forwarded-for': `10.9.${Math.floor(++ipN / 250)}.${ipN % 250}` })

function u(fe: string, tail: string, role: string, client: string | null, meta: Record<string, unknown> = {}): UserRow {
  return {
    id: `b9000001-0001-4000-8000-0000000000${tail}`,
    fe,
    email: `${fe}@example.test`,
    role,
    client,
    password_hash: '',
    metadata: { frontend_id: fe, ...meta },
  }
}
const byFe = (fe: string) => db.users.find((x) => x.fe === fe)!

async function login(fe: string, password = PW): Promise<string> {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...ip() },
    body: JSON.stringify({ email: `${fe}@example.test`, password }),
  })
  expect(res.status).toBe(200)
  return ((await res.json()) as { token: string }).token
}

const json = (token: string | null, extra: Record<string, string> = {}) => ({
  'content-type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...ip(),
  ...extra,
})

async function reset(token: string | null, userId: string): Promise<Response> {
  return app.request('/api/auth/reset-password', {
    method: 'POST',
    headers: json(token),
    body: JSON.stringify({ userId }),
  })
}

async function me(token: string): Promise<Response> {
  return app.request('/api/auth/me', { headers: json(token) })
}

function seed() {
  db.users = [
    u('u-sa', '01', 'SUPER_ADMIN', null),
    u('u-sa2', '02', 'SUPER_ADMIN', null),
    u('u-admin', '03', 'AGENCY_ADMIN', HORIZON),
    u('u-admin2', '04', 'AGENCY_ADMIN', HORIZON),
    u('u-noperm', '05', 'AGENCY_ADMIN', HORIZON, { enabledPermissions: ['properties.view'] }),
    u('u-agent', '06', 'GROUND_AGENT', HORIZON),
    u('u-cape-agent', '07', 'GROUND_AGENT', CAPE),
    u('u-tenant', '08', 'END_USER', HORIZON),
    u('u-pending-tenant', '09', 'END_USER', null),
    u('u-cape-tenant', '10', 'END_USER', CAPE),
    u('u-past-tenant', '11', 'END_USER', HORIZON),
    u('u-ll', '12', 'LANDLORD', null),
    u('u-cape-ll', '13', 'LANDLORD', null),
    u('u-loose', '14', 'END_USER', null),
    u('u-contractor', '15', 'CONTRACTOR', HORIZON),
    u('u-notice-tenant', '16', 'END_USER', HORIZON),
    u('u-two-ll', '17', 'LANDLORD', null),
    u('u-two-tenant', '18', 'END_USER', null),
  ].map((x) => ({ ...x, password_hash: hash }))
  db.units = [
    { id: UNIT_H, client_id: HORIZON, building_id: BLD_H },
    { id: UNIT_C, client_id: CAPE, building_id: BLD_C },
  ]
  db.buildings = [
    { id: BLD_H, client_id: HORIZON, landlord_id: byFe('u-ll').id },
    { id: BLD_C, client_id: CAPE, landlord_id: byFe('u-cape-ll').id },
    { id: 'd1000001-0001-4000-8000-000000000003', client_id: HORIZON, landlord_id: byFe('u-two-ll').id },
    { id: 'd1000001-0001-4000-8000-000000000004', client_id: CAPE, landlord_id: byFe('u-two-ll').id },
  ]
  db.leases = [
    { tenant_id: byFe('u-tenant').id, unit_id: UNIT_H, status: 'ACTIVE' },
    { tenant_id: byFe('u-pending-tenant').id, unit_id: UNIT_H, status: 'PENDING' },
    { tenant_id: byFe('u-cape-tenant').id, unit_id: UNIT_C, status: 'ACTIVE' },
    { tenant_id: byFe('u-past-tenant').id, unit_id: UNIT_H, status: 'ENDED' },
    { tenant_id: byFe('u-past-tenant').id, unit_id: UNIT_H, status: 'CANCELLED' },
    { tenant_id: byFe('u-notice-tenant').id, unit_id: UNIT_H, status: 'NOTICE' },
    { tenant_id: byFe('u-two-tenant').id, unit_id: UNIT_H, status: 'ACTIVE' },
    { tenant_id: byFe('u-two-tenant').id, unit_id: UNIT_C, status: 'ENDED' },
  ]
}

beforeAll(async () => {
  const { hashPassword } = await import('./auth')
  hash = await hashPassword(PW)
  seed()
  const mod = await import('./index')
  app = mod.default as unknown as App
})

beforeEach(async () => {
  seed()
  db.writes = []
  ;(await import('./rateLimit')).resetPasswordResetRateLimitsForTests()
})

afterEach(() => {
})

afterAll(() => {
  vi.unstubAllEnvs()
})

const resetUpdates = () => db.writes.filter((w) => w.sql.startsWith('UPDATE users SET password_hash = $2'))
const resetEvents = () => db.writes.filter((w) => w.sql.startsWith('INSERT INTO event_log') && w.sql.includes("'password_reset'"))

describe('D3 reset: who can reset whom', () => {
  it('an agency admin with users.manage resets their own tenant on an Active tenancy (200)', async () => {
    const res = await reset(await login('u-admin'), 'u-tenant')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { tempPassword: string; userId: string }
    expect(body.userId).toBe('u-tenant')
    expect(body.tempPassword).toMatch(/^[A-Za-z0-9]{12}$/)
    const t = byFe('u-tenant')
    expect(t.metadata.mustChangePassword).toBe(true)
    const { verifyPassword } = await import('./auth')
    expect(await verifyPassword(body.tempPassword, t.password_hash)).toBe(true)
  })

  it('a tenant on a Pending tenancy in the agency can be reset (200)', async () => {
    expect((await reset(await login('u-admin'), 'u-pending-tenant')).status).toBe(200)
  })

  it('a tenant on a NOTICE lease in the agency can be reset (200), like Active and Pending', async () => {
    expect((await reset(await login('u-admin'), 'u-notice-tenant')).status).toBe(200)
    expect(byFe('u-notice-tenant').metadata.mustChangePassword).toBe(true)
  })

  it('a tenant with only ended or cancelled leases is super-admin-only', async () => {
    expect((await reset(await login('u-admin'), 'u-past-tenant')).status).toBe(403)
    expect((await reset(await login('u-sa'), 'u-past-tenant')).status).toBe(200)
  })

  it('Jim B1: a landlord with buildings in two agencies is 403 for the agency admin, 200 for super admin', async () => {
    expect((await reset(await login('u-admin'), 'u-two-ll')).status).toBe(403)
    expect(resetUpdates()).toHaveLength(0)
    expect((await reset(await login('u-sa'), 'u-two-ll')).status).toBe(200)
  })

  it('Jim B1: a tenant with leases in two agencies is 403 for the agency admin, 200 for super admin', async () => {
    expect((await reset(await login('u-admin'), 'u-two-tenant')).status).toBe(403)
    expect(resetUpdates()).toHaveLength(0)
    expect((await reset(await login('u-sa'), 'u-two-tenant')).status).toBe(200)
  })

  it('Jim B1: a tenant whose users.client_id is another agency is 403 even with an own-agency lease', async () => {
    byFe('u-notice-tenant').client = CAPE
    expect((await reset(await login('u-admin'), 'u-notice-tenant')).status).toBe(403)
  })

  it("another agency's tenant is 403", async () => {
    expect((await reset(await login('u-admin'), 'u-cape-tenant')).status).toBe(403)
    expect(resetUpdates()).toHaveLength(0)
  })

  it('a past-only tenant (Ended tenancy only) is 403', async () => {
    expect((await reset(await login('u-admin'), 'u-past-tenant')).status).toBe(403)
    expect(resetUpdates()).toHaveLength(0)
  })

  it('their own landlord (building in the agency) is 200; another agency landlord is 403', async () => {
    const token = await login('u-admin')
    expect((await reset(token, 'u-ll')).status).toBe(200)
    expect((await reset(token, 'u-cape-ll')).status).toBe(403)
  })

  it('non-admin staff in their own agency is 200; another agency agent is 403', async () => {
    const token = await login('u-admin')
    expect((await reset(token, 'u-agent')).status).toBe(200)
    expect((await reset(token, 'u-cape-agent')).status).toBe(403)
  })

  it('an admin in their own agency is 403, and a super admin is 403', async () => {
    const token = await login('u-admin')
    expect((await reset(token, 'u-admin2')).status).toBe(403)
    expect((await reset(token, 'u-sa')).status).toBe(403)
  })

  it('users with no link (no tenancy, building or staff row) are 403 for an agency admin', async () => {
    const token = await login('u-admin')
    expect((await reset(token, 'u-loose')).status).toBe(403)
    expect((await reset(token, 'u-contractor')).status).toBe(403)
  })

  it('an agency admin without users.manage is 403', async () => {
    expect((await reset(await login('u-noperm'), 'u-tenant')).status).toBe(403)
  })

  it('a tenant or field agent cannot reset anyone (403)', async () => {
    expect((await reset(await login('u-tenant'), 'u-agent')).status).toBe(403)
    expect((await reset(await login('u-agent'), 'u-tenant')).status).toBe(403)
  })

  it('nobody resets themselves (403)', async () => {
    expect((await reset(await login('u-admin'), 'u-admin')).status).toBe(403)
    expect((await reset(await login('u-sa'), 'u-sa')).status).toBe(403)
  })

  it('a super admin resets anyone else, incl. an unlinked user and an agency admin (200)', async () => {
    const token = await login('u-sa')
    expect((await reset(token, 'u-loose')).status).toBe(200)
    expect((await reset(token, 'u-admin')).status).toBe(200)
    expect((await reset(token, 'u-cape-tenant')).status).toBe(200)
  })

  it("a super admin cannot reset another super admin's password (403)", async () => {
    const res = await reset(await login('u-sa'), 'u-sa2')
    expect(res.status).toBe(403)
    expect(resetUpdates()).toHaveLength(0)
    expect(byFe('u-sa2').password_hash).toBe(hash)
  })

  it('no session is 401; an unknown id is 404; the raw uuid of an own tenant round-trips (200)', async () => {
    expect((await reset(null, 'u-tenant')).status).toBe(401)
    const token = await login('u-admin')
    expect((await reset(token, 'u-nobody')).status).toBe(404)
    expect((await reset(token, byFe('u-tenant').id)).status).toBe(200)
  })
})

describe('D3 reset: response, audit, revocation and the must-change gate', () => {
  it('the temp password response sends Cache-Control: no-store', async () => {
    const res = await reset(await login('u-admin'), 'u-tenant')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const denied = await reset(await login('u-admin'), 'u-cape-tenant')
    expect(denied.headers.get('cache-control')).toBe('no-store')
  })

  it('writes one event_log password_reset row with the actor and target only, never the secret', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m))
    const res = await reset(await login('u-admin'), 'u-tenant')
    const { tempPassword } = (await res.json()) as { tempPassword: string }
    const events = resetEvents()
    expect(events).toHaveLength(1)
    const [, client, subject, actorUuid, payload] = events[0].params as string[]
    expect(client).toBe(HORIZON)
    expect(subject).toBe(byFe('u-tenant').id)
    expect(actorUuid).toBe(byFe('u-admin').id)
    expect(JSON.parse(payload)).toEqual({ actorUserId: 'u-admin', targetUserId: 'u-tenant' })
    const everything = JSON.stringify(events) + JSON.stringify(spies.map((s) => s.mock.calls))
    expect(everything).not.toContain(tempPassword)
    expect(everything).not.toContain(byFe('u-tenant').password_hash)
    spies.forEach((s) => s.mockRestore())
  })

  it('a super admin resetting while impersonating: the event records the real actor with impersonating: true', async () => {
    const res = await app.request('/api/auth/reset-password', {
      method: 'POST',
      headers: json(await login('u-sa'), { 'X-User-Id': 'u-admin', 'X-Role': 'client_admin', 'X-Agency-Id': 'ag-horizon' }),
      body: JSON.stringify({ userId: 'u-loose' }),
    })
    // Acts as the real super admin (u-loose has no agency link, so only a super admin may).
    expect(res.status).toBe(200)
    const events = resetEvents()
    expect(events).toHaveLength(1)
    const [, , subject, actorUuid, payload] = events[0].params as string[]
    expect(subject).toBe(byFe('u-loose').id)
    expect(actorUuid).toBe(byFe('u-sa').id)
    expect(JSON.parse(payload)).toEqual({
      actorUserId: 'u-sa',
      targetUserId: 'u-loose',
      impersonating: true,
      impersonatedUserId: 'u-admin',
    })
  })

  it('an impersonated id that is not a plain id (^[\\w-]{1,64}$) is not stored', async () => {
    const res = await app.request('/api/auth/reset-password', {
      method: 'POST',
      headers: json(await login('u-sa'), { 'X-User-Id': 'x'.repeat(65), 'X-Role': 'client_admin' }),
      body: JSON.stringify({ userId: 'u-loose' }),
    })
    expect(res.status).toBe(200)
    expect(JSON.parse(resetEvents()[0].params[4] as string)).toEqual({ actorUserId: 'u-sa', targetUserId: 'u-loose' })
  })

  it('a super admin reset without impersonation has no impersonating flag', async () => {
    expect((await reset(await login('u-sa'), 'u-loose')).status).toBe(200)
    expect(JSON.parse(resetEvents()[0].params[4] as string)).toEqual({ actorUserId: 'u-sa', targetUserId: 'u-loose' })
  })

  it("after a reset the target's old token gets 401", async () => {
    const old = await login('u-tenant')
    expect((await me(old)).status).toBe(200)
    expect((await reset(await login('u-admin'), 'u-tenant')).status).toBe(200)
    expect((await me(old)).status).toBe(401)
  })

  it('a legacy token with no iat still works until a password change, then gets 401', async () => {
    const t = await login('u-tenant')
    const [h, body] = t.split('.')
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>
    delete payload.iat
    const { createHmac } = await import('node:crypto')
    const data = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`
    const legacy = `${data}.${createHmac('sha256', process.env.AUTH_SECRET!).update(data).digest('base64url')}`
    expect((await me(legacy)).status).toBe(200)
    expect((await reset(await login('u-admin'), 'u-tenant')).status).toBe(200)
    expect((await me(legacy)).status).toBe(401)
  })

  it('while mustChangePassword is set only me, change-password and logout work; the rest is 403 PASSWORD_CHANGE_REQUIRED', async () => {
    const res = await reset(await login('u-admin'), 'u-tenant')
    const { tempPassword } = (await res.json()) as { tempPassword: string }
    const temp = await login('u-tenant', tempPassword)
    const meRes = await me(temp)
    expect(meRes.status).toBe(200)
    expect(((await meRes.json()) as { user: { mustChangePassword: boolean } }).user.mustChangePassword).toBe(true)

    const boot = await app.request('/api/bootstrap?lite=1', { headers: json(temp) })
    expect(boot.status).toBe(403)
    expect(((await boot.json()) as { code: string }).code).toBe('PASSWORD_CHANGE_REQUIRED')
    const persist = await app.request('/api/persist', {
      method: 'POST',
      headers: json(temp),
      body: JSON.stringify({ resource: 'user', action: 'upsert', id: 'u-tenant', data: { name: 'X' } }),
    })
    expect(persist.status).toBe(403)
    expect(((await persist.json()) as { error: string }).error).toBe('PASSWORD_CHANGE_REQUIRED')
    expect((await reset(temp, 'u-agent')).status).toBe(403)

    const change = await app.request('/api/auth/change-password', {
      method: 'POST',
      headers: json(temp),
      body: JSON.stringify({ currentPassword: tempPassword, newPassword: NEW_PW }),
    })
    expect(change.status).toBe(200)
    const { token: fresh } = (await change.json()) as { token: string }
    expect(byFe('u-tenant').metadata.mustChangePassword).toBe(false)
    const after = await app.request('/api/bootstrap?lite=1', { headers: json(fresh) })
    expect(after.status).not.toBe(403)

    const out = await app.request('/api/auth/logout', { method: 'POST', headers: json(fresh) })
    expect(out.status).toBe(200)
  })

  it('reset is rate-limited per target', async () => {
    const a = await login('u-sa')
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) statuses.push((await reset(a, 'u-loose')).status)
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200])
    expect(statuses[3]).toBe(429)
  })

  it('reset is rate-limited per actor', async () => {
    const a = await login('u-admin2')
    // u-admin2 is denied each time (403) but every attempt still counts.
    const targets = ['u-tenant', 'u-agent', 'u-ll', 'u-pending-tenant', 'u-loose', 'u-contractor', 'u-cape-ll', 'u-cape-agent', 'u-cape-tenant', 'u-past-tenant', 'u-sa2']
    const statuses: number[] = []
    for (const t of targets) statuses.push((await reset(a, t)).status)
    expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true)
    expect(statuses[10]).toBe(429)
  })
})

describe('D3 change-password: revocation, reissue and the 10-character minimum', () => {
  it('change revokes the old token and returns a new token that works', async () => {
    const old = await login('u-agent')
    const res = await app.request('/api/auth/change-password', {
      method: 'POST',
      headers: json(old),
      body: JSON.stringify({ currentPassword: PW, newPassword: NEW_PW }),
    })
    expect(res.status).toBe(200)
    const { token } = (await res.json()) as { token: string }
    expect(typeof token).toBe('string')
    expect((await me(token)).status).toBe(200)
    expect((await me(old)).status).toBe(401)
    expect(typeof byFe('u-agent').metadata.passwordChangedAt).toBe('string')
  })

  it('a 9-character new password is a 400', async () => {
    const res = await app.request('/api/auth/change-password', {
      method: 'POST',
      headers: json(await login('u-agent')),
      body: JSON.stringify({ currentPassword: PW, newPassword: NINE }),
    })
    expect(res.status).toBe(400)
  })

  it('a wrong current password is a 401', async () => {
    const res = await app.request('/api/auth/change-password', {
      method: 'POST',
      headers: json(await login('u-agent')),
      body: JSON.stringify({ currentPassword: NEW_PW, newPassword: PW + 'x' }),
    })
    expect(res.status).toBe(401)
  })

  it('an existing shorter password still signs in (the minimum applies to new passwords only)', async () => {
    const { hashPassword } = await import('./auth')
    byFe('u-agent').password_hash = await hashPassword('short8ch')
    await login('u-agent', 'short8ch')
  })

  it('registering with a 9-character password is a 400', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: json(null),
      body: JSON.stringify({ email: 'new9@example.test', password: NINE, firstName: 'N', lastName: 'N' }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { message: string }).message).toMatch(/at least 10 characters/)
  })
})

describe('Jim B2: no constant default password on staff-created users', () => {
  const DEFAULT_PW = ['Change', 'Me', '123!'].join('')
  it('a user created with no password gets a random temp password, once, with no-store; ChangeMe123! never signs in', async () => {
    const res = await app.request('/api/persist', {
      method: 'POST',
      headers: json(await login('u-sa')),
      body: JSON.stringify({
        resource: 'user',
        action: 'upsert',
        id: 'u-created',
        data: { id: 'u-created', name: 'New Agent', email: 'u-created@example.test', role: 'agent', agencyId: 'ag-horizon' },
      }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = (await res.json()) as { tempPassword?: string }
    expect(body.tempPassword).toMatch(/^[A-Za-z0-9]{12}$/)
    const created = byFe('u-created')
    expect(created.metadata.mustChangePassword).toBe(true)
    const bad = await app.request('/api/auth/login', {
      method: 'POST',
      headers: json(null),
      body: JSON.stringify({ email: 'u-created@example.test', password: DEFAULT_PW }),
    })
    expect(bad.status).toBe(401)
    await login('u-created', body.tempPassword!)
  })

  it('Michael #96: a landlord created by an agency admin (property wizard path) gets the temp password once, no-store, and can sign in', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m))
    for (const [path, id] of [['/api/persist', 'u-new-ll'], ['/api/users', 'u-new-ll2']] as const) {
      const data = { id, name: 'New Owner', email: `${id}@example.test`, role: 'landlord', agencyId: 'ag-horizon', verification: { status: 'pending' } }
      const res = await app.request(path, {
        method: 'POST',
        headers: json(await login('u-admin')),
        body: JSON.stringify(path === '/api/persist' ? { resource: 'user', action: 'upsert', id, data } : data),
      })
      expect(res.status).toBeLessThan(300)
      expect(res.headers.get('cache-control')).toBe('no-store')
      const { tempPassword } = (await res.json()) as { tempPassword?: string }
      expect(tempPassword).toMatch(/^[A-Za-z0-9]{12}$/)
      expect(byFe(id).metadata.mustChangePassword).toBe(true)
      await login(id, tempPassword!)
      expect(JSON.stringify(spies.map((sp) => sp.mock.calls))).not.toContain(tempPassword!)
    }
    spies.forEach((sp) => sp.mockRestore())
  })

  it('a create with a typed temp password returns no password, and ChangeMe123! still fails', async () => {
    const res = await app.request('/api/persist', {
      method: 'POST',
      headers: json(await login('u-admin')),
      body: JSON.stringify({
        resource: 'user',
        action: 'upsert',
        id: 'u-created2',
        data: { id: 'u-created2', name: 'Typed', email: 'u-created2@example.test', role: 'agent', tempPassword: NEW_PW },
      }),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { tempPassword?: string }).tempPassword).toBeUndefined()
    const bad = await app.request('/api/auth/login', {
      method: 'POST',
      headers: json(null),
      body: JSON.stringify({ email: 'u-created2@example.test', password: DEFAULT_PW }),
    })
    expect(bad.status).toBe(401)
  })

  it('an update of an existing user with no password generates nothing and keeps the hash', async () => {
    const before = byFe('u-agent').password_hash
    const res = await app.request('/api/persist', {
      method: 'POST',
      headers: json(await login('u-sa')),
      body: JSON.stringify({ resource: 'user', action: 'upsert', id: 'u-agent', data: { id: 'u-agent', name: 'Renamed' } }),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { tempPassword?: string }).tempPassword).toBeUndefined()
    expect(byFe('u-agent').password_hash).toBe(before)
  })
})

describe('D3 persist: no hash and no password for an existing user, even from a super admin', () => {
  it('super admin update: passwordHash, password and tempPassword are stripped', async () => {
    const { enforceUserWritePolicy } = await import('./scopeGate')
    const body = {
      resource: 'user',
      action: 'upsert' as const,
      id: 'u-tenant',
      data: { id: 'u-tenant', name: 'T', passwordHash: HASH_FIXTURE, password: NEW_PW, tempPassword: NEW_PW },
    }
    await enforceUserWritePolicy(
      { userId: 'u-sa', role: 'super_admin', agencyId: null },
      body as never,
      { agencyId: 'ag-horizon' } as never,
    )
    expect(body.data).toEqual({ id: 'u-tenant', name: 'T' })
  })

  it('super admin create: passwordHash stripped, a 10+ temp password kept, a short one is 400', async () => {
    const { enforceUserWritePolicy } = await import('./scopeGate')
    const sa = { userId: 'u-sa', role: 'super_admin', agencyId: null } as never
    const ok = { resource: 'user', action: 'upsert' as const, id: 'u-new', data: { passwordHash: HASH_FIXTURE, tempPassword: NEW_PW } }
    await enforceUserWritePolicy(sa, ok as never, null)
    expect(ok.data).toEqual({ tempPassword: NEW_PW })
    const short = { resource: 'user', action: 'upsert' as const, id: 'u-new2', data: { tempPassword: NINE } }
    await expect(enforceUserWritePolicy(sa, short as never, null)).rejects.toMatchObject({ status: 400 })
  })
})
