import { describe, expect, it } from 'vitest'
import { browseCardPrice, isCommercialType, matchesBrowseMode } from './browseMode'

const fmt = (n: number) => `R ${n}`
const dual = { type: 'House', listingMode: 'both' as const, price: 1_500_000, rent: 12_000 }

describe('Rent / Buy / Commercial sections', () => {
  it('a sale-or-rent home shows in both Rent and Buy, with that section’s price', () => {
    expect(matchesBrowseMode(dual, 'rent')).toBe(true)
    expect(matchesBrowseMode(dual, 'buy')).toBe(true)
    expect(browseCardPrice(dual, 'rent', fmt)).toBe('R 12000 / month')
    expect(browseCardPrice(dual, 'buy', fmt)).toBe('R 1500000')
    expect(browseCardPrice(dual, 'all', fmt)).toBe('R 12000 / month · R 1500000 to buy')
  })

  it('rent-only and sale-only stay in their own section', () => {
    expect(matchesBrowseMode({ ...dual, listingMode: 'rent', price: null }, 'buy')).toBe(false)
    expect(matchesBrowseMode({ ...dual, listingMode: 'sale', rent: null }, 'rent')).toBe(false)
    expect(browseCardPrice({ listingMode: 'sale', price: 900_000, rent: null }, 'all', fmt)).toBe('R 900000')
  })

  it('commercial is by property type, including agency-added ones, and never in Rent / Buy', () => {
    for (const t of ['Office', 'commercial', 'Retail space', 'Industrial', 'Warehouse']) expect(isCommercialType(t)).toBe(true)
    for (const t of ['House', 'Apartment', 'Townhouse']) expect(isCommercialType(t)).toBe(false)
    const office = { ...dual, type: 'Office' }
    expect(matchesBrowseMode(office, 'commercial')).toBe(true)
    expect(matchesBrowseMode(office, 'rent')).toBe(false)
    expect(matchesBrowseMode(office, 'buy')).toBe(false)
  })
})
