import { describe, expect, it } from 'vitest'
import type { PropertyAsset } from '../types/domain'
import { publicAreaLabel, roundPublicCoord, toPublicListing } from './publicLocation'

const listing = {
  id: 'PR-1',
  title: 'Two-bed townhouse',
  address: '26 Buckland Ave, 7',
  formattedAddress: '26 Buckland Ave, Richmond Hill, Gqeberha, 6001',
  placeId: 'ChIJxyz',
  suburb: 'Richmond Hill',
  city: 'Gqeberha',
  lat: -33.958123,
  lng: 25.611987,
} as unknown as PropertyAsset

describe('toPublicListing', () => {
  it('keeps only suburb and city and hides street details', () => {
    const pub = toPublicListing(listing)
    expect(pub.address).toBe('Richmond Hill, Gqeberha')
    expect(pub.formattedAddress).toBeNull()
    expect(pub.placeId).toBeNull()
    expect(JSON.stringify(pub)).not.toContain('Buckland')
  })

  it('rounds coordinates to about 1 km', () => {
    const pub = toPublicListing(listing)
    expect(pub.lat).toBe(-33.96)
    expect(pub.lng).toBe(25.61)
  })

  it('leaves the original property untouched for staff pages', () => {
    toPublicListing(listing)
    expect(listing.address).toBe('26 Buckland Ave, 7')
  })
})

describe('helpers', () => {
  it('labels and rounds safely', () => {
    expect(publicAreaLabel({ suburb: '', city: '' })).toBe('Location on request')
    expect(roundPublicCoord(null)).toBe(0)
  })
})
