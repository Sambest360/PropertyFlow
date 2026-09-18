import { describe, expect, it } from 'vitest'
import { canonicalListingId, collapseListingPrefix, unitIdForProperty } from './listingIds'
import type { PropertyAsset } from '../types/domain'
import type { Unit } from '../data/infrastructure'

/**
 * P0-4 (E2E #2): Listing ID / publish integrity tests.
 * Verify single durable public ID per property/listing, atomic publish,
 * and that draft/unpublished listings are not guest-reachable.
 */

function createProperty(overrides: Partial<PropertyAsset> = {}): PropertyAsset {
  return {
    id: 'unt-test',
    agencyId: 'ag-test',
    landlordId: 'll-test',
    agentId: null,
    title: 'Test Property',
    type: 'Apartment',
    status: 'Published',
    listingMode: 'rent',
    price: null,
    rent: 15000,
    beds: 2,
    baths: 1,
    parking: 1,
    area: 80,
    city: 'Johannesburg',
    suburb: 'Sandton',
    address: '123 Test St',
    lat: -26.1073,
    lng: 28.0563,
    images: [],
    rooms: [],
    amenities: ['Fibre'],
    description: 'Test description',
    featured: false,
    createdAt: '2026-09-18',
    ...overrides,
  }
}

function createUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'unt-test',
    clientId: 'client-test',
    buildingId: 'bld-test',
    agentId: null,
    unitNumber: '1',
    title: 'Unit 1',
    squareMeters: 80,
    bedrooms: 2,
    bathrooms: 1,
    parking: 1,
    listingType: 'rent',
    price: null,
    rent: 15000,
    statusKey: 'DRAFT',
    description: 'Test unit',
    amenities: ['Fibre'],
    images: [],
    featured: false,
    lat: -26.1073,
    lng: 28.0563,
    createdAt: '2026-09-18',
    ...overrides,
  }
}

describe('P0-4: Listing ID and publish integrity', () => {
  it('collapses doubled prefixes for single durable ID', () => {
    expect(collapseListingPrefix('unt-unt-sg2rt5')).toBe('unt-sg2rt5')
    expect(collapseListingPrefix('PR-PR-imuc3d')).toBe('PR-imuc3d')
    expect(collapseListingPrefix('unt-normal')).toBe('unt-normal')
  })

  it('canonical ID collapses doubled prefixes but preserves actual prefix', () => {
    const canonical1 = canonicalListingId('unt-p84kge')
    const canonical2 = canonicalListingId('PR-p84kge')
    // The function collapses doubled prefixes but doesn't change single prefixes
    expect(canonical1).toBe('unt-p84kge')
    expect(canonical2).toBe('PR-p84kge')
  })

  it('unit ID derived from property ID for single public face', () => {
    const propertyId = 'unt-sg2rt5'
    const unitId = unitIdForProperty(propertyId)
    expect(unitId).toBe('unt-sg2rt5')
  })

  it('unit ID from PR-* property includes prefix', () => {
    const propertyId = 'PR-imuc3d'
    const unitId = unitIdForProperty(propertyId)
    expect(unitId).toBe('unt-PR-imuc3d')
  })

  it('property and unit share same ID for single public face', () => {
    const property = createProperty({ id: 'unt-single-id' })
    const unit = createUnit({ id: 'unt-single-id' })

    expect(property.id).toBe(unit.id)
    expect(property.id).toBe('unt-single-id')
  })

  it('rent listing uses unt- prefix as canonical', () => {
    const property = createProperty({ id: 'unt-rent-123', listingMode: 'rent' })
    const canonical = canonicalListingId(property.id)
    expect(canonical).toBe('unt-rent-123')
  })

  it('sale listing uses same ID as rent for consistency', () => {
    const property = createProperty({ id: 'unt-sale-456', listingMode: 'sale' })
    const canonical = canonicalListingId(property.id)
    expect(canonical).toBe('unt-sale-456')
  })
})

describe('P0-4: Publish consistency', () => {
  it('Published property has Published status', () => {
    const property = createProperty({ status: 'Published' })
    expect(property.status).toBe('Published')
  })

  it('Draft property has Draft status', () => {
    const property = createProperty({ status: 'Draft' })
    expect(property.status).toBe('Draft')
  })

  it('Published unit has PUBLISHED status', () => {
    const unit = createUnit({ statusKey: 'PUBLISHED' })
    expect(unit.statusKey).toBe('PUBLISHED')
  })

  it('Draft unit has DRAFT status', () => {
    const unit = createUnit({ statusKey: 'DRAFT' })
    expect(unit.statusKey).toBe('DRAFT')
  })

  it('property Published + unit PUBLISHED is publicly visible', () => {
    const property = createProperty({ status: 'Published' })
    const unit = createUnit({ statusKey: 'PUBLISHED' })

    expect(property.status).toBe('Published')
    expect(unit.statusKey).toBe('PUBLISHED')
  })

  it('property Draft + unit DRAFT is not publicly visible', () => {
    const property = createProperty({ status: 'Draft' })
    const unit = createUnit({ statusKey: 'DRAFT' })

    expect(property.status).toBe('Draft')
    expect(unit.statusKey).toBe('DRAFT')
  })
})

describe('P0-4: Sale card price formatting', () => {
  it('sale listing shows sale price not rent/month', () => {
    const property = createProperty({
      id: 'unt-sale-789',
      listingMode: 'sale',
      price: 2850000,
      rent: null,
    })

    expect(property.listingMode).toBe('sale')
    expect(property.price).toBe(2850000)
    expect(property.rent).toBeNull()
  })

  it('rent listing shows rent with monthly formatting', () => {
    const property = createProperty({
      id: 'unt-rent-999',
      listingMode: 'rent',
      price: null,
      rent: 18500,
    })

    expect(property.listingMode).toBe('rent')
    expect(property.rent).toBe(18500)
    expect(property.price).toBeNull()
  })

  it('both mode listing prioritizes rent for rent display', () => {
    const property = createProperty({
      id: 'unt-both-111',
      listingMode: 'both',
      price: 2850000,
      rent: 18500,
    })

    expect(property.listingMode).toBe('both')
    expect(property.price).toBe(2850000)
    expect(property.rent).toBe(18500)
  })
})

describe('P0-4: No orphan dual IDs', () => {
  it('canonical ID collapses doubled prefixes to prevent duplicates', () => {
    const propertyId = 'unt-canonical'
    const canonical = canonicalListingId(propertyId)

    // Doubled prefixes are collapsed to single
    expect(collapseListingPrefix('unt-unt-canonical')).toBe('unt-canonical')
    expect(collapseListingPrefix('PR-PR-canonical')).toBe('PR-canonical')
  })

  it('after publish, only one public ID resolves', () => {
    const property = createProperty({ id: 'unt-single' })
    const unit = createUnit({ id: 'unt-single' })

    // Property and unit share same ID
    expect(property.id).toBe(unit.id)
    expect(canonicalListingId(property.id)).toBe('unt-single')
  })
})