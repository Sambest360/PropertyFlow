import { describe, expect, it } from 'vitest'
import {
  derivePropertyTypeFromBedrooms,
  propertyTypeToDb,
  resolvePropertyType,
} from './propertyType'

describe('propertyType (FW-11 I14)', () => {
  it('persists House even when bedroom count would imply Apartment', () => {
    expect(propertyTypeToDb('House')).toBe('house')
    expect(
      resolvePropertyType({ stored: 'house', bedrooms: 1 }),
    ).toBe('House')
  })

  it('falls back to bedroom heuristic when property_type is missing', () => {
    expect(resolvePropertyType({ stored: null, bedrooms: 1 })).toBe('Apartment')
    expect(resolvePropertyType({ stored: null, bedrooms: 3 })).toBe('House')
    expect(derivePropertyTypeFromBedrooms(0)).toBe('Office')
  })

  it('round-trips common wizard labels', () => {
    for (const label of ['Townhouse', 'Vacant Land', 'Student Accommodation']) {
      const slug = propertyTypeToDb(label)
      expect(slug).toBeTruthy()
      expect(resolvePropertyType({ stored: slug, bedrooms: 0 })).toBe(label)
    }
  })
})
