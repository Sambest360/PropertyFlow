import { describe, expect, it } from 'vitest'
import { defaultBrowseFilters, type BrowseFilterState } from '../components/BrowseFilters'
import {
  amenityOptionsForMode,
  hasModeFilters,
  matchesModeFilters,
  priceBoundsForMode,
  propertyTypesForMode,
  translateFiltersForMode,
} from './browseFilterModes'

const listing = (over: Partial<{ amenities: string[]; availableFrom: string | null; area: number }> = {}) => ({
  amenities: [],
  availableFrom: null,
  area: 90,
  ...over,
})

const f = (over: Partial<BrowseFilterState> = {}): BrowseFilterState => ({ ...defaultBrowseFilters(), ...over })

describe('browse filters per mode', () => {
  it('rent: furnishing matches any selected, pets match either pet label', () => {
    const furnished = listing({ amenities: ['Furnished', 'Pets negotiable'] })
    expect(matchesModeFilters(furnished, 'rent', f({ furnishing: ['Furnished', 'Semi-furnished'] }))).toBe(true)
    expect(matchesModeFilters(furnished, 'rent', f({ furnishing: ['Unfurnished'] }))).toBe(false)
    expect(matchesModeFilters(furnished, 'rent', f({ petsAllowed: true }))).toBe(true)
    expect(matchesModeFilters(listing(), 'rent', f({ petsAllowed: true }))).toBe(false)
  })

  it('rent: lease terms must all be present', () => {
    const p = listing({ amenities: ['Month-to-month'] })
    expect(matchesModeFilters(p, 'rent', f({ leaseTerms: ['Month-to-month'] }))).toBe(true)
    expect(matchesModeFilters(p, 'rent', f({ leaseTerms: ['Month-to-month', 'Bills included'] }))).toBe(false)
  })

  it('rent: move-in date uses available_from, no date means available now', () => {
    expect(matchesModeFilters(listing({ availableFrom: '2027-02-01' }), 'rent', f({ availableBy: '2027-03-01' }))).toBe(true)
    expect(matchesModeFilters(listing({ availableFrom: '2027-02-01' }), 'rent', f({ availableBy: '2027-01-15' }))).toBe(false)
    expect(matchesModeFilters(listing({ availableFrom: null }), 'rent', f({ availableBy: '2099-01-01' }))).toBe(true)
    expect(matchesModeFilters(listing({ availableFrom: null }), 'rent', f({ availableBy: '2000-01-01' }))).toBe(false)
  })

  it('buy: floor size minimum and sale details', () => {
    const p = listing({ area: 150, amenities: ['Freehold', 'Bondable'] })
    expect(matchesModeFilters(p, 'buy', f({ minFloorSize: '120' }))).toBe(true)
    expect(matchesModeFilters(p, 'buy', f({ minFloorSize: '200' }))).toBe(false)
    expect(matchesModeFilters(p, 'buy', f({ saleDetails: ['Freehold', 'Bondable'] }))).toBe(true)
    expect(matchesModeFilters(p, 'buy', f({ saleDetails: ['Sectional title'] }))).toBe(false)
  })

  it("ignores the other mode's filters", () => {
    const p = listing({ area: 40 })
    expect(matchesModeFilters(p, 'buy', f({ petsAllowed: true, furnishing: ['Furnished'] }))).toBe(true)
    expect(matchesModeFilters(p, 'rent', f({ minFloorSize: '500', saleDetails: ['Freehold'] }))).toBe(true)
    expect(hasModeFilters('buy', f({ petsAllowed: true }))).toBe(false)
    expect(hasModeFilters('rent', f({ petsAllowed: true }))).toBe(true)
  })

  it('switching rent → buy drops the rent budget and rent-only filters, keeps rooms', () => {
    const rent = f({
      minPrice: '5000',
      maxPrice: '8000',
      beds: 2,
      parking: 1,
      types: ['Apartment', 'Student Accommodation'],
      furnishing: ['Furnished'],
      petsAllowed: true,
      availableBy: '2027-01-01',
      leaseTerms: ['Bills included'],
      amenities: ['Pool'],
    })
    const buy = translateFiltersForMode(rent, 'rent', 'buy')
    expect(buy).toMatchObject({
      minPrice: '',
      maxPrice: '',
      beds: 2,
      parking: 1,
      types: ['Apartment'],
      furnishing: [],
      petsAllowed: false,
      availableBy: '',
      leaseTerms: [],
      amenities: ['Pool'],
    })
  })

  it('switching buy → rent drops the purchase price and sale-only filters', () => {
    const buy = f({ maxPrice: '3000000', minFloorSize: '120', saleDetails: ['Freehold'], types: ['Vacant Land', 'House'] })
    expect(translateFiltersForMode(buy, 'buy', 'rent')).toMatchObject({
      maxPrice: '',
      minFloorSize: '',
      saleDetails: [],
      types: ['House'],
    })
    expect(translateFiltersForMode(buy, 'buy', 'buy')).toBe(buy)
  })

  it('offers different choices per mode', () => {
    expect(priceBoundsForMode('buy').max).toBeGreaterThan(priceBoundsForMode('rent').max * 100)
    expect(propertyTypesForMode('rent')).not.toContain('Vacant Land')
    expect(propertyTypesForMode('buy')).not.toContain('Student Accommodation')
    expect(propertyTypesForMode('buy')).not.toContain('Commercial')
    expect(amenityOptionsForMode('rent')).not.toContain('Furnished')
    expect(amenityOptionsForMode('rent')).not.toContain('Pet Friendly')
    expect(amenityOptionsForMode('buy')).toContain('Pet Friendly')
  })
})
