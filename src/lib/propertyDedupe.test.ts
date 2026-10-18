import { describe, expect, it } from 'vitest'
import type { PropertyAsset } from '../types/domain'
import { dedupePropertyAssets, pickPreferredProperty } from './propertyDedupe'

function prop(over: Partial<PropertyAsset> & { id: string }): PropertyAsset {
  return {
    agencyId: 'ag-1',
    landlordId: 'u-ll',
    agentId: null,
    title: 'Listing',
    type: 'House',
    status: 'Published',
    listingMode: 'rent',
    price: null,
    rent: 1000,
    beds: 2,
    baths: 1,
    parking: 1,
    area: 80,
    city: 'Gqeberha',
    suburb: 'Fairview',
    address: '1 Main',
    lat: 0,
    lng: 0,
    images: [],
    rooms: [],
    amenities: [],
    description: '',
    featured: false,
    createdAt: '2026-01-01',
    ...over,
  }
}

describe('dedupePropertyAssets', () => {
  it('collapses PR-* and unt-PR-* with same unitId', () => {
    const a = prop({ id: 'PR-abc', unitId: 'unt-PR-abc', title: 'Rent flat' })
    const b = prop({ id: 'unt-PR-abc', unitId: 'unt-PR-abc', title: 'Rent flat copy' })
    const out = dedupePropertyAssets([a, b])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('PR-abc')
  })

  it('collapses optimistic unt-* row with hydrated twin sharing backendId', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const optimistic = prop({ id: 'unt-abc123', unitId: 'unt-abc123', backendId: uuid, title: 'Local' })
    const hydrated = prop({ id: uuid, unitId: 'unt-abc123', backendId: uuid, title: 'Remote' })
    const out = dedupePropertyAssets([optimistic, hydrated])
    expect(out).toHaveLength(1)
  })

  it('keeps distinct listings', () => {
    const a = prop({ id: 'PR-one', unitId: 'unt-PR-one' })
    const b = prop({ id: 'PR-two', unitId: 'unt-PR-two' })
    expect(dedupePropertyAssets([a, b])).toHaveLength(2)
  })

  it('prefers non-archived row', () => {
    const live = prop({ id: 'PR-x', status: 'Published' })
    const dead = prop({ id: 'unt-PR-x', status: 'Archived', deletedAt: '2026-01-02' })
    expect(pickPreferredProperty(dead, live).id).toBe('PR-x')
  })
})
