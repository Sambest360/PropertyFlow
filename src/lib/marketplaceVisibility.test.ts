import { describe, expect, it } from 'vitest'
import {
  getGuestMarketplaceBlockReason,
  guestVisibleAfterPublish,
  portfolioLabelLooksLive,
} from './marketplaceVisibility'
import type { PropertyAsset } from '../types/domain'
import type { Unit } from '../data/infrastructure'

function baseProperty(overrides: Partial<PropertyAsset> = {}): PropertyAsset {
  return {
    id: 'PR-1',
    agencyId: 'ag-1',
    landlordId: 'll-1',
    agentId: null,
    unitId: 'un-1',
    title: 'Test',
    type: 'Apartment',
    status: 'Published',
    listingMode: 'rent',
    price: null,
    rent: 10000,
    beds: 2,
    baths: 1,
    parking: 1,
    area: 70,
    city: 'Gqeberha',
    suburb: 'Central',
    address: '1 St',
    lat: -33.9,
    lng: 25.6,
    images: ['x'],
    rooms: [],
    amenities: [],
    description: '',
    featured: false,
    createdAt: '2026-09-01',
    ...overrides,
  }
}

function baseUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'un-1',
    clientId: 'ag-1',
    buildingId: 'bld-1',
    agentId: null,
    unitNumber: '1',
    title: 'Unit 1',
    squareMeters: 70,
    bedrooms: 2,
    bathrooms: 1,
    parking: 1,
    listingType: 'rent',
    price: null,
    rent: 10000,
    statusKey: 'PUBLISHED',
    description: '',
    amenities: [],
    images: [],
    featured: false,
    createdAt: '2026-09-01',
    ...overrides,
  }
}

describe('getGuestMarketplaceBlockReason', () => {
  it('returns null when publicly listed', () => {
    const p = baseProperty()
    expect(getGuestMarketplaceBlockReason(p, { units: [baseUnit()] })).toBeNull()
  })

  it('explains pending landlord while staff portfolio looks live', () => {
    const p = baseProperty({ landlordId: 'll-2' })
    const users = [{ id: 'll-2', verification: { status: 'pending' as const } }] as never
    const block = getGuestMarketplaceBlockReason(p, { units: [baseUnit()], users })
    expect(block?.landlordUserId).toBe('ll-2')
    expect(block?.message).toMatch(/pending/i)
    expect(portfolioLabelLooksLive(p, 'PUBLISHED')).toBe(true)
  })

  it('guestVisibleAfterPublish is false when landlord stays pending', () => {
    const p = baseProperty({ status: 'Draft', landlordId: 'll-2' })
    const users = [{ id: 'll-2', verification: { status: 'pending' as const } }] as never
    expect(guestVisibleAfterPublish(p, baseUnit({ statusKey: 'DRAFT' }), users)).toBe(false)
  })
})
