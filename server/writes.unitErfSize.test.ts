import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * T2 (spec r4): units.erf_size_sqm (migration 037) is written next to, never
 * instead of, units.square_meters, and the save works with or without the
 * column (migration not applied yet).
 */

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

let columnPresent = true
const sqls = () => query.mock.calls.map((c) => String(c[0]))
const erfUpdates = () => query.mock.calls.filter((c) => String(c[0]).includes('UPDATE units SET erf_size_sqm'))
const insertParams = () => {
  const call = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO units'))
  expect(call).toBeTruthy()
  return call![1] as unknown[]
}

async function persist(data: Record<string, unknown>) {
  const { handlePersist } = await import('./writes.js')
  return handlePersist(
    {
      resource: 'property',
      action: 'upsert',
      id: 'unt-erf',
      data: { agencyId: 'ag-fixture', buildingId: 'bld-fixture', title: 'Unit 1', rent: 9000, type: 'House', ...data },
    },
    'usr-actor',
    'agent_admin',
  )
}

describe('T2 upsertProperty erf size', () => {
  beforeEach(async () => {
    columnPresent = true
    query.mockReset()
    resolveUuid.mockReset()
    ensureUuid.mockReset()
    resolveUuid.mockImplementation(async (et: string) => {
      if (et === 'agency') return AGENCY_UUID
      if (et === 'building') return BUILDING_UUID
      if (et === 'property' || et === 'unit') return UNIT_UUID
      return null
    })
    ensureUuid.mockImplementation(async (et: string, _fe: string, preferred?: string) => {
      if (preferred) return preferred
      if (et === 'building') return BUILDING_UUID
      return UNIT_UUID
    })
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('information_schema') && sql.includes('erf_size_sqm')) return columnPresent ? [{ '?column?': 1 }] : []
      if (sql.includes('SELECT status_config_key, listing_type, agent_id')) {
        return [{ status_config_key: 'PUBLISHED', listing_type: 'RENT', agent_id: null, featured: false }]
      }
      return []
    })
    const { resetUnitErfSizeCache } = await import('./unitErfSize.js')
    resetUnitErfSizeCache()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('floor 250 goes to square_meters and erf 600 to erf_size_sqm, separately', async () => {
    const res = await persist({ area: 250, erfSizeSqm: 600 })
    expect(res.ok).toBe(true)
    expect(insertParams()[5]).toBe(250)
    expect(erfUpdates()).toHaveLength(1)
    // same row as the unit upsert
    expect(erfUpdates()[0][1]).toEqual([insertParams()[0], 600])
    // the erf update runs after the unit row exists
    const s = sqls()
    expect(s.findIndex((x) => x.includes('UPDATE units SET erf_size_sqm'))).toBeGreaterThan(
      s.findIndex((x) => x.includes('INSERT INTO units')),
    )
  })

  it('persists Industrial as its own type', async () => {
    await persist({ type: 'Industrial', area: 1200, beds: 0 })
    expect(insertParams()[4]).toBe('industrial')
    expect(insertParams()[6]).toBe(0)
  })

  it('a residential apartment with 0 beds saves with 0 beds', async () => {
    const res = await persist({ type: 'Apartment', beds: 0, area: 32 })
    expect(res.ok).toBe(true)
    expect(insertParams()[4]).toBe('apartment')
    expect(insertParams()[6]).toBe(0)
  })

  it('without the column the save still succeeds and skips only the erf write', async () => {
    columnPresent = false
    const res = await persist({ area: 250, erfSizeSqm: 600 })
    expect(res.ok).toBe(true)
    expect(insertParams()[5]).toBe(250)
    expect(erfUpdates()).toHaveLength(0)
  })

  it('a save without erfSizeSqm does not check or touch the column', async () => {
    await persist({ area: 250 })
    expect(erfUpdates()).toHaveLength(0)
    expect(sqls().some((x) => x.includes('erf_size_sqm'))).toBe(false)
  })

  it('a negative erf size is a 400 before anything is written', async () => {
    await expect(persist({ area: 250, erfSizeSqm: -3 })).rejects.toMatchObject({ status: 400, code: 'UNIT_ERF_SIZE_INVALID' })
    expect(sqls().some((x) => /INSERT INTO (units|buildings)|UPDATE (units|buildings)/.test(x))).toBe(false)
  })

  it('C-2: a floor size over NUMERIC(10,2) is a 400 before anything is written (not a 500 on insert)', async () => {
    await expect(persist({ area: 1e8 })).rejects.toMatchObject({ status: 400, code: 'UNIT_FLOOR_SIZE_INVALID' })
    expect(sqls().some((x) => /INSERT INTO (units|buildings)|UPDATE (units|buildings)/.test(x))).toBe(false)
    query.mockClear()
    await expect(persist({ squareMeters: '100000000' })).rejects.toMatchObject({ status: 400, code: 'UNIT_FLOOR_SIZE_INVALID' })
    expect(sqls().some((x) => /INSERT INTO (units|buildings)|UPDATE (units|buildings)/.test(x))).toBe(false)
  })

  it('C-2: the largest floor size the column holds still saves', async () => {
    const res = await persist({ area: 99_999_999.99 })
    expect(res.ok).toBe(true)
    expect(insertParams()[5]).toBe(99_999_999.99)
  })
})
