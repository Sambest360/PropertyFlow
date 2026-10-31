import { describe, expect, it } from 'vitest'
import { searchUnitsFeed } from './unitsApi'
import type { Building, Unit } from '../../data/infrastructure'

/** T4 (spec r4): price sort in 'all' mode sorts on price ?? rent, so asc and desc differ. */
const building: Building = {
  id: 'b1', clientId: 'c1', landlordId: 'u1', name: 'B', addressLine1: '1 Rd', suburb: 'Walmer',
  city: 'Gqeberha', province: 'Eastern Cape', grading: 'A', solarCapacityKw: 0, hasBorehole: false,
  lat: -33.98, lng: 25.58, images: [], createdAt: '2026-01-01',
}
const unit = (id: string, o: Partial<Unit>): Unit => ({
  id, clientId: 'c1', buildingId: 'b1', agentId: null, unitNumber: id, title: id, squareMeters: 80,
  bedrooms: 2, bathrooms: 1, parking: 1, listingType: 'rent', price: null, rent: null, statusKey: 'PUBLISHED',
  description: '', amenities: [], images: [], featured: false, createdAt: '2026-01-01', ...o,
})
// A mixed set: rentals (price null), sales (rent null), one "both", one tie.
const mixed = [
  unit('r-9500', { listingType: 'rent', rent: 9500 }),
  unit('s-2.5m', { listingType: 'sale', price: 2_500_000 }),
  unit('r-15000', { listingType: 'rent', rent: 15000 }),
  unit('s-900k', { listingType: 'sale', price: 900_000 }),
  unit('b-1.2m', { listingType: 'both', price: 1_200_000, rent: 11000 }),
  unit('r-15000b', { listingType: 'rent', rent: 15000 }),
]
const ids = (sort: 'amount_asc' | 'amount_desc') =>
  searchUnitsFeed({ units: mixed, buildings: [building], filters: { sort, limit: 50 } }).data.map((c) => c.id)

describe('T4 price sort over a mixed rent + sale set', () => {
  it('asc and desc are exact reverses', () => {
    const asc = ids('amount_asc')
    expect(asc).toHaveLength(mixed.length)
    expect(ids('amount_desc')).toEqual([...asc].reverse())
  })
  it('sorts on price ?? rent', () => {
    expect(ids('amount_asc')).toEqual(['r-9500', 'r-15000', 'r-15000b', 's-900k', 'b-1.2m', 's-2.5m'])
  })
  it('a listing with neither amount goes last both ways', () => {
    const withNone = [...mixed, unit('none', { listingType: 'rent' })]
    for (const sort of ['amount_asc', 'amount_desc'] as const) {
      const out = searchUnitsFeed({ units: withNone, buildings: [building], filters: { sort, limit: 50 } }).data
      expect(out.at(-1)?.id).toBe('none')
    }
  })
})
