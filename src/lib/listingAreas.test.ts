import { describe, expect, it } from 'vitest'
import { aggregateListingAreas, nearestListingArea, popularAreasForMode } from './listingAreas'
import { areaToPlace, haversineKm, parseAreasParam, propertyMatchesAreas, searchPlaces } from './placeCatalog'

const rows = [
  { suburb: 'Walmer', city: 'Gqeberha', type: 'House', listingMode: 'sale', price: 2_000_000, rent: null, lat: -33.98, lng: 25.58 },
  { suburb: 'Walmer', city: 'Gqeberha', type: 'Apartment', listingMode: 'rent', price: null, rent: 9000, lat: -33.98, lng: 25.6 },
  { suburb: 'walmer ', city: 'Gqeberha', type: 'Townhouse', listingMode: 'both', price: 1_500_000, rent: 12000, lat: 0, lng: 0 },
  { suburb: 'Sea Point', city: 'Cape Town', type: 'Apartment', listingMode: 'rent', price: null, rent: 15000, lat: -33.92, lng: 18.38 },
  { suburb: 'Sea Point', city: 'Cape Town', type: 'Office', listingMode: 'rent', price: null, rent: 30000, lat: -33.92, lng: 18.38 },
  { suburb: '', city: 'Durban', type: 'House', listingMode: 'sale', price: 3_000_000, rent: null, lat: null, lng: null },
]

describe('aggregateListingAreas', () => {
  const areas = aggregateListingAreas(rows)
  const find = (label: string, kind = 'suburb') => areas.find((a) => a.kind === kind && a.label.toLowerCase() === label.toLowerCase())

  it('counts each suburb per section, case-insensitively, commercial in neither', () => {
    expect(find('Walmer')).toMatchObject({ total: 3, buy: 2, rent: 2, city: 'Gqeberha' })
    expect(find('Sea Point')).toMatchObject({ total: 2, buy: 0, rent: 1, city: 'Cape Town' })
  })

  it('counts cities too and averages only real coordinates', () => {
    expect(find('Gqeberha', 'city')).toMatchObject({ total: 3, buy: 2, rent: 2 })
    expect(find('Durban', 'city')).toMatchObject({ buy: 1, rent: 0, lat: null, lng: null })
    expect(find('Walmer')).toMatchObject({ lat: -33.98, lng: 25.59 })
  })

  it('popular areas follow the selected section', () => {
    expect(popularAreasForMode(areas, 'rent').map((a) => a.label)).toEqual(['Walmer', 'Sea Point'])
    expect(popularAreasForMode(areas, 'buy').map((a) => a.label)).toEqual(['Walmer'])
    expect(popularAreasForMode([], 'buy')).toEqual([])
    // No suburbs at all: fall back to cities.
    expect(popularAreasForMode(aggregateListingAreas([rows[5]!]), 'buy').map((a) => a.label)).toEqual(['Durban'])
  })

  it('near me finds the closest area with listings in the section', () => {
    const capeTown = { lat: -33.93, lng: 18.42 }
    expect(nearestListingArea(areas, capeTown, 'rent', 50, haversineKm)?.area.label).toBe('Sea Point')
    expect(nearestListingArea(areas, capeTown, 'buy', 50, haversineKm)).toBeNull()
  })
})

describe('listing places in search and URLs', () => {
  it('a suburb outside the catalog round-trips through ?areas= and matches its listings', () => {
    const place = areaToPlace({ label: 'Sea Point', kind: 'suburb', lat: -33.92, lng: 18.38 })
    const parsed = parseAreasParam(place.label)
    expect(parsed.map((p) => p.label)).toEqual(['Sea Point'])
    expect(propertyMatchesAreas({ suburb: 'Sea Point', city: 'Cape Town' }, parsed)).toBe(true)
    expect(propertyMatchesAreas({ suburb: 'Walmer', city: 'Gqeberha' }, parsed)).toBe(false)
  })

  it('a city outside the catalog matches every listing in that city', () => {
    const parsed = parseAreasParam(areaToPlace({ label: 'Cape Town', kind: 'city', lat: null, lng: null }).label)
    expect(propertyMatchesAreas({ suburb: 'Sea Point', city: 'Cape Town' }, parsed)).toBe(true)
    expect(propertyMatchesAreas({ suburb: 'Walmer', city: 'Gqeberha' }, parsed)).toBe(false)
  })

  it('catalog names keep their catalog place (Port Elizabeth = whole metro)', () => {
    expect(areaToPlace({ label: 'Walmer', kind: 'suburb', lat: 0, lng: 0 }).id).toBe('walmer')
    const pe = parseAreasParam('Port Elizabeth')
    expect(pe[0]?.id).toBe('gqeberha')
    expect(propertyMatchesAreas({ suburb: 'Summerstrand', city: '' }, pe)).toBe(true)
    // An unknown partial name is not silently turned into a catalog suburb.
    expect(parseAreasParam('Newton')[0]?.label).toBe('Newton')
  })

  it('typeahead searches the given places', () => {
    const places = [areaToPlace({ label: 'Sea Point', kind: 'suburb', lat: 0, lng: 0 })]
    expect(searchPlaces('sea', 5, places).map((p) => p.label)).toEqual(['Sea Point'])
    expect(searchPlaces('walmer', 5, places)).toEqual([])
  })
})
