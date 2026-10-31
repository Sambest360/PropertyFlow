import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cachedMarketplaceAreas, marketplaceAreasFromGuestPayload, resetMarketplaceAreasCache } from './marketplaceAreas'

const payload = {
  properties: [
    { suburb: 'Walmer', city: 'Gqeberha', type: 'House', listingMode: 'sale', price: 2_000_000, rent: null, lat: -33.98, lng: 25.58 },
    { suburb: 'Walmer', city: 'Gqeberha', type: 'Apartment', listingMode: 'rent', price: null, rent: 9000, lat: -33.98, lng: 25.6 },
  ],
}

describe('marketplace areas endpoint', () => {
  beforeEach(() => resetMarketplaceAreasCache())

  it('only exposes area names, counts and rounded centres', () => {
    const body = marketplaceAreasFromGuestPayload(payload, new Date('2026-10-30T00:00:00Z'))
    expect(body.listings).toBe(2)
    const walmer = body.areas.find((a) => a.label === 'Walmer')
    expect(walmer).toEqual({ label: 'Walmer', kind: 'suburb', city: 'Gqeberha', total: 2, buy: 1, rent: 1, lat: -33.98, lng: 25.59 })
    expect(Object.keys(walmer!).sort()).toEqual(['buy', 'city', 'kind', 'label', 'lat', 'lng', 'rent', 'total'])
  })

  it('caches for five minutes and shares one load', async () => {
    const load = vi.fn(async () => payload)
    const t0 = 1_000_000
    const [a, b] = await Promise.all([cachedMarketplaceAreas(load, t0), cachedMarketplaceAreas(load, t0)])
    expect(a).toBe(b)
    await cachedMarketplaceAreas(load, t0 + 4 * 60_000)
    expect(load).toHaveBeenCalledTimes(1)
    await cachedMarketplaceAreas(load, t0 + 6 * 60_000)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('a failed load is not cached', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(payload)
    await expect(cachedMarketplaceAreas(load, 1)).rejects.toThrow('db down')
    await expect(cachedMarketplaceAreas(load, 2)).resolves.toMatchObject({ listings: 2 })
  })
})
