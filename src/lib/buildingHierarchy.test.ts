import { describe, expect, it } from 'vitest'
import type { Building } from '../data/infrastructure'
import type { PropertyAsset } from '../types/domain'
import {
  STANDALONE_BUILDING_KEY,
  buildingsInScope,
  groupPortfolioByBuilding,
  propertyMatchesBuildingFilter,
  propertyMatchesOccupancyFilter,
  shouldUseBuildingGroupChrome,
  sortPortfolioItemsForSaleRentGroup,
  siblingUnitsInBuilding,
} from './buildingHierarchy'

function prop(partial: Partial<PropertyAsset> & Pick<PropertyAsset, 'id' | 'title'>): PropertyAsset {
  return {
    agencyId: 'ag-horizon',
    landlordId: 'u-owner1',
    agentId: null,
    type: 'Apartment',
    status: 'Published',
    listingMode: 'rent',
    price: null,
    rent: 10_000,
    beds: 1,
    baths: 1,
    parking: 0,
    area: 40,
    city: 'Port Elizabeth',
    suburb: 'Humewood',
    address: '1 Beach Rd',
    lat: 0,
    lng: 0,
    images: [],
    rooms: [],
    description: '',
    amenities: [],
    featured: false,
    createdAt: '2026-01-01',
    ...partial,
  } as PropertyAsset
}

const buildings: Building[] = [
  {
    id: 'bld-skyline',
    clientId: 'ag-horizon',
    landlordId: 'u-owner1',
    name: 'Beachview Towers',
    addressLine1: 'Beach Road',
    suburb: 'Humewood',
    city: 'Port Elizabeth',
    province: 'Eastern Cape',
    grading: 'P',
    solarCapacityKw: 80,
    hasBorehole: false,
    lat: 0,
    lng: 0,
    images: [],
    createdAt: '2025-01-01',
  },
]

describe('groupPortfolioByBuilding', () => {
  it('groups units under a shared building and puts orphans in standalone', () => {
    const rows = [
      { property: prop({ id: 'p1', title: 'Unit B', buildingId: 'bld-skyline' }) },
      { property: prop({ id: 'p2', title: 'Unit A', buildingId: 'bld-skyline' }) },
      { property: prop({ id: 'p3', title: 'Cottage', buildingId: null }) },
    ]
    const groups = groupPortfolioByBuilding(rows, buildings)
    expect(groups).toHaveLength(2)
    expect(groups[0].key).toBe('bld-skyline')
    expect(groups[0].label).toBe('Beachview Towers')
    expect(groups[0].items.map((i) => i.property.title)).toEqual(['Unit A', 'Unit B'])
    expect(groups[1].key).toBe(STANDALONE_BUILDING_KEY)
    expect(groups[1].unitCount).toBe(1)
  })

  it('keepOrder keeps the incoming (recent activity) order for groups and units', () => {
    const rows = [
      { property: prop({ id: 'p3', title: 'Cottage', buildingId: null }) },
      { property: prop({ id: 'p1', title: 'Unit B', buildingId: 'bld-skyline' }) },
      { property: prop({ id: 'p2', title: 'Unit A', buildingId: 'bld-skyline' }) },
    ]
    const groups = groupPortfolioByBuilding(rows, buildings, { keepOrder: true })
    expect(groups.map((g) => g.key)).toEqual([STANDALONE_BUILDING_KEY, 'bld-skyline'])
    expect(groups[1].items.map((i) => i.property.title)).toEqual(['Unit B', 'Unit A'])
  })

  it('treats unknown buildingId as standalone', () => {
    const groups = groupPortfolioByBuilding(
      [{ property: prop({ id: 'p1', title: 'X', buildingId: 'bld-missing' }) }],
      buildings,
    )
    expect(groups[0].key).toBe(STANDALONE_BUILDING_KEY)
  })
})

