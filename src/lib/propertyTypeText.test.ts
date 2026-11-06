import { describe, expect, it } from 'vitest'
import { propertyTypeFromText, resolvePropertyType } from './propertyType'

describe('resolvePropertyType without a stored type', () => {
  it('takes the type the title names before guessing from bedrooms', () => {
    expect(resolvePropertyType({ bedrooms: 2, title: 'Park Lane Mews Unit 7 — townhouse' })).toBe('Townhouse')
    expect(resolvePropertyType({ bedrooms: 0, title: 'Newton Park Suite 402 — furnished office' })).toBe('Office')
    expect(resolvePropertyType({ bedrooms: 2, title: 'Framesby cottage — Protea Lane' })).toBe('House')
    expect(resolvePropertyType({ bedrooms: 1, title: 'Room to rent near NMU' })).toBe('Shared Accommodation')
  })
  it('falls back to the description, then to bedrooms', () => {
    expect(resolvePropertyType({ bedrooms: 2, title: 'Hillcrest Court 3C', description: 'Sunny flat with a balcony' })).toBe('Apartment')
    expect(resolvePropertyType({ bedrooms: 3, title: 'Unit 9' })).toBe('House')
  })
  it('keeps a stored type', () => {
    expect(resolvePropertyType({ stored: 'apartment', bedrooms: 4, title: 'Big house' })).toBe('Apartment')
  })
  it('names nothing for plain titles', () => {
    expect(propertyTypeFromText('Beachview Towers B14')).toBeNull()
  })
})
