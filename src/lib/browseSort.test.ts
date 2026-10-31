import { describe, expect, it } from 'vitest'
import { browseSortToApi } from './browseSort'
import { browseSearchUrlKeepingMode } from './placeCatalog'

describe('T4 browse sort → feed sort', () => {
  it("'all' mode sorts on price ?? rent, both directions", () => {
    expect(browseSortToApi('price-asc', 'all')).toBe('amount_asc')
    expect(browseSortToApi('price-desc', 'all')).toBe('amount_desc')
  })
  it('rent and buy modes keep their own column', () => {
    expect(browseSortToApi('price-asc', 'rent')).toBe('rent_asc')
    expect(browseSortToApi('price-desc', 'rent')).toBe('rent_desc')
    expect(browseSortToApi('price-asc', 'buy')).toBe('price_asc')
    expect(browseSortToApi('price-desc', 'buy')).toBe('price_desc')
  })
  it('other sorts unchanged', () => {
    expect(browseSortToApi('newest', 'all')).toBe('newest')
    expect(browseSortToApi('beds-desc', 'rent')).toBe('beds_desc')
    expect(browseSortToApi('featured', 'all')).toBe('newest')
    // Nearest: newest base order, then distance on the client (nearestSort).
    expect(browseSortToApi('nearest', 'rent')).toBe('newest')
  })
})

describe('T4 header search keeps the mode', () => {
  it('?mode=rent survives a search', () => {
    expect(browseSearchUrlKeepingMode('?mode=rent&areas=x', 'walmer')).toBe('/browse?mode=rent&q=walmer')
  })
  it('no mode stays no mode; an empty query keeps the mode', () => {
    expect(browseSearchUrlKeepingMode('', 'walmer')).toBe('/browse?q=walmer')
    expect(browseSearchUrlKeepingMode('?mode=buy', '  ')).toBe('/browse?mode=buy')
  })
})
