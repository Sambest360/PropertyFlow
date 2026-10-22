import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.hoisted(() => vi.fn())
const resolveUuid = vi.hoisted(() => vi.fn())

vi.mock('./db.js', () => ({
  query: (...a: unknown[]) => query(...a),
}))

vi.mock('./entityMap.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./entityMap.js')>()
  return {
    ...actual,
    resolveUuid: (...a: unknown[]) => resolveUuid(...a),
    ensureEntityMapTable: vi.fn(async () => undefined),
  }
})

const UNIT_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

describe('listingUuid', () => {
  beforeEach(() => {
    vi.resetModules()
    query.mockReset()
    resolveUuid.mockReset()
  })

  it('resolveListingUnitUuid finds unit mapped under alias slug', async () => {
    resolveUuid.mockImplementation(async (et: string, fe: string) => {
      if (et === 'property' && fe === 'foo') return UNIT_UUID
      return null
    })
    const { resolveListingUnitUuid } = await import('./listingUuid.js')
    await expect(resolveListingUnitUuid('unt-foo')).resolves.toBe(UNIT_UUID)
  })

  it('ensureListingUnitUuid reuses existing backend id', async () => {
    resolveUuid.mockImplementation(async () => UNIT_UUID)
    const { ensureListingUnitUuid } = await import('./listingUuid.js')
    await expect(ensureListingUnitUuid('unt-foo')).resolves.toBe(UNIT_UUID)
    expect(query).not.toHaveBeenCalled()
  })

  it('ensureListingUnitUuid registers canonical property + unit map rows', async () => {
    resolveUuid.mockResolvedValue(null)
    query.mockResolvedValue([])
    const { ensureListingUnitUuid } = await import('./listingUuid.js')
    const uuid = await ensureListingUnitUuid('unt-bar')
    // Ignore the bulk seed INSERT that the real ensureEntityMapTable runs inside entityMap.ts;
    // count only single-row FE id registrations.
    const mapInserts = query.mock.calls.filter(
      (c) =>
        String(c[0]).includes('INSERT INTO entity_id_map') &&
        Array.isArray(c[1]) &&
        (c[1] as unknown[]).length === 3,
    )
    expect(mapInserts).toHaveLength(2)
    expect(mapInserts[0][1]).toEqual(['property', 'unt-bar', uuid])
    expect(mapInserts[1][1]).toEqual(['unit', 'unt-bar', uuid])
  })
})

describe('upsertProperty uses single listing uuid', () => {
  beforeEach(() => {
    vi.resetModules()
    query.mockReset()
    resolveUuid.mockReset()
  })

  it('unit then property persist share one units.id', async () => {
    const ensureListing = vi.fn(async () => UNIT_UUID)
    vi.doMock('./listingUuid.js', () => ({
      ensureListingUnitUuid: ensureListing,
      resolveListingUnitUuid: vi.fn(),
    }))
    resolveUuid.mockImplementation(async (et: string) => {
      if (et === 'agency') return 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      if (et === 'building') return 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      if (et === 'user') return 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      return null
    })
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM users WHERE id =')) return [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }]
      if (sql.includes('INSERT INTO units') || sql.includes('UPDATE buildings')) return []
      return []
    })

    const { handlePersist } = await import('./writes.js')
    await handlePersist({
      resource: 'unit',
      action: 'upsert',
      id: 'unt-dedupe-a',
      data: {
        agencyId: 'ag-x',
        buildingId: 'bld-x',
        agentId: 'u-agent',
        title: 'Dup test',
        rent: 1000,
      },
    })
    await handlePersist({
      resource: 'property',
      action: 'upsert',
      id: 'unt-dedupe-a',
      data: {
        agencyId: 'ag-x',
        buildingId: 'bld-x',
        agentId: 'u-agent',
        title: 'Dup test',
        rent: 1000,
        unitId: 'unt-dedupe-a',
      },
    })

    expect(ensureListing).toHaveBeenCalledTimes(2)
    expect(ensureListing.mock.calls[0][0]).toBe('unt-dedupe-a')
    expect(ensureListing.mock.calls[1][0]).toBe('unt-dedupe-a')

    const unitInserts = query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO units'))
    expect(unitInserts.length).toBeGreaterThanOrEqual(1)
    expect(unitInserts.every((c) => (c[1] as unknown[])[0] === UNIT_UUID)).toBe(true)
  })
})
