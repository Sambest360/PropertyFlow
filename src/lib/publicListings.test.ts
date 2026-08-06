import { describe, expect, it } from 'vitest'
import { isPubliclyListed } from './publicListings'
import type { PropertyAsset } from '../types/domain'
import type { Unit } from '../data/infrastructure'

function baseProperty(overrides: Partial<PropertyAsset> = {}): PropertyAsset {
  return {
    id: 'p1',
    agencyId: 'ag1',
    landlordId: 'u1',
    agentId: null,
    title: 'Test',
    type: 'Apartment',
    status: 'Published',
    listingMode: 'rent',
    price: null,
    rent: 10000,
    beds: 2,
    baths: 1,
    parking: 1,
    area: 80,
    city: 'PE',
    suburb: 'Humewood',
    address: '1 Test St',
    lat: 0,
    lng: 0,
    images: [],
    rooms: [],
    amenities: [],
    description: '',
    featured: false,
    createdAt: '2026-01-01',
    ...overrides,
  }
}

describe('isPubliclyListed', () => {
  it('hides deleted properties from marketplace', () => {
    expect(isPubliclyListed(baseProperty({ deletedAt: '2026-01-02T00:00:00.000Z' }))).toBe(false)
  })

  it('hides drafts and archived', () => {
    expect(isPubliclyListed(baseProperty({ status: 'Draft' }))).toBe(false)
    expect(isPubliclyListed(baseProperty({ status: 'Archived' }))).toBe(false)
    expect(isPubliclyListed(baseProperty({ status: 'Published' }))).toBe(true)
  })

  it('hides not_listed units', () => {
    const property = baseProperty({ unitId: 'un1' })
    const units = [{ id: 'un1', listingType: 'not_listed' } as Unit]
    expect(isPubliclyListed(property, { units })).toBe(false)
  })

  it('hides draft unit status keys', () => {
    const property = baseProperty({ status: 'Published', unitId: 'un1' })
    const units = [{ id: 'un1', listingType: 'rent', statusKey: 'DRAFT' } as Unit]
    expect(isPubliclyListed(property, { units })).toBe(false)
  })

  it('hides pending landlord verification', () => {
    const property = baseProperty({ landlordId: 'll1' })
    expect(
      isPubliclyListed(property, {
        users: [
          {
            id: 'll1',
            name: 'Owner',
            email: 'o@x.com',
            role: 'landlord',
            agencyId: 'ag1',
            clientId: 'c1',
            active: true,
            permissions: [],
            verification: { status: 'pending' },
          },
        ],
      }),
    ).toBe(false)
  })
})
