import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * T2 (spec r4): bootstrap maps units.erf_size_sqm (migration 037) to
 * erfSizeSqm on units and properties, separate from area (square_meters),
 * and loads the same with the column missing (037 not applied yet).
 */
const C21 = 'f2a29694-8440-4dab-93a7-ed1bb917b2c5'
const BLD = '7d1c6a52-6f0e-4b8e-9a51-2f3b0c6d9e11'
const UNIT = '3b9f2e44-1c7a-4d2e-8f60-5a4b3c2d1e0f'
let columnPresent = true
let storedType: string | null = 'industrial'

const unitRow = () => ({
  id: UNIT, building_id: BLD, client_id: C21, unit_number: '1', listing_type: 'sale', price: '2500000',
  status_config_key: 'PUBLISHED', agent_id: null, title: 'Struandale works', amenities: [], images: [],
  featured: false, created_at: new Date('2026-10-26'), updated_at: new Date('2026-10-26'),
  property_type: storedType, square_meters: '250.00', bedrooms: 0,
  ...(columnPresent ? { erf_size_sqm: '600.00' } : {}),
})

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: vi.fn(async (sql: string) => {
    if (/information_schema/.test(sql) && /erf_size_sqm/.test(sql)) return columnPresent ? [{ '?column?': 1 }] : []
    if (/unit_listing_limit_snapshot/.test(sql)) return []
    if (/FROM clients/.test(sql)) {
      return [{ id: C21, company_name: 'century 21', subdomain: 'century-21', status: 'active', city: 'Gqeberha', created_at: new Date('2026-10-15'), settings: {} }]
    }
    if (/FROM buildings/.test(sql)) {
      return [{ id: BLD, client_id: C21, landlord_id: null, name: 'Works', address: '1 Main Rd', city: 'Gqeberha', province: null, suburb: 'Struandale', images: [], created_at: new Date('2026-10-20') }]
    }
    if (/FROM units/.test(sql)) return [unitRow()]
    if (/FROM entity_id_map/.test(sql)) return [{ entity_type: 'agency', frontend_id: 'ag-14gu4m', backend_id: C21 }]
    return []
  }),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}))

afterEach(() => vi.resetModules())

async function boot() {
  const { buildBootstrap } = await import('./bootstrap.js')
  const data = (await buildBootstrap({ lite: false })) as Record<string, unknown>
  return {
    data,
    p: (data.properties as Array<Record<string, unknown>>)[0],
    u: (data.units as Array<Record<string, unknown>>)[0],
  }
}

describe('bootstrap erf size (T2)', () => {
  it('with 037 applied: floor 250 and erf 600 come through separately, Industrial labelled', async () => {
    columnPresent = true
    const { data, p, u } = await boot()
    expect(p.area).toBe(250)
    expect(p.erfSizeSqm).toBe(600)
    expect(u.erfSizeSqm).toBe(600)
    expect(p.type).toBe('Industrial')
    expect(p.beds).toBe(0)
    expect(data.unitErfSizeSupported).toBe(true)
  })

  it('without the column: loads the same, erfSizeSqm null, flag false', async () => {
    columnPresent = false
    const { data, p } = await boot()
    expect(p.area).toBe(250)
    expect(p.erfSizeSqm).toBeNull()
    expect(data.unitErfSizeSupported).toBe(false)
  })

  it('flags a type that is only the legacy bedroom guess (no stored property_type)', async () => {
    columnPresent = true
    storedType = null
    try {
      const { p } = await boot()
      expect(p.type).toBe('Office')
      expect(p.typeInferred).toBe(true)
    } finally {
      storedType = 'industrial'
    }
    const { p } = await boot()
    expect(p.typeInferred).toBeUndefined()
  })
})
