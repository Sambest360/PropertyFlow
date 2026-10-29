import { describe, expect, it } from 'vitest'
import { partsFromComponents } from './geocoding'

describe('partsFromComponents', () => {
  it('pulls street, suburb, city and province from Google components', () => {
    const parts = partsFromComponents([
      { long_name: '3a', types: ['street_number'] },
      { long_name: 'Malherbe Crescent', types: ['route'] },
      { long_name: 'Pinelands', types: ['sublocality_level_1', 'sublocality'] },
      { long_name: 'Gqeberha', types: ['locality'] },
      { long_name: 'Eastern Cape', types: ['administrative_area_level_1'] },
    ])
    expect(parts).toEqual({ address: '3a Malherbe Crescent', suburb: 'Pinelands', city: 'Gqeberha', province: 'Eastern Cape' })
  })
})
