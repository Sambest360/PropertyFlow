import { describe, expect, it } from 'vitest'
import { searchUnitsFeed } from './unitsApi'
import type { Building, Unit } from '../../data/infrastructure'
import type { PropertyAsset } from '../../types/domain'

function baseUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'un-1',
    clientId: 'c1',
    buildingId: 'b1',
    agentId: null,
    unitNumber: '101',
    title: 'Unit 101',
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
    createdAt: '2026-01-01',
    ...overrides,
  }
}

function baseBuilding(overrides: Partial<Building> = {}): Building {
  return {
    id: 'b1',
    clientId: 'c1',
    landlordId: 'u1',
    name: 'Cape Road Business Park',
    addressLine1: '4 Cape Road',
    suburb: 'Newton Park',
    city: 'Port Elizabeth',
    province: 'Eastern Cape',
    grading: 'A',
    solarCapacityKw: 0,
    hasBorehole: false,
    lat: -33.9427,
    lng: 25.5593,
    images: [],
    createdAt: '2026-01-01',
    ...overrides,
  }
}

function baseProperty(overrides: Partial<PropertyAsset> = {}): PropertyAsset {
  return {
    id: 'p1',
    agencyId: 'ag1',
    landlordId: 'u1',
    agentId: null,
    title: 'Newton Park Office Suite',
    type: 'Office',
    status: 'Published',
    listingMode: 'both',
    price: 3850000,
    rent: 32000,
    beds: 0,
    baths: 2,
    parking: 6,
    area: 420,
    city: 'Port Elizabeth',
    suburb: 'Newton Park',
    address: 'Suite 4, Cape Road Business Park',
    lat: -33.9427,
    lng: 25.5593,
    images: [],
    rooms: [],
    amenities: [],
    description: '',
    featured: false,
    createdAt: '2026-01-01',
    ...overrides,
  }
}

function feed(filters: Parameters<typeof searchUnitsFeed>[0]['filters'], units: Unit[], properties: PropertyAsset[]) {
  return searchUnitsFeed({ units, buildings: [baseBuilding()], properties, filters })
}

describe('searchUnitsFeed type filter (marketplace browse)', () => {
  it('shows a rentable office unit with no type filter (QA regression baseline)', () => {
    const officeProperty = baseProperty()
    const res = feed(
      { marketplace_public: true, listing_type: 'rent' },
      [baseUnit({ id: 'un-1', bedrooms: 0, title: 'Office Suite' })],
      [officeProperty],
    )
    expect(res.data.map((c) => c.title)).toContain('Office Suite')
  })

  it("excludes office units when the 'Apartment' chip is applied (Kelly's QA fail)", () => {
    const officeProperty = baseProperty()
    const apartmentProperty = baseProperty({
      id: 'p2',
      title: 'Newton Park Apartment',
      type: 'Apartment',
      beds: 2,
      rent: 15000,
    })
    const units = [
      baseUnit({ id: 'un-1', bedrooms: 0, title: 'Office Suite' }),
      baseUnit({ id: 'un-2', bedrooms: 2, title: 'Flat 2' }),
    ]
    const res = feed({ marketplace_public: true, listing_type: 'rent', types: ['Apartment'] }, units, [
      officeProperty,
      apartmentProperty,
    ])
    expect(res.data.map((c) => c.title)).toEqual(['Flat 2'])
  })

  it('filters infrastructure-only units by derived type (studio without property maps to Office)', () => {
    const units = [baseUnit({ id: 'un-1', bedrooms: 0, title: 'Studio Suite' })]
    const apartments = feed(
      { marketplace_public: true, listing_type: 'rent', types: ['Apartment'] },
      units,
      [],
    )
    expect(apartments.data).toHaveLength(0)
    const offices = feed(
      { marketplace_public: true, listing_type: 'rent', types: ['Office'] },
      units,
      [],
    )
    expect(offices.data.map((c) => c.title)).toContain('Studio Suite')
  })

  it('matches type chips case-insensitively', () => {
    const res = feed(
      { marketplace_public: true, listing_type: 'rent', types: ['apartment'] },
      [baseUnit({ id: 'un-1', bedrooms: 2, title: 'Flat' })],
      [],
    )
    expect(res.data).toHaveLength(1)
  })
})
