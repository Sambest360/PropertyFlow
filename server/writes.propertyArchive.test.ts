import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
const ensureUuid = vi.fn()
const resolveUuid = vi.fn()

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

vi.mock('./entityMap.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./entityMap.js')>()
  return {
    ...actual,
    ensureEntityMapTable: vi.fn(async () => undefined),
    ensureUuid: (...args: unknown[]) => ensureUuid(...args),
    resolveUuid: (...args: unknown[]) => resolveUuid(...args),
    forgetId: vi.fn(),
  }
})

const AGENCY_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const UNIT_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const BUILDING_UUID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const STORED_AGENT_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

describe('upsertProperty archive', () => {
  beforeEach(() => {
    query.mockReset()
    resolveUuid.mockReset()
    ensureUuid.mockReset()
    resolveUuid.mockImplementation(async (et: string) => {
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

  it('archive keeps listing_type and stored agent_id when agentId omitted', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT status_config_key, listing_type, agent_id, featured FROM units')) {
        return [
          {
            status_config_key: 'PUBLISHED',
            listing_type: 'rent',
            agent_id: STORED_AGENT_UUID,
          },
        ]
      }
      if (sql.includes('INSERT INTO units')) return []
      if (sql.includes('INSERT INTO buildings') || sql.includes('UPDATE buildings')) return []
      return []
    })

    const { handlePersist } = await import('./writes.js')
    const result = await handlePersist({
      resource: 'property',
      action: 'upsert',
      id: 'unt-archive-test',
      data: {
        agencyId: 'ag-fixture',
        buildingId: 'bld-fixture',
        title: 'Archive me',
        statusKey: 'DELETED',
        deletedAt: new Date().toISOString(),
        rent: 12000,
      },
    })
    expect(result.ok).toBe(true)

    const unitInsert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO units'))
    expect(unitInsert).toBeTruthy()
    const params = unitInsert![1] as unknown[]
    expect(params[9]).toBe('rent')
    expect(params[12]).toBe('DELETED')
    expect(params[13]).toBe(STORED_AGENT_UUID)
    expect(params[18]).toBe(false)
  })

  it('DELETED row without restore is a no-op upsert', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT status_config_key, listing_type, agent_id, featured FROM units')) {
        return [
          {
            status_config_key: 'DELETED',
            listing_type: 'rent',
            agent_id: STORED_AGENT_UUID,
          },
        ]
      }
      if (sql.includes('INSERT INTO units')) return []
      if (sql.includes('INSERT INTO buildings') || sql.includes('UPDATE buildings')) return []
      return []
    })

    const { handlePersist } = await import('./writes.js')
    const result = await handlePersist({
      resource: 'property',
      action: 'upsert',
      id: 'unt-deleted',
      data: {
        agencyId: 'ag-fixture',
        buildingId: 'bld-fixture',
        title: 'Should not change',
        statusKey: 'PUBLISHED',
        rent: 12000,
        agentId: 'u-agent',
      },
    })
    expect(result.ok).toBe(true)
    const unitInsert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO units'))
    expect(unitInsert).toBeUndefined()
  })
})

describe('upsertProperty featured (free toggle, agency staff only)', () => {
  beforeEach(() => {
    query.mockReset()
    resolveUuid.mockReset()
    ensureUuid.mockReset()
    resolveUuid.mockImplementation(async (et: string) => (et === 'agency' ? AGENCY_UUID : et === 'building' ? BUILDING_UUID : null))
    ensureUuid.mockImplementation(async (et: string, _fe: string, preferred?: string) => preferred ?? (et === 'building' ? BUILDING_UUID : UNIT_UUID))
  })
  afterEach(() => vi.resetModules())

  async function saveFeatured(storedFeatured: boolean, sent: boolean, role: string | null) {
    query.mockClear()
    query.mockImplementation(async (sql: string) =>
      sql.includes('SELECT status_config_key, listing_type, agent_id, featured FROM units')
        ? [{ status_config_key: 'PUBLISHED', listing_type: 'rent', agent_id: STORED_AGENT_UUID, featured: storedFeatured }]
        : [],
    )
    const { handlePersist } = await import('./writes.js')
    await handlePersist(
      {
        resource: 'property',
        action: 'upsert',
        id: 'unt-feature',
        data: { agencyId: 'ag-fixture', buildingId: 'bld-fixture', title: 'Flat', statusKey: 'PUBLISHED', rent: 9000, featured: sent },
      },
      'u-1',
      role,
    )
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO units'))!
    return (insert[1] as unknown[])[18]
  }

  it('agency staff can feature and unfeature a listing', async () => {
    expect(await saveFeatured(false, true, 'agent_admin')).toBe(true)
    vi.resetModules()
    expect(await saveFeatured(true, false, 'client_admin')).toBe(false)
    vi.resetModules()
    expect(await saveFeatured(false, true, 'agent')).toBe(true)
  })

  it('a super admin can', async () => {
    expect(await saveFeatured(false, true, 'super_admin')).toBe(true)
    vi.resetModules()
    expect(await saveFeatured(true, false, 'super_admin')).toBe(false)
  })

  it('a landlord or tenant save keeps the stored value', async () => {
    expect(await saveFeatured(false, true, 'landlord')).toBe(false)
    vi.resetModules()
    expect(await saveFeatured(true, false, 'landlord')).toBe(true)
    vi.resetModules()
    expect(await saveFeatured(false, true, 'tenant')).toBe(false)
  })
})
