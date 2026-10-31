import { describe, expect, it } from 'vitest'
import {
  canFeatureListing,
  listingInSearchArea,
  rankFeaturedInArea,
  type FeaturedRankable,
} from './featuredRanking'
import { getPlaceById, PLACE_CATALOG } from './placeCatalog'

const walmer = PLACE_CATALOG.find((p) => p.kind === 'suburb' && p.label === 'Walmer')!
const summerstrand = PLACE_CATALOG.find((p) => p.kind === 'suburb' && p.label === 'Summerstrand')!

function item(id: string, featured: boolean, suburb = 'Walmer', extra: Partial<FeaturedRankable> = {}): FeaturedRankable {
  return { id, featured, suburb, city: 'Gqeberha', ...extra }
}
const ids = (xs: FeaturedRankable[]) => xs.map((x) => x.id)
const rank = (xs: FeaturedRankable[], area: Parameters<typeof rankFeaturedInArea>[2], slots?: number) =>
  rankFeaturedInArea(xs, (x) => x, area, { slots, seed: '2026-10-30' })

describe('canFeatureListing', () => {
  it('lets agency staff feature, nobody else', () => {
    for (const r of ['super_admin', 'client_admin', 'agent_admin', 'ground_agent', 'agent']) {
      expect(canFeatureListing(r)).toBe(true)
    }
    for (const r of ['landlord', 'tenant', 'contractor', '', null, undefined]) {
      expect(canFeatureListing(r)).toBe(false)
    }
  })
})

describe('rankFeaturedInArea', () => {
  it('lifts featured listings in the searched suburb above the rest', () => {
    const list = [item('a', false), item('b', false), item('f', true)]
    expect(ids(rank(list, { kind: 'places', places: [walmer] }))).toEqual(['f', 'a', 'b'])
  })

  it('does not lift a featured listing from another suburb', () => {
    const list = [item('a', false), item('far', true, 'Summerstrand')]
    expect(ids(rank(list, { kind: 'places', places: [walmer] }))).toEqual(['a', 'far'])
    expect(ids(rank(list, { kind: 'places', places: [summerstrand] }))).toEqual(['far', 'a'])
  })

  it('matches typed suburb or city text', () => {
    const list = [item('a', false), item('far', true, 'Summerstrand'), item('f', true)]
    expect(ids(rank(list, { kind: 'place-text', text: 'walmer' }))).toEqual(['f', 'a', 'far'])
  })

  it('near me: only featured inside the chosen radius are lifted', () => {
    const here = { lat: -33.98, lng: 25.58 }
    const close = item('close', true, 'Walmer', { lat: -33.981, lng: 25.581 })
    const far = item('far', true, 'Elsewhere', { lat: -33.6, lng: 26.9 })
    const list = [item('a', false, 'Walmer', { lat: -33.98, lng: 25.58 }), far, close]
    expect(ids(rank(list, { kind: 'near', ...here, radiusKm: 5 }))).toEqual(['close', 'a', 'far'])
  })

  it('caps the lifted listings and leaves the others in place', () => {
    const list = [item('a', false), ...['f1', 'f2', 'f3', 'f4', 'f5'].map((id) => item(id, true))]
    const out = ids(rank(list, { kind: 'anywhere' }, 3))
    expect(out).toHaveLength(6)
    expect(out.slice(0, 3).every((id) => id.startsWith('f'))).toBe(true)
    expect(out[3]).toBe('a')
  })

  it('rotates which featured listings get the top slots from day to day', () => {
    const list = Array.from({ length: 8 }, (_, i) => item(`f${i}`, true))
    const tops = new Set<string>()
    for (let d = 1; d <= 20; d += 1) {
      const out = rankFeaturedInArea(list, (x) => x, { kind: 'anywhere' }, { slots: 1, seed: `2026-11-${d}` })
      tops.add(out[0].id)
    }
    expect(tops.size).toBeGreaterThan(2)
  })

  it('keeps the input untouched with no featured listings', () => {
    const list = [item('a', false), item('b', false)]
    expect(ids(rank(list, { kind: 'anywhere' }))).toEqual(['a', 'b'])
  })
})

describe('listingInSearchArea', () => {
  it('city place covers its suburbs', () => {
    const city = PLACE_CATALOG.find((p) => p.kind === 'city')
    if (!city) return
    expect(listingInSearchArea(item('x', true), { kind: 'places', places: [city] })).toBe(true)
    expect(getPlaceById(city.id)).toBeTruthy()
  })
})
