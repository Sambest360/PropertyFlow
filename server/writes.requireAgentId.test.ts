import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
const ensureUuid = vi.fn(async (_et: string, _fe: string, preferred?: string) =>
  preferred && /^[0-9a-f-]{36}$/i.test(preferred)
    ? preferred
    : 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
)
const resolveUuid = vi.fn()
const ensureEntityMapTable = vi.fn(async () => undefined)
const forgetId = vi.fn(async () => undefined)

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

vi.mock('./entityMap.js', () => ({
  upsertEntityMapFrontendId: vi.fn(async (_et: string, _fe: string, backendId: string) => backendId),
  ensureEntityMapTable: (...args: unknown[]) => ensureEntityMapTable(...args),
  ensureUuid: (...args: unknown[]) => ensureUuid(...(args as [string, string, string?])),
  resolveUuid: (...args: unknown[]) => resolveUuid(...args),
  forgetId: (...args: unknown[]) => forgetId(...args),
  upsertEntityMapFrontendId: async (_et: string, _fe: string, uuid: string) => uuid,
  isUuid: (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))

const AGENCY_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AGENT_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ORPHAN_UUID = '5d4d9c75-1111-4111-8111-111111111111'
const UNIT_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const BUILDING_UUID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

describe('requireAgentId orphan-map verify + metadata repair (P0-5 r17)', () => {
  beforeEach(() => {
    query.mockReset()
    ensureUuid.mockClear()
    ensureEntityMapTable.mockClear()
    forgetId.mockClear()
    resolveUuid.mockReset()
    resolveUuid.mockImplementation(async (et: string, fe: string) => {
      if (et === 'agency') return AGENCY_UUID
      if (et === 'building') return BUILDING_UUID
      if (et === 'user') return null
      return null
    })
    ensureUuid.mockImplementation(async (_et: string, _fe: string, preferred?: string) => {
      if (preferred) return preferred
      if (_et === 'building') return BUILDING_UUID
      return UNIT_UUID
    })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('stale map + live metadata → unit OK, existing map entry is not moved (Jim #84 nit)', async () => {
    resolveUuid.mockImplementation(async (et: string, _fe: string) => {
      if (et === 'agency') return AGENCY_UUID
      if (et === 'building') return BUILDING_UUID
      if (et === 'user') return ORPHAN_UUID
      return null
    })
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT backend_id::text FROM entity_id_map')) return [{ backend_id: ORPHAN_UUID }]
      if (sql.includes('FROM users WHERE id =')) {
        expect(params?.[0]).toBe(ORPHAN_UUID)
        return []
      }
      if (sql.includes("metadata->>'frontend_id'")) {
        expect(params?.[0]).toBe('u-95838e33')
        return [{ id: AGENT_UUID }]
      }
      if (sql.includes('INSERT INTO units') || sql.includes('INSERT INTO buildings')) return []
      if (sql.includes('UPDATE buildings')) return []
      return []
    })

    const { handlePersist } = await import('./writes.js')
    const result = await handlePersist({
      resource: 'unit',
      action: 'upsert',
      id: 'unt-fixture-r17',
      data: {
        agencyId: 'ag-fixture',
        buildingId: 'bld-fixture',
        agentId: 'u-95838e33',
        title: 'Claremont fixture R17',
        rent: 18000,
        listingMode: 'draft',
      },
    })

    expect(result.ok).toBe(true)

    const orphanCheck = query.mock.calls.find((c) => String(c[0]).includes('FROM users WHERE id ='))
    expect(orphanCheck).toBeTruthy()

    const metaLookup = query.mock.calls.find((c) =>
      String(c[0]).includes("metadata->>'frontend_id'"),
    )
    expect(metaLookup).toBeTruthy()

    const userMapWrites = query.mock.calls.filter(
      (c) =>
        /DELETE FROM entity_id_map|INSERT INTO entity_id_map/.test(String(c[0])) &&
        String(c[0]).includes("'user'"),
    )
    expect(userMapWrites).toEqual([])

    const unitInsert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO units'))
    expect(unitInsert).toBeTruthy()
    expect(unitInsert![1][13]).toBe(AGENT_UUID)
  })

  it('resolves agent via users.metadata->>frontend_id and upserts entity_id_map', async () => {
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("metadata->>'frontend_id'")) {
        expect(params?.[0]).toBe('u-fa-r16')
        return [{ id: AGENT_UUID }]
      }
      if (sql.includes("INSERT INTO entity_id_map") && sql.includes("'user'")) {
        expect(params?.[0]).toBe('u-fa-r16')
        expect(params?.[1]).toBe(AGENT_UUID)
        return []
      }
      if (sql.includes('INSERT INTO entity_id_map')) return []
      if (sql.includes('INSERT INTO units') || sql.includes('INSERT INTO buildings')) return []
      if (sql.includes('UPDATE buildings')) return []
      return []
    })

    const { handlePersist } = await import('./writes.js')
    const result = await handlePersist({
      resource: 'unit',
      action: 'upsert',
      id: 'unt-fixture-r16',
      data: {
        agencyId: 'ag-fixture',
        buildingId: 'bld-fixture',
        agentId: 'u-fa-r16',
        title: 'Woodstock fixture R16',
        rent: 17500,
        listingMode: 'draft',
      },
    })

    expect(result.ok).toBe(true)

    const metaLookup = query.mock.calls.find((c) =>
      String(c[0]).includes("metadata->>'frontend_id'"),
    )
    expect(metaLookup).toBeTruthy()

    const mapUpsert = query.mock.calls.find(
      (c) => String(c[0]).includes('INSERT INTO entity_id_map') && String(c[0]).includes("'user'"),
    )
    expect(mapUpsert).toBeTruthy()
    expect(mapUpsert![1]).toEqual(['u-fa-r16', AGENT_UUID])

    const unitInsert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO units'))
    expect(unitInsert).toBeTruthy()
    expect(unitInsert![1][13]).toBe(AGENT_UUID)
  })

  it('still fail-closed 400 when agentId missing from map and metadata', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("metadata->>'frontend_id'")) return []
      if (sql.includes('INSERT INTO buildings')) return []
      return []
    })

    const { handlePersist } = await import('./writes.js')
    await expect(
      handlePersist({
        resource: 'unit',
        action: 'upsert',
        id: 'unt-fixture-r16-miss',
        data: {
          agencyId: 'ag-fixture',
          buildingId: 'bld-fixture',
          agentId: 'u-missing-r16',
          title: 'Should not persist',
          rent: 1,
        },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'agent not resolved: u-missing-r16',
    })

    const unitInsert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO units'))
    expect(unitInsert).toBeFalsy()
  })

  it('orphan map + no metadata still 400 (dead agent)', async () => {
    resolveUuid.mockImplementation(async (et: string, _fe: string) => {
      if (et === 'agency') return AGENCY_UUID
      if (et === 'building') return BUILDING_UUID
      if (et === 'user') return ORPHAN_UUID
      return null
    })
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM users WHERE id =')) return []
      if (sql.includes("metadata->>'frontend_id'")) return []
      if (sql.includes('INSERT INTO buildings')) return []
      return []
    })

    const { handlePersist } = await import('./writes.js')
    await expect(
      handlePersist({
        resource: 'unit',
        action: 'upsert',
        id: 'unt-fixture-r17-dead',
        data: {
          agencyId: 'ag-fixture',
          buildingId: 'bld-fixture',
          agentId: 'u-dead-agent',
          title: 'Should not persist',
          rent: 1,
        },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'agent not resolved: u-dead-agent',
    })

    const unitInsert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO units'))
    expect(unitInsert).toBeFalsy()
  })

  it('keeps hierarchy path: live mapped userId wins without metadata query', async () => {
    resolveUuid.mockImplementation(async (et: string, _fe: string) => {
      if (et === 'agency') return AGENCY_UUID
      if (et === 'building') return BUILDING_UUID
      if (et === 'user') return AGENT_UUID
      return null
    })
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM users WHERE id =')) {
        expect(params?.[0]).toBe(AGENT_UUID)
        return [{ id: AGENT_UUID }]
      }
      if (sql.includes('INSERT INTO units') || sql.includes('UPDATE buildings')) return []
      return []
    })

    const { handlePersist } = await import('./writes.js')
    await handlePersist({
      resource: 'property',
      action: 'upsert',
      id: 'fixture-r16-mapped',
      data: {
        agencyId: 'ag-fixture',
        buildingId: 'bld-fixture',
        agentId: 'u-fa-mapped',
        title: 'Mapped agent',
        rent: 1000,
      },
    })

    const metaLookup = query.mock.calls.find((c) =>
      String(c[0]).includes("metadata->>'frontend_id'"),
    )
    expect(metaLookup).toBeFalsy()

    const unitInsert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO units'))
    expect(unitInsert![1][13]).toBe(AGENT_UUID)
  })

  it('allows null/empty agentId (Unassigned) without 400', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO units') || sql.includes('UPDATE buildings')) return []
      return []
    })

    const { handlePersist } = await import('./writes.js')
    const result = await handlePersist({
      resource: 'unit',
      action: 'upsert',
      id: 'unt-fixture-r16-unassigned',
      data: {
        agencyId: 'ag-fixture',
        buildingId: 'bld-fixture',
        agentId: null,
        title: 'Unassigned fixture',
        rent: 5000,
      },
    })
    expect(result.ok).toBe(true)
    const unitInsert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO units'))
    expect(unitInsert![1][13]).toBe(null)
  })
})
