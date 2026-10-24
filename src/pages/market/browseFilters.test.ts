import { describe, expect, it } from 'vitest'
import type { PropertyAsset } from '../../types/domain'
import { parseAreasParam, propertyMatchesAreas } from '../../lib/placeCatalog'
import { matchesBrowseMode } from '../../lib/browseMode'

/**
 * P1-3 regression: the rent/buy mode + property-type filters must not return
 * wrong property types (GO #5 apartment-filter bug). The matcher under test
 * mirrors BrowsePage.matchesFilters' type/mode logic.
 */

function listing(overrides: Partial<PropertyAsset> = {}): PropertyAsset {
  return {
    id: 'PR-x',
    agencyId: 'ag-1',
    landlordId: 'll-1',
    agentId: null,
    title: 'Listing',
    type: 'Apartment',
    status: 'Published',
    listingMode: 'rent',
    price: null,
    rent: 12000,
    beds: 2,
    baths: 1,
    parking: 1,
    area: 80,
    city: 'Cape Town',
    suburb: 'City Bowl',
    address: '1 Test',
    lat: -33.93,
    lng: 18.42,
    images: [],
    rooms: [],
    amenities: [],
    description: '',
    featured: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

function typeAndModeMatch(
  p: PropertyAsset,
  q: string,
  mode: string,
  types: string[],
): boolean {
  const matchQ =
    !q ||
    p.title.toLowerCase().includes(q.toLowerCase()) ||
    p.type.toLowerCase().includes(q.toLowerCase()) ||
    p.city.toLowerCase().includes(q.toLowerCase()) ||
    p.suburb.toLowerCase().includes(q.toLowerCase())
  if (!matchQ) return false
  if (!matchesBrowseMode(p, mode)) return false
  if (types.length && !types.includes(p.type)) return false
  return true
}

/** Mirrors BrowsePage.cardMatchesBrowseMode property resolution (FW-20 P10b). */
function browseCardProperty(
  card: { property_id?: string; id: string },
  publicProperties: PropertyAsset[],
  storeProperties: PropertyAsset[],
): PropertyAsset | undefined {
  return (
    publicProperties.find((p) => p.id === card.property_id || p.unitId === card.id) ??
    storeProperties.find((p) => p.id === card.property_id)
  )
}

describe('browse signed-in property resolution (FW-20 P10b)', () => {
  it('prefers publicly listed store rows over scoped portal drafts for cards', () => {
    const pub = listing({ id: 'PR-1655', listingMode: 'rent', rent: 12000 })
    const portalDraft = listing({
      id: 'PR-1655',
      status: 'Draft',
      listingMode: 'rent',
      rent: null,
    })
    const card = { property_id: 'PR-1655', id: 'unt-PR-1655' }
    const resolved = browseCardProperty(card, [pub], [portalDraft])
    expect(resolved?.status).toBe('Published')
    expect(resolved?.rent).toBe(12000)
  })
})

describe('browse type/mode filters (P1-3)', () => {
  it('rent mode excludes sale-only homes and houses excluded by type filter', () => {
    const apt = listing({ type: 'Apartment', listingMode: 'rent', rent: 12000 })
    const saleHouse = listing({ type: 'House', listingMode: 'sale', price: 2_500_000 })
    const rentBoth = listing({ type: 'House', listingMode: 'both', rent: 18000, price: 3_000_000 })

    expect(typeAndModeMatch(apt, '', 'rent', [])).toBe(true)
    expect(typeAndModeMatch(saleHouse, '', 'rent', [])).toBe(false)
    // Apartment filter must not return a House even one that is also to-let:
    expect(typeAndModeMatch(rentBoth, '', 'rent', ['Apartment'])).toBe(false)
    expect(typeAndModeMatch(apt, '', 'rent', ['Apartment'])).toBe(true)
  })

  it('buy mode requires a price and honours the type filter', () => {
    const rentOnly = listing({ listingMode: 'rent', rent: 9000 })
    const saleTown = listing({ type: 'Townhouse', listingMode: 'sale', price: 1_800_000 })

    expect(typeAndModeMatch(rentOnly, '', 'buy', [])).toBe(false)
    expect(typeAndModeMatch(saleTown, '', 'buy', ['Townhouse'])).toBe(true)
    expect(typeAndModeMatch(saleTown, '', 'buy', ['Apartment'])).toBe(false)
  })

  it('commercial mode only returns commercial / office types', () => {
    const office = listing({ type: 'Office', listingMode: 'rent', rent: 30000 })
    const apt = listing()
    expect(typeAndModeMatch(office, '', 'commercial', [])).toBe(true)
    expect(typeAndModeMatch(apt, '', 'commercial', [])).toBe(false)
  })

  it('Buy, Rent and Commercial never overlap', () => {
    const office = listing({ type: 'Office', listingMode: 'both', rent: 4000, price: 900_000 })
    const both = listing({ type: 'House', listingMode: 'both', rent: 18000, price: 3_000_000 })
    // An office is Commercial only — not in Buy or Rent.
    expect(['buy', 'rent', 'commercial'].filter((m) => typeAndModeMatch(office, '', m, []))).toEqual(['commercial'])
    // A sale-or-rent home with both prices shows in Buy and Rent, not Commercial.
    expect(['buy', 'rent', 'commercial'].filter((m) => typeAndModeMatch(both, '', m, []))).toEqual(['buy', 'rent'])
  })
})

describe('browse areas= filter (G04)', () => {
  it('parses areas param into place chips', () => {
    const places = parseAreasParam('Walmer')
    expect(places.length).toBeGreaterThan(0)
    expect(places[0]?.label).toBe('Walmer')
  })

  it('matches suburb by equality, not substring (Walmer vs Walmer Heights)', () => {
    const places = parseAreasParam('Walmer')
    const walmer = listing({ suburb: 'Walmer', city: 'Gqeberha' })
    const heights = listing({ suburb: 'Walmer Heights', city: 'Gqeberha' })
    expect(propertyMatchesAreas(walmer, places)).toBe(true)
    expect(propertyMatchesAreas(heights, places)).toBe(false)
  })
})
