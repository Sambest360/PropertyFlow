import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * T2 (Angela D07): the detail page's Bedrooms stat and summary use
 * listingDetailFacts (Bachelor/Studio for a 0-bed residential type); the
 * helper is tested in listingSizes.test.ts. Source-scan, as in
 * PropertyCreatePage.t2.test.ts, because the page needs the full store.
 */
const src = readFileSync(new URL('./ListingDetail.tsx', import.meta.url), 'utf8')

describe('ListingDetail T2 wiring', () => {
  it('the Bedrooms stat shows listingDetailFacts(p).bedroomsValue, not raw beds', () => {
    expect(src).toContain("{ icon: BedDouble, label: 'Bedrooms', value: listingDetailFacts(p).bedroomsValue }")
    expect(src).not.toMatch(/label: 'Bedrooms', value: p\.beds/)
  })
  it('the summary line comes from listingDetailFacts (floor and erf separate)', () => {
    expect(src).toContain("{listingDetailFacts(p).summary.join(' · ')}")
    expect(src).not.toContain('`${p.area} m²`')
  })
})
