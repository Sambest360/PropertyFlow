import { describe, expect, it } from 'vitest'
import {
  haversineKm,
  nearestPlaces,
  propertyMatchesAreas,
  searchPlaces,
  parseAreasParam,
} from './placeCatalog'

describe('searchPlaces', () => {
  it('ranks exact suburb matches first', () => {
    const hits = searchPlaces('Walmer')
    expect(hits[0]?.label).toBe('Walmer')
  })

  it('finds Gqeberha via Port Elizabeth alias', () => {
    const hits = searchPlaces('Port Elizabeth')
    expect(hits.some((p) => p.id === 'gqeberha')).toBe(true)
  })

  it('returns catalog head when query is empty', () => {
    expect(searchPlaces('').length).toBeGreaterThan(0)
  })
})

describe('nearestPlaces', () => {
  it('returns nearby suburbs around Humewood', () => {
    // Humewood centroid
    const near = nearestPlaces(-33.978, 25.6449, { limit: 3, maxKm: 15 })
    expect(near.length).toBeGreaterThan(0)
    expect(near.every((p) => p.kind === 'suburb')).toBe(true)
    expect(near.some((p) => p.label === 'Humewood' || p.label === 'Summerstrand')).toBe(true)
  })

  it('haversine is ~0 for identical points', () => {
    expect(haversineKm({ lat: -33.96, lng: 25.6 }, { lat: -33.96, lng: 25.6 })).toBeLessThan(0.01)
  })
})

describe('propertyMatchesAreas', () => {
  const walmer = parseAreasParam('Walmer')
  const city = parseAreasParam('Gqeberha')

  it('matches suburb selection', () => {
    expect(
      propertyMatchesAreas({ suburb: 'Walmer', city: 'Port Elizabeth' }, walmer),
    ).toBe(true)
    expect(
      propertyMatchesAreas({ suburb: 'Humewood', city: 'Port Elizabeth' }, walmer),
    ).toBe(false)
    expect(
      propertyMatchesAreas({ suburb: 'Walmer Heights', city: 'Port Elizabeth' }, walmer),
    ).toBe(false)
  })

  it('city selection includes PE suburbs', () => {
    expect(
      propertyMatchesAreas({ suburb: 'Summerstrand', city: 'Port Elizabeth' }, city),
    ).toBe(true)
  })

  it('empty selection matches all', () => {
    expect(propertyMatchesAreas({ suburb: 'Anywhere', city: 'X' }, [])).toBe(true)
  })
})

describe('parseAreasParam', () => {
  it('round-trips comma-separated labels', () => {
    const places = parseAreasParam('Walmer,Humewood')
    expect(places.map((p) => p.label)).toEqual(['Walmer', 'Humewood'])
  })
})
