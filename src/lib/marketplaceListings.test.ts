import { describe, expect, it } from 'vitest'
import { orderFeaturedListings } from './marketplaceListings'
import type { PropertyAsset } from '../types/domain'

function prop(id: string, featured = false): PropertyAsset {
  return {
    id,
    title: id,
    status: 'Published',
    featured,
    type: 'House',
    city: 'PE',
    suburb: 'Walmer',
    description: '',
    images: [],
    listingMode: 'rent',
    agencyId: 'ag-1',
    rent: 1000,
  } as PropertyAsset
}

describe('orderFeaturedListings', () => {
  it('dedupes by id and puts featured first', () => {
    const list = [prop('a'), prop('b', true), prop('a', true), prop('c')]
    const out = orderFeaturedListings(list)
    expect(out.map((p) => p.id)).toEqual(['b', 'a', 'c'])
  })
})
