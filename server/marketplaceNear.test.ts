import { describe, expect, it, vi } from 'vitest'

vi.mock('./db.js', () => ({ query: async () => [] }))

import {
  NEAR_BOX_STEPS_KM,
  boundingBox,
  nearestMappedUnitsSql,
  nearestPublicUnitIds,
  parseNearHeader,
  unmappedUnitsSql,
  type NearPoint,
} from './marketplaceNear.js'
import { PUBLIC_UNITS_WHERE } from './unitsFeed.js'

const PE: NearPoint = { lat: -33.98, lng: 25.58, mode: null }

describe('parseNearHeader', () => {
  it('rounds to 2 decimals (~1 km) and keeps rent / buy mode', () => {
    expect(parseNearHeader('-33.98456,25.58321,rent')).toEqual({ lat: -33.98, lng: 25.58, mode: 'rent' })
    expect(parseNearHeader(' -33.9 , 25.6 , buy ')).toEqual({ lat: -33.9, lng: 25.6, mode: 'buy' })
    expect(parseNearHeader('-33.9,25.6,commercial')).toEqual({ lat: -33.9, lng: 25.6, mode: null })
  })
  it('rejects missing, malformed, out-of-range and 0,0 points', () => {
    for (const raw of [undefined, null, '', 'abc', '-33.9', ',25.6', '91,10', '10,181', '0,0', 'NaN,1']) {
      expect(parseNearHeader(raw)).toBeNull()
    }
  })
})

describe('boundingBox', () => {
  it('spans about km each way, wider in longitude away from the equator', () => {
    const b = boundingBox(-34, 25, 111.32)
    expect(b.maxLat - b.minLat).toBeCloseTo(2, 5)
    expect(b.maxLng - b.minLng).toBeGreaterThan(2.3)
  })
})

describe('nearest SQL', () => {
  it('filters to public units, orders by haversine km then newest, with a box when asked', () => {
    const { text, params } = nearestMappedUnitsSql({ ...PE, mode: 'rent' }, 250, 25)
    expect(text).toContain(PUBLIC_UNITS_WHERE)
    expect(text).toContain("IN ('rent', 'both')")
    expect(text).toMatch(/asin\(least\(1, sqrt/)
    expect(text).toMatch(/ORDER BY km ASC, created_at DESC, id/)
    expect(text).toContain('BETWEEN $3 AND $4')
    expect(params).toHaveLength(7)
    expect(params.slice(0, 2)).toEqual([-33.98, 25.58])
    expect(params[6]).toBe(250)
  })
  it('without a box: point and limit only; buy mode means sale or both', () => {
    const { text, params } = nearestMappedUnitsSql({ ...PE, mode: 'buy' }, 10, null)
    expect(text).not.toContain('BETWEEN')
    expect(text).toContain("IN ('sale', 'both')")
    expect(params).toEqual([-33.98, 25.58, 10])
  })
  it('unmapped units: public, no coordinates, newest first', () => {
    const { text, params } = unmappedUnitsSql(PE, 5)
    expect(text).toContain(PUBLIC_UNITS_WHERE)
    expect(text).toMatch(/AND NOT \(coalesce\(u\.lat, b\.lat\) IS NOT NULL/)
    expect(text).toMatch(/ORDER BY u\.created_at DESC/)
    expect(params).toEqual([5])
  })
})

type Sent = { text: string; params: unknown[] }

/** Fake db: mapped rows by distance; the box limits which ones a query sees. */
function fakeRun(mappedKm: number[], unmapped: string[]) {
  const sent: Sent[] = []
  const isUnmapped = (text: string) => text.includes('AND NOT (coalesce(u.lat, b.lat) IS NOT NULL')
  const run = async <T,>(text: string, params: unknown[]): Promise<T[]> => {
    sent.push({ text, params })
    if (isUnmapped(text)) return unmapped.slice(0, Number(params[0])).map((id) => ({ id })) as T[]
    const limit = Number(params[params.length - 1])
    const box = params.length === 7 ? NEAR_BOX_STEPS_KM[sent.filter((s) => !isUnmapped(s.text)).length - 1] : null
    // Rows inside a square box reach out to the corners (√2 × radius).
    const visible = mappedKm
      .map((km, i) => ({ id: `m${i}`, km }))
      .filter((r) => box == null || r.km <= box * Math.SQRT2)
      .sort((a, b) => a.km - b.km)
    return visible.slice(0, limit) as T[]
  }
  return { run, sent }
}

describe('nearestPublicUnitIds', () => {
  it('stops at the first box once it is full and its farthest unit is inside the radius', async () => {
    const { run, sent } = fakeRun([1, 2, 3, 4, 50], [])
    expect(await nearestPublicUnitIds(PE, { limit: 3, run })).toEqual(['m0', 'm1', 'm2'])
    expect(sent).toHaveLength(1)
  })

  it('widens when a full page reaches a box corner (could miss a closer unit outside)', async () => {
    // 26 km and 30 km sit in the 25 km box's corners; 100 km box proves the set.
    const { run, sent } = fakeRun([1, 26, 30, 28], [])
    expect(await nearestPublicUnitIds(PE, { limit: 3, run })).toEqual(['m0', 'm1', 'm3'])
    expect(sent).toHaveLength(2)
  })

  it('widens to no box when there are too few, then fills with the newest unmapped units', async () => {
    const { run, sent } = fakeRun([5, 900], ['u-new', 'u-old', 'u-older'])
    expect(await nearestPublicUnitIds(PE, { limit: 4, run })).toEqual(['m0', 'm1', 'u-new', 'u-old'])
    // 3 boxes + no box + unmapped fill.
    expect(sent).toHaveLength(NEAR_BOX_STEPS_KM.length + 2)
    expect(sent.at(-2)!.params).toEqual([-33.98, 25.58, 4])
    expect(sent.at(-1)!.params).toEqual([2])
  })
})
