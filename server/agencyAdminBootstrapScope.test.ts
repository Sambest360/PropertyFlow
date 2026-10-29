/**
 * P0 (prod a773bd0): an AGENCY_ADMIN signed in and saw "No properties yet".
 *
 * Prod rows: seed clients carry no settings.frontend_id and seed users carry no
 * metadata.frontend_id; their FE ids (ag-horizon / u-amelia) live only in
 * entity_id_map. Bootstrap maps every row through entity_id_map, but the
 * session (/api/auth/me + the request actor) used
 * COALESCE(settings->>'frontend_id', client uuid) and metadata.frontend_id,
 * so the client got agencyId = <client uuid> and scoped every building, unit
 * and property ('ag-horizon') out.
 *
 * Drives the real Hono app; only the `pg` driver is faked, answering with
 * rows shaped like prod Neon.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { canSeeAgency } from '../src/lib/agencyScope'

const TEST_FIXTURE_PW = ['test', 'fixture', 'pw'].join('-')

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  process.env.DATABASE_URL = 'postgres://pf:pf@127.0.0.1:5432/pf_test'
  process.env.AUTH_SECRET = 'test-secret-agency-admin-bootstrap'
  delete process.env.ALLOW_DEMO_ACTOR
})

const HORIZON = 'a1000001-0001-4000-8000-000000000001'
const CAPE = 'a1000001-0001-4000-8000-000000000002'

const db = vi.hoisted(() => ({
  users: [] as Array<{
    id: string
    email: string
    role: string
    client: string | null
    password_hash: string
    metadata: Record<string, unknown>
  }>,
  /** entity_id_map rows (the only place seed FE ids live on prod). */
  idMap: [] as Array<{ entity_type: string; frontend_id: string; backend_id: string }>,
}))

const B = (n: string) => `b3000001-0001-4000-8000-0000000000${n}`
const U = (n: string) => `b4000001-0001-4000-8000-0000000000${n}`

const BUILDINGS = [
  { id: B('01'), client_id: HORIZON, name: 'Horizon One' },
  { id: B('02'), client_id: HORIZON, name: 'Horizon Two' },
  { id: B('03'), client_id: CAPE, name: 'Cape One' },
]
const UNITS = [
  { id: U('01'), building_id: B('01'), client_id: HORIZON, unit_number: '1' },
  { id: U('02'), building_id: B('01'), client_id: HORIZON, unit_number: '2' },
  { id: U('03'), building_id: B('02'), client_id: HORIZON, unit_number: '3' },
  { id: U('04'), building_id: B('03'), client_id: CAPE, unit_number: '4' },
]

