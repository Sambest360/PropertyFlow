import { describe, expect, it } from 'vitest'
import {
  areaOriginPoints,
  distanceFromOrigin,
  formatDistanceAway,
  sortByNearest,
  type NearestOrigin,
  type NearestRankable,
} from './nearestSort'
import { listingPlace } from './placeCatalog'

type Row = NearestRankable & { id: string }

// Walmer, Gqeberha, and points east of it (~0.9 km per 0.01° of longitude at this latitude).
const origin: NearestOrigin = { points: [{ lat: -33.98, lng: 25.58 }], source: 'device', suburbs: ['Walmer'], cities: ['Gqeberha'] }

const rows: Row[] = [
  { id: 'far', lat: -33.98, lng: 25.7, suburb: 'Summerstrand', city: 'Gqeberha', createdAt: '2026-10-01' },
  { id: 'near', lat: -33.98, lng: 25.59, suburb: 'Walmer', city: 'Gqeberha', createdAt: '2026-01-01' },
  { id: 'mid', lat: -33.98, lng: 25.62, suburb: 'Mill Park', city: 'Gqeberha', createdAt: '2026-05-01' },
  { id: 'nocoord-other', lat: null, lng: null, suburb: 'Sandton', city: 'Johannesburg', createdAt: '2026-10-20' },
  { id: 'nocoord-city', lat: 0, lng: 0, suburb: 'Newton Park', city: 'Gqeberha', createdAt: '2026-02-01' },
  { id: 'nocoord-suburb-old', suburb: 'Walmer', city: 'Gqeberha', createdAt: '2025-01-01' },
  { id: 'nocoord-suburb-new', suburb: 'walmer ', city: 'Gqeberha', createdAt: '2026-03-01' },
]

const ids = (list: Row[]) => list.map((r) => r.id)

describe('sortByNearest', () => {
  it('orders mapped listings closest first, then unmapped by suburb, city, newest', () => {
    expect(ids(sortByNearest(rows, (r) => r, origin))).toEqual([
      'near',
      'mid',
      'far',
      'nocoord-suburb-new',
      'nocoord-suburb-old',
      'nocoord-city',
      'nocoord-other',
    ])
  })

  it('uses the closest of several area centres', () => {
    const two: NearestOrigin = { points: [{ lat: -33.98, lng: 25.58 }, { lat: -33.98, lng: 25.7 }], source: 'area' }
    expect(ids(sortByNearest(rows, (r) => r, two)).slice(0, 2).sort()).toEqual(['far', 'near'])
  })

  it('breaks equal distances by newest', () => {
    const same: Row[] = [
      { id: 'old', lat: -33.98, lng: 25.6, createdAt: '2025-01-01' },
      { id: 'new', lat: -33.98, lng: 25.6, createdAt: '2026-01-01' },
    ]
    expect(ids(sortByNearest(same, (r) => r, origin))).toEqual(['new', 'old'])
  })

  it('does not mutate the input', () => {
    const copy = [...rows]
    sortByNearest(rows, (r) => r, origin)
    expect(rows).toEqual(copy)
  })
})

describe('distanceFromOrigin', () => {
  it('is null without coordinates (0,0 is the missing sentinel)', () => {
    expect(distanceFromOrigin(origin, { lat: null, lng: null })).toBeNull()
    expect(distanceFromOrigin(origin, { lat: 0, lng: 0 })).toBeNull()
  })
  it('is about 0.9 km for 0.01° of longitude here', () => {
    expect(distanceFromOrigin(origin, { lat: -33.98, lng: 25.59 })).toBeCloseTo(0.92, 1)
  })
})

describe('formatDistanceAway', () => {
  it('uses metres under 1 km, one decimal under 10 km, whole km beyond', () => {
    expect(formatDistanceAway(0.849)).toBe('850 m away')
    expect(formatDistanceAway(0.01)).toBe('100 m away')
    expect(formatDistanceAway(1.234)).toBe('1.2 km away')
    expect(formatDistanceAway(0.97)).toBe('1.0 km away')
    expect(formatDistanceAway(14.4)).toBe('14 km away')
  })
})

describe('areaOriginPoints', () => {
  it('uses the place centre, or the average of its mapped listings', () => {
    const known = { ...listingPlace('Walmer'), lat: -33.98, lng: 25.58 }
    const unknown = listingPlace('Stellenbosch', 'city')
    const pts = areaOriginPoints([known, unknown], [
      { lat: -33.9, lng: 18.8, city: 'Stellenbosch' },
      { lat: -33.94, lng: 18.86, city: 'stellenbosch' },
      { lat: null, lng: null, city: 'Stellenbosch' },
    ])
    expect(pts[0]).toEqual({ lat: -33.98, lng: 25.58 })
    expect(pts[1].lat).toBeCloseTo(-33.92, 5)
    expect(pts[1].lng).toBeCloseTo(18.83, 5)
  })
  it('skips an area with no centre and no mapped listings', () => {
    expect(areaOriginPoints([listingPlace('Nowhere')], [])).toEqual([])
  })
})
