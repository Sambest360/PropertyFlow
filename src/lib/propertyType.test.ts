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

describe('T2 (spec r4, C7): industrial and farm types', () => {
  it('labels a stored industrial unit Industrial, not Commercial', () => {
    expect(propertyTypeToDb('Industrial')).toBe('industrial')
    expect(resolvePropertyType({ stored: 'industrial', bedrooms: 0 })).toBe('Industrial')
    expect(resolvePropertyType({ stored: 'commercial', bedrooms: 0 })).toBe('Commercial')
  })

  it('round-trips Farm', () => {
    expect(resolvePropertyType({ stored: propertyTypeToDb('Farm'), bedrooms: 0 })).toBe('Farm')
  })

  it('leaves the 0-bed heuristic alone (no stored type → Office)', () => {
    expect(resolvePropertyType({ stored: null, bedrooms: 0 })).toBe('Office')
  })
})

describe('T2: Industrial sits in the Commercial browse section', () => {
  it('isCommercialType matches the Industrial label', async () => {
    const { isCommercialType } = await import('./browseMode')
    expect(isCommercialType(resolvePropertyType({ stored: 'industrial', bedrooms: 0 }))).toBe(true)
    expect(isCommercialType('Farm')).toBe(false)
  })
})
