import { describe, expect, it } from 'vitest'
import type { Unit } from '../data/infrastructure'
import type { PropertyAsset } from '../types/domain'
import { unitPersistPayload } from './unitPersistPayload'

const unit: Unit = {
  id: 'unt-PR-1',
  clientId: 'ag-1',
  buildingId: 'b-1',
  agentId: 'u-old',
  unitNumber: 'B12',
  title: 'Old title',
  squareMeters: 60,
  bedrooms: 1,
  bathrooms: 1,
  parking: 0,
  listingType: 'rent',
  price: null,
  rent: 9000,
  statusKey: 'PUBLISHED',
  description: 'Old description',
  amenities: ['Pool'],
  images: ['old.jpg'],
  featured: false,
  createdAt: '2026-01-01',
}

const property = {
  id: 'PR-1',
  unitId: 'unt-PR-1',
  agencyId: 'ag-1',
  agentId: 'u-new',
  title: 'New title',
  area: 72,
  beds: 2,
  baths: 2,
  parking: 1,
  price: null,
  rent: 12500,
  description: 'New description',
  amenities: ['Pool', 'Gym'],
  images: ['new-1.jpg', 'new-2.jpg'],
  featured: true,
  lat: -33.9,
  lng: 25.6,
} as unknown as PropertyAsset

describe('unitPersistPayload', () => {
  it('takes every listing column from the edited property, not the stale unit', () => {
    const out = unitPersistPayload(unit, property)
    expect(out).toMatchObject({
      id: 'unt-PR-1',
      agentId: 'u-new',
      title: 'New title',
      squareMeters: 72,
      bedrooms: 2,
      bathrooms: 2,
      parking: 1,
      rent: 12500,
      description: 'New description',
      amenities: ['Pool', 'Gym'],
      images: ['new-1.jpg', 'new-2.jpg'],
      featured: true,
      statusKey: 'PUBLISHED',
      listingType: 'rent',
    })
  })

  it('keeps unit values for fields a partial property snapshot lacks', () => {
    const out = unitPersistPayload(unit, { id: 'PR-1', title: 'T' } as unknown as PropertyAsset)
    expect(out.title).toBe('T')
    expect(out.images).toEqual(['old.jpg'])
    expect(out.rent).toBe(9000)
    expect(out.agentId).toBe('u-old')
  })

  it('a cleared price or unassigned agent is saved as null', () => {
    const out = unitPersistPayload(unit, { ...property, rent: null, agentId: null })
    expect(out.rent).toBeNull()
    expect(out.agentId).toBeNull()
  })

  it('returns the unit unchanged without a property', () => {
    expect(unitPersistPayload(unit, undefined)).toBe(unit)
  })
})
