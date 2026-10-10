import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.hoisted(() => vi.fn())
const resolveUuid = vi.hoisted(() => vi.fn())
vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...a: unknown[]) => query(...a),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...a: unknown[]) => query(...a) },
}))
vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: vi.fn(async () => undefined),
  ensureUuid: vi.fn(async (et: string, _fe: string, preferred?: string) =>
    preferred ?? (et === 'building' ? BUILDING : UNIT)),
  resolveUuid: (...a: unknown[]) => resolveUuid(...a),
  forgetId: vi.fn(async () => undefined),
  isUuid: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))

const AGENCY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OTHER_AGENCY = 'b0000000-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AGENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ORPHAN = '5d4d9c75-1111-4111-8111-111111111111'
const UNIT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const BUILDING = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const mapWrites = () =>
  query.mock.calls.filter((c) => /DELETE FROM entity_id_map|INSERT INTO entity_id_map|UPDATE entity_id_map/.test(String(c[0])))
const unitBody = (agentId: string) => ({
  resource: 'unit', action: 'upsert', id: 'unt-nits',
  data: { agencyId: 'ag-x', buildingId: 'bld-x', agentId, title: 'Nits', rent: 1, listingMode: 'draft' },
})

beforeEach(() => {
  vi.resetModules()
  query.mockReset()
  resolveUuid.mockReset()
})

describe('requireAgentId never moves an existing map entry', () => {
  it('fe already mapped to another (orphan) uuid: no delete/insert, warns, still resolves', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    resolveUuid.mockImplementation(async (et: string) =>
      et === 'agency' ? AGENCY : et === 'building' ? BUILDING : et === 'user' ? ORPHAN : null)
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM users WHERE id =')) return []
      if (sql.includes("metadata->>'frontend_id'")) return [{ id: AGENT, client_id: AGENCY }]
      if (sql.includes('SELECT backend_id::text FROM entity_id_map')) return [{ backend_id: ORPHAN }]
      return []
    })
    const { handlePersist } = await import('./writes.js')
    const r = await handlePersist(unitBody('u-agent-x'))
    expect(r.ok).toBe(true)
    expect(mapWrites()).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('agent in another agency: no new mapping is created', async () => {
    resolveUuid.mockImplementation(async (et: string) =>
      et === 'agency' ? AGENCY : et === 'building' ? BUILDING : null)
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("metadata->>'frontend_id'")) return [{ id: AGENT, client_id: OTHER_AGENCY }]
      if (sql.includes('FROM users WHERE id =') && sql.includes('client_id')) return []
      return []
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { handlePersist } = await import('./writes.js')
    await handlePersist(unitBody('u-agent-y')).catch(() => undefined)
    expect(mapWrites()).toEqual([])
  })
})

describe('linkUserFeToUuid never moves an existing map entry', () => {
  it('tenancy email resolve with fe mapped elsewhere: no delete/upsert', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    resolveUuid.mockImplementation(async (et: string) =>
      et === 'agency' ? AGENCY : et === 'property' || et === 'unit' ? UNIT : et === 'user' ? null : null)
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('LOWER(TRIM(email))')) return [{ id: AGENT }]
      if (sql.includes('SELECT backend_id::text FROM entity_id_map')) return [{ backend_id: ORPHAN }]
      return []
    })
    const { handlePersist } = await import('./writes.js')
    await handlePersist({
      resource: 'tenancy', action: 'upsert', id: 'ten-nits',
      data: { agencyId: 'ag-x', propertyId: 'p-x', tenantUserId: 'u-tenant-fe', tenantEmail: 't@x.test' },
    }).catch(() => undefined)
    expect(mapWrites().filter((c) => /DELETE|DO UPDATE/.test(String(c[0])))).toEqual([])
    expect(mapWrites().filter((c) => (c[1] as unknown[])?.[0] === 'u-tenant-fe')).toEqual([])
  })
})

describe('regression: guest apply and staff create still succeed', () => {
  it('staff create: in-agency agent gets a new mapping and the unit persists', async () => {
    resolveUuid.mockImplementation(async (et: string) =>
      et === 'agency' ? AGENCY : et === 'building' ? BUILDING : null)
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("metadata->>'frontend_id'")) return [{ id: AGENT }]
      if (sql.includes('FROM users WHERE id =') && sql.includes('client_id')) return [{ id: AGENT }]
      if (sql.includes('INSERT INTO entity_id_map')) return [{ frontend_id: 'u-new-staff' }]
      return []
    })
    const { handlePersist } = await import('./writes.js')
    const r = await handlePersist(unitBody('u-new-staff'))
    expect(r.ok).toBe(true)
    const ins = mapWrites().find((c) => /INSERT INTO entity_id_map/.test(String(c[0])))
    expect(ins![1]).toEqual(['u-new-staff', AGENT])
    expect(String(ins![0])).not.toMatch(/DO UPDATE/)
    const unitInsert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO units'))
    expect(unitInsert![1][12]).toBe(AGENT)
  })

  it('guest apply / tenancy: unmapped tenant with no client_id gets a mapping again', async () => {
    resolveUuid.mockImplementation(async (et: string) =>
      et === 'agency' ? AGENCY : et === 'property' || et === 'unit' ? UNIT : null)
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('LOWER(TRIM(email))')) return [{ id: AGENT }]
      if (sql.includes('INSERT INTO entity_id_map')) return [{ frontend_id: 'u-guest-fe' }]
      return []
    })
    const { handlePersist } = await import('./writes.js')
    const r = await handlePersist({
      resource: 'tenancy', action: 'upsert', id: 'ten-guest',
      data: { agencyId: 'ag-x', propertyId: 'p-x', tenantUserId: 'u-guest-fe', tenantEmail: 'g@x.test' },
    })
    expect(r.ok).toBe(true)
    const ins = mapWrites().find((c) => /INSERT INTO entity_id_map/.test(String(c[0])))
    expect(ins![1]).toEqual(['u-guest-fe', AGENT])
    expect(String(ins![0])).not.toMatch(/DO UPDATE/)
    expect(mapWrites().filter((c) => /DELETE/.test(String(c[0])))).toEqual([])
  })
})
