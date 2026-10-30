import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { listingDetailFacts } from '../../lib/listingSizes'

/**
 * T2 (Angela D07): the detail page's summary line uses listingDetailFacts
 * (Bachelor/Studio for a 0-bed residential type; floor and erf separate); the
 * helper is also tested in listingSizes.test.ts. Source-scan, as in
 * PropertyCreatePage.t2.test.ts, because the page needs the full store.
 */
const src = readFileSync(new URL('./ListingDetail.tsx', import.meta.url), 'utf8')

describe('ListingDetail T2 wiring', () => {
  it('the summary line (listingDetailFacts) carries Bachelor/Studio for 0 beds, never "0 bedrooms"', () => {
    // Since 95f1ea7 the page has no Bedrooms stat tile; the bedroom fact lives in
    // the summary line, and RoomsAndFeatures hides its bed tile when beds is 0.
    expect(src).toContain("{listingDetailFacts(p).summary.join(' · ')}")
    expect(src).not.toMatch(/`\$\{p\.beds\} bedrooms`/)
    const studio = listingDetailFacts({ type: 'Apartment', beds: 0, baths: 1, parking: 1, area: 32, erfSizeSqm: null, rooms: [] })
    expect(studio.summary).toEqual(['Bachelor/Studio', '1 bathrooms', '1 parking', '32 m² floor', '0 configured rooms'])
    expect(studio.summary.join(' · ')).not.toMatch(/\b0 bed/)
    const house = listingDetailFacts({ type: 'House', beds: 3, baths: 2, parking: 2, area: 180, erfSizeSqm: 450, rooms: [] })
    expect(house.summary).toEqual(['3 bedrooms', '2 bathrooms', '2 parking', '180 m² floor', 'Erf 450 m²', '0 configured rooms'])
  })
  it('the summary line comes from listingDetailFacts (floor and erf separate)', () => {
    expect(src).toContain("{listingDetailFacts(p).summary.join(' · ')}")
    expect(src).not.toContain('`${p.area} m²`')
  })
})