describe('shouldUseBuildingGroupChrome', () => {
  it('is false for a single rent-only unit in a building', () => {
    const group = groupPortfolioByBuilding(
      [{ property: prop({ id: 'p1', title: 'Only', buildingId: 'bld-skyline' }) }],
      buildings,
    )[0]
    expect(shouldUseBuildingGroupChrome(group)).toBe(false)
  })

  it('is false for two rent-only units in the same building', () => {
    const group = groupPortfolioByBuilding(
      [
        { property: prop({ id: 'p1', title: 'A', buildingId: 'bld-skyline' }) },
        { property: prop({ id: 'p2', title: 'B', buildingId: 'bld-skyline' }) },
      ],
      buildings,
    )[0]
    expect(shouldUseBuildingGroupChrome(group)).toBe(false)
  })

  it('is true for one sale and one rent in the same building', () => {
    const group = groupPortfolioByBuilding(
      [
        {
          property: prop({
            id: 'p1',
            title: 'Sale unit',
            buildingId: 'bld-skyline',
            listingMode: 'sale',
            price: 1_850_000,
            rent: null,
          }),
        },
        {
          property: prop({
            id: 'p2',
            title: 'Rent unit',
            buildingId: 'bld-skyline',
            listingMode: 'rent',
            rent: 11_800,
            price: null,
          }),
        },
      ],
      buildings,
    )[0]
    expect(shouldUseBuildingGroupChrome(group)).toBe(true)
  })

  it('is true for a single listing with rent and sale on one row', () => {
    const group = groupPortfolioByBuilding(
      [
        {
          property: prop({
            id: 'p1',
            title: 'Dual',
            buildingId: 'bld-skyline',
            listingMode: 'both',
          }),
        },
      ],
      buildings,
    )[0]
    expect(shouldUseBuildingGroupChrome(group)).toBe(true)
  })
})

describe('sortPortfolioItemsForSaleRentGroup', () => {
  it('orders rent before sale', () => {
    const rows = [
      {
        property: prop({
          id: 'p1',
          title: 'Sale',
          listingMode: 'sale',
          price: 1_000_000,
          rent: null,
        }),
      },
      {
        property: prop({
          id: 'p2',
          title: 'Rent',
          listingMode: 'rent',
          rent: 10_000,
          price: null,
        }),
      },
    ]
    const sorted = sortPortfolioItemsForSaleRentGroup(rows)
    expect(sorted.map((r) => r.property.id)).toEqual(['p2', 'p1'])
  })
})

describe('siblingUnitsInBuilding', () => {
  it('returns other properties on the same building', () => {
    const all = [
      prop({ id: 'p1', title: 'A', buildingId: 'bld-skyline' }),
      prop({ id: 'p2', title: 'B', buildingId: 'bld-skyline' }),
      prop({ id: 'p3', title: 'C', buildingId: 'bld-other' }),
    ]
    expect(siblingUnitsInBuilding(all, 'bld-skyline', 'p1').map((p) => p.id)).toEqual(['p2'])
    expect(siblingUnitsInBuilding(all, null, 'p1')).toEqual([])
  })
})

describe('filters', () => {
  it('matches building and occupancy filters', () => {
    const p = prop({ id: 'p1', title: 'A', buildingId: 'bld-skyline' })
    expect(propertyMatchesBuildingFilter(p, 'all')).toBe(true)
    expect(propertyMatchesBuildingFilter(p, 'bld-skyline')).toBe(true)
    expect(propertyMatchesBuildingFilter(p, STANDALONE_BUILDING_KEY)).toBe(false)
    expect(propertyMatchesOccupancyFilter('VACANT', 'VACANT')).toBe(true)
    expect(propertyMatchesOccupancyFilter(null, 'unknown')).toBe(true)
    expect(propertyMatchesOccupancyFilter('OCCUPIED', 'unknown')).toBe(false)
  })

  it('lists buildings in scope', () => {
    const scoped = [
      prop({ id: 'p1', title: 'A', buildingId: 'bld-skyline' }),
      prop({ id: 'p2', title: 'B', buildingId: null }),
    ]
    expect(buildingsInScope(scoped, buildings).map((b) => b.id)).toEqual(['bld-skyline'])
  })
})
