import { describe, expect, it } from 'vitest'
import type { PropertyAsset } from '../types/domain'
import {
  portfolioPropertyMatchesSearchQuery,
  propertiesListQueryFromParams,
  withPropertiesListQuery,
} from './propertiesPortfolioSearch'

function prop(partial: Partial<PropertyAsset> & Pick<PropertyAsset, 'id' | 'title'>): PropertyAsset {
  return {
    agencyId: 'ag-horizon',
    landlordId: 'u-owner1',
    agentId: null,
    type: 'House',
    status: 'Published',
    listingMode: 'rent',
    price: null,
    rent: 10_000,
    beds: 3,
    baths: 2,
    parking: 1,
    area: 120,
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

describe('propertiesListQueryFromParams', () => {
  it('reads q from the properties list URL (FW-16 global search)', () => {
    expect(propertiesListQueryFromParams(new URLSearchParams('q=Walmer'))).toBe('Walmer')
    expect(propertiesListQueryFromParams(new URLSearchParams())).toBe('')
  })

  it('sets and clears q while preserving other params', () => {
    const base = new URLSearchParams('agencyId=ag-1')
    const withQ = withPropertiesListQuery(base, 'Walmer')
    expect(withQ.get('q')).toBe('Walmer')
    expect(withQ.get('agencyId')).toBe('ag-1')
    expect(withPropertiesListQuery(withQ, '  ').has('q')).toBe(false)
  })
})

describe('portfolioPropertyMatchesSearchQuery', () => {
  it('matches suburb and address (Walmer regression)', () => {
    const walmer = {
      property: prop({
        id: 'PR-1001',
        title: 'Family home',
        suburb: 'Walmer',
        address: '14 Heugh Road, Walmer',
      }),
      buildingName: null,
      unitNumber: null,
    }
    const humewood = {
      property: prop({ id: 'PR-1002', title: 'Beach flat', suburb: 'Humewood' }),
      buildingName: null,
      unitNumber: null,
    }
    expect(portfolioPropertyMatchesSearchQuery(walmer, 'Walmer')).toBe(true)
    expect(portfolioPropertyMatchesSearchQuery(humewood, 'Walmer')).toBe(false)
  })

  it('returns all rows when query is empty', () => {
    const item = {
      property: prop({ id: 'PR-x', title: 'Any' }),
      buildingName: null,
      unitNumber: null,
    }
    expect(portfolioPropertyMatchesSearchQuery(item, '')).toBe(true)
    expect(portfolioPropertyMatchesSearchQuery(item, '   ')).toBe(true)
  })
})