vi.mock('pg', () => {
  const buildingRow = (b: { id: string; client_id: string; name: string }) => ({
    ...b,
    landlord_id: null,
    address: '1 Main Rd',
    city: 'Gqeberha',
    province: null,
    suburb: 'Central',
    grading: null,
    solar_capacity_kw: null,
    has_borehole: false,
    lat: null,
    lng: null,
    place_id: null,
    formatted_address: null,
    geocoded_at: null,
    images: [],
    created_at: new Date('2026-01-01'),
  })
  const unitRow = (u: { id: string; building_id: string; client_id: string; unit_number: string }) => ({
    ...u,
    square_meters: '50',
    bedrooms: 1,
    bathrooms: '1',
    parking: 1,
    listing_type: 'RENT',
    price: null,
    rent: '9000',
    status_config_key: 'VACANT',
    agent_id: null,
    title: `Unit ${u.unit_number}`,
    description: null,
    amenities: [],
    images: [],
    featured: false,
    deposit_amount: null,
    lat: null,
    lng: null,
    place_id: null,
    formatted_address: null,
    geocoded_at: null,
    created_at: new Date('2026-01-02'),
    updated_at: new Date('2026-01-02'),
  })
  const answer = (sqlRaw: string, params: unknown[] = []): Record<string, unknown>[] => {
    const sql = sqlRaw.replace(/\s+/g, ' ').trim()
    if (/^(INSERT|UPDATE|DELETE|CREATE|ALTER|BEGIN|COMMIT|ROLLBACK)\b/i.test(sql)) return []
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
          first_name: 'Test',
          last_name: 'Person',
          phone: null,
          role: hit.role,
          active: true,
          client_id: hit.client,
          metadata: hit.metadata,
          // Prod: clients.settings has no frontend_id → COALESCE gives the uuid.
          agency_fe: hit.client,
        },
      ]
    }
    if (sql.startsWith('SELECT id, client_id, email, first_name, last_name, phone, role, active, metadata FROM users')) {
      return db.users.map((u) => ({
        id: u.id,
        client_id: u.client,
        email: u.email,
        first_name: 'Test',
        last_name: 'Person',
        phone: null,
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
    if (sql === 'SELECT entity_type, frontend_id, backend_id::text FROM entity_id_map') return db.idMap
    if (sql.startsWith("SELECT frontend_id FROM entity_id_map WHERE entity_type = 'user'")) {
      const hit = db.idMap.find((r) => r.entity_type === 'user' && r.backend_id === params[0])
      return hit ? [{ frontend_id: hit.frontend_id }] : []
    }
    if (sql.startsWith('SELECT backend_id::text FROM entity_id_map')) {
      const types = params[0] as string[]
      const fes = params[1] as string[]
      const hit = db.idMap.find((r) => types.includes(r.entity_type) && fes.includes(r.frontend_id))
      return hit ? [{ backend_id: hit.backend_id }] : []
    }
    if (sql.startsWith('SELECT * FROM buildings')) return BUILDINGS.map(buildingRow)
    if (sql.startsWith('SELECT * FROM units')) return UNITS.map(unitRow)
    if (/SELECT client_id FROM users WHERE id = \$1::uuid/.test(sql)) {
      const u = db.users.find((x) => x.id === params[0])
      return u ? [{ client_id: u.client }] : []
    }
    if (/SELECT status FROM clients WHERE id = \$1::uuid/.test(sql)) return [{ status: 'active' }]
    if (/SELECT COUNT\(\*\)/i.test(sql)) return [{ n: String(db.users.length) }]
    if (sql === 'SELECT 1 AS ok') return [{ ok: 1 }]
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

const ADMIN_UUID = 'b2000001-0001-4000-8000-000000000002'
const CAPE_AGENT_UUID = 'b2000001-0001-4000-8000-000000000003'
/** Seed Amelia's real row (entity_id_map u-amelia) — her email is not the seed one. */
const SEED_AMELIA_UUID = 'a2000001-0001-4000-8000-000000000002'
/** A later registration that holds the seed email amelia@horizonrealty.co.za. */
const SQUATTER_UUID = 'b2000001-0001-4000-8000-000000000009'
const SQUATTER_META_UUID = 'b2000001-0001-4000-8000-000000000010'

async function login(email: string): Promise<string> {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.0.${email.length}` },
    body: JSON.stringify({ email, password: TEST_FIXTURE_PW }),
  })
  expect(res.status).toBe(200)
  return ((await res.json()) as { token: string }).token
}

async function me(token: string) {
  const res = await app.request('/api/auth/me', { headers: { authorization: `Bearer ${token}` } })
  expect(res.status).toBe(200)
  return ((await res.json()) as { user: { id: string; role: string; agencyId: string | null } }).user
}

type Boot = {
  buildings: Array<{ id: string; clientId: string }>
  units: Array<{ id: string; clientId: string }>
  properties: Array<{ id: string; agencyId: string }>
}

async function bootstrap(token: string): Promise<Boot> {
  const res = await app.request('/api/bootstrap?lite=0', { headers: { authorization: `Bearer ${token}` } })
  expect(res.status).toBe(200)
  return (await res.json()) as Boot
}

beforeAll(async () => {
  const { hashPassword } = await import('./auth')
  const hash = await hashPassword(TEST_FIXTURE_PW)
  db.users = [
    // Shaped like prod: no metadata.frontend_id, no clients.settings.frontend_id.
    { id: ADMIN_UUID, email: 'admin@horizon.example.test', role: 'AGENCY_ADMIN', client: HORIZON, password_hash: hash, metadata: {} },
    { id: CAPE_AGENT_UUID, email: 'agent@cape.example.test', role: 'AGENT_ADMIN', client: CAPE, password_hash: hash, metadata: {} },
    { id: SEED_AMELIA_UUID, email: 'amelia.real@horizon.example.test', role: 'AGENCY_ADMIN', client: HORIZON, password_hash: hash, metadata: {} },
    { id: SQUATTER_UUID, email: 'amelia@horizonrealty.co.za', role: 'END_USER', client: null, password_hash: hash, metadata: {} },
    // Claims the seed id in metadata too: must not round-trip either.
    { id: SQUATTER_META_UUID, email: 'squatter2@example.test', role: 'END_USER', client: null, password_hash: hash, metadata: { frontend_id: 'u-amelia' } },
  ]
  db.idMap = [
    { entity_type: 'agency', frontend_id: 'ag-horizon', backend_id: HORIZON },
    { entity_type: 'agency', frontend_id: 'ag-cape', backend_id: CAPE },
    { entity_type: 'user', frontend_id: 'u-hz-admin', backend_id: ADMIN_UUID },
    { entity_type: 'user', frontend_id: 'u-cape-admin', backend_id: CAPE_AGENT_UUID },
    { entity_type: 'user', frontend_id: 'u-amelia', backend_id: SEED_AMELIA_UUID },
  ]
  const mod = await import('./index')
  app = mod.default as unknown as App
})

describe('agency admin session + bootstrap share one id space (prod P0)', () => {
  it('session ids are the entity_id_map FE ids bootstrap uses', async () => {
    const user = await me(await login('admin@horizon.example.test'))
    expect(user.role).toBe('client_admin')
    expect(user.agencyId).toBe('ag-horizon')
    expect(user.id).toBe('u-hz-admin')
  })

  it("agency admin gets and can see their own agency's buildings, units and properties only", async () => {
    const token = await login('admin@horizon.example.test')
    const user = await me(token)
    const boot = await bootstrap(token)
    // Client scope (useAgencyScope / Properties) compares against the session agencyId.
    const visible = <T,>(rows: T[], agencyOf: (r: T) => string) =>
      rows.filter((r) => canSeeAgency(user.role as never, user.agencyId, false, agencyOf(r)))
    const buildings = visible(boot.buildings, (b) => b.clientId)
    const units = visible(boot.units, (u) => u.clientId)
    const props = visible(boot.properties, (p) => p.agencyId)
    expect(buildings).toHaveLength(2)
    expect(units).toHaveLength(3)
    expect(props).toHaveLength(3)
    // Nothing from another agency in the payload at all.
    expect(boot.buildings.every((b) => b.clientId === 'ag-horizon')).toBe(true)
    expect(boot.units.every((u) => u.clientId === 'ag-horizon')).toBe(true)
    expect(boot.properties.every((p) => p.agencyId === 'ag-horizon')).toBe(true)
  })

  it("another agency's admin sees only their own agency", async () => {
    const token = await login('agent@cape.example.test')
    const user = await me(token)
    expect(user.agencyId).toBe('ag-cape')
    const boot = await bootstrap(token)
    expect(boot.buildings.map((b) => b.clientId)).toEqual(['ag-cape'])
    expect(boot.units.map((u) => u.clientId)).toEqual(['ag-cape'])
    expect(boot.properties.every((p) => p.agencyId === 'ag-cape')).toBe(true)
  })

  it('a seed email held by a different row never gets the seed front-end id', async () => {
    const squatter = await me(await login('amelia@horizonrealty.co.za'))
    expect(squatter.id).not.toBe('u-amelia')
    expect(squatter.id).toBe(SQUATTER_UUID)
    const metaClaim = await me(await login('squatter2@example.test'))
    expect(metaClaim.id).toBe(SQUATTER_META_UUID)
    // The real seed user (entity_id_map round-trips to her row) still does.
    const real = await me(await login('amelia.real@horizon.example.test'))
    expect(real.id).toBe('u-amelia')
    expect(real.agencyId).toBe('ag-horizon')
  })
})
