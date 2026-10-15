import { describe, expect, it } from 'vitest'
import { isPubliclyListed } from './publicListings'
import type { PropertyAsset } from '../types/domain'
import type { Unit } from '../data/infrastructure'

function baseProperty(overrides: Partial<PropertyAsset> = {}): PropertyAsset {
  return {
    id: 'PR-1',
    agencyId: 'ag-1',
    landlordId: 'll-1',
    agentId: null,
    unitId: 'un-1',
    title: 'QA listing',
    type: 'Apartment',
    status: 'Draft',
    listingMode: 'rent',
    price: null,
    rent: 12000,
    beds: 2,
    baths: 1,
    parking: 1,
    area: 80,
    city: 'Port Elizabeth',
    suburb: 'Humewood',
    address: '1 Test Street',
    lat: -33.96,
    lng: 25.6,
    images: ['img-1'],
    rooms: [],
    amenities: [],
    description: 'QA test listing',
    featured: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

function baseUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'un-1',
    clientId: 'ag-1',
    buildingId: 'bld-1',
    agentId: null,
    unitNumber: 'B12',
    title: 'Humewood B12',
    squareMeters: 80,
    bedrooms: 2,
    bathrooms: 1,
    parking: 1,
    listingType: 'rent',
    price: null,
    rent: 12000,
    statusKey: 'PUBLISHED',
    description: '',
    amenities: [],
    images: [],
    featured: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('isPubliclyListed', () => {
  it('property Published + unit PUBLISHED is publicly listed (P0-1)', () => {
    const p = baseProperty({ status: 'Published' })
    const unit = baseUnit({ statusKey: 'PUBLISHED' })
    expect(isPubliclyListed(p, { units: [unit] })).toBe(true)
  })

  it('property Published but unit still DRAFT is NOT listed — publish must sync the unit (GO#5 bug)', () => {
    const p = baseProperty({ status: 'Published' })
    const unit = baseUnit({ statusKey: 'DRAFT' })
    expect(isPubliclyListed(p, { units: [unit] })).toBe(false)
  })

  it('unpublishing the property hides it from browse even if unit lags', () => {
    const p = baseProperty({ status: 'Archived' })
    const unit = baseUnit({ statusKey: 'PUBLISHED' })
    expect(isPubliclyListed(p, { units: [unit] })).toBe(false)
  })

  it('Featured and Under Offer unit status keys stay public', () => {
    const p = baseProperty({ status: 'Under Offer' })
    expect(
      isPubliclyListed(p, { units: [baseUnit({ statusKey: 'UNDER_OFFER' })] }),
    ).toBe(true)
    expect(
      isPubliclyListed(p, { units: [baseUnit({ statusKey: 'FEATURED' })] }),
    ).toBe(true)
  })

  it('not_listed units never appear on the market', () => {
    const p = baseProperty({ status: 'Published' })
    expect(
      isPubliclyListed(p, { units: [baseUnit({ listingType: 'not_listed' })] }),
    ).toBe(false)
  })

  it('pending landlord verification keeps the listing off the market', () => {
    const p = baseProperty({ status: 'Published', landlordId: 'll-2' })
    const landlord = {
      id: 'll-2',
      verification: { status: 'pending' as const },
    }
    expect(isPubliclyListed(p, { units: [], users: [landlord] as never })).toBe(false)
  })

  it('approved landlord allows a published listing on the market', () => {
    const p = baseProperty({ status: 'Published', landlordId: 'll-2' })
    const landlord = {
      id: 'll-2',
      verification: { status: 'approved' as const },
    }
    expect(
      isPubliclyListed(p, { units: [baseUnit()], users: [landlord] as never }),
    ).toBe(true)
  })

  it('OFF_MARKET unit status is not publicly listed (Draft/OFF_MARKET alignment)', () => {
    const p = baseProperty({ status: 'Published' })
    expect(
      isPubliclyListed(p, { units: [baseUnit({ statusKey: 'OFF_MARKET' })] }),
    ).toBe(false)
    expect(
      isPubliclyListed(p, { units: [baseUnit({ statusKey: 'DRAFT' })] }),
    ).toBe(false)
  })

  it('AVAILABLE unit status stays public (legacy publish alias)', () => {
    const p = baseProperty({ status: 'Published' })
    expect(
      isPubliclyListed(p, { units: [baseUnit({ statusKey: 'AVAILABLE' })] }),
    ).toBe(true)
  })

  it('blank landlordId does not invent a user — listing stays public when otherwise live', () => {
    const p = baseProperty({ status: 'Published', landlordId: '' })
    expect(isPubliclyListed(p, { units: [baseUnit()], users: [] })).toBe(true)
  })
})
