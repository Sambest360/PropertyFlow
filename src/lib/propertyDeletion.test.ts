import { describe, expect, it } from 'vitest'
import {
  canDeletePropertyRole,
  getPropertyDeleteBlockReason,
  propertyHasOccupant,
} from './propertyDeletion'
import type { Application, PropertyAsset, Tenancy } from '../types/domain'

function property(overrides: Partial<PropertyAsset> = {}): PropertyAsset {
  return {
    id: 'p1',
    agencyId: 'ag1',
    landlordId: 'u1',
    agentId: null,
    title: 'Flat 1',
    type: 'Apartment',
    status: 'Published',
    listingMode: 'rent',
    price: null,
    rent: 8000,
    beds: 2,
    baths: 1,
    parking: 0,
    area: 70,
    city: 'PE',
    suburb: 'Central',
    address: '1 Main',
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

describe('propertyDeletion', () => {
  it('allows agency admin roles to delete', () => {
    expect(canDeletePropertyRole('agent_admin')).toBe(true)
    expect(canDeletePropertyRole('client_admin')).toBe(true)
    expect(canDeletePropertyRole('ground_agent')).toBe(false)
  })

  it('blocks delete when an active tenancy exists', () => {
    const tenancies: Tenancy[] = [
      {
        id: 't1',
        agencyId: 'ag1',
        propertyId: 'p1',
        landlordId: 'u1',
        agentId: null,
        applicationId: null,
        tenantUserId: 'u2',
        tenantName: 'Sam',
        tenantEmail: 'sam@test.com',
        startDate: '2026-01-01',
        endDate: null,
        rent: 8000,
        deposit: 16000,
        status: 'Active',
        keyCollection: {
          location: 'Office',
          instructions: '',
          contactName: '',
          contactPhone: '',
        },
      },
    ]

    expect(propertyHasOccupant('p1', tenancies)).toBe(true)
    expect(getPropertyDeleteBlockReason(property(), tenancies)).toMatch(/tenancy/i)
  })

  it('allows delete when no occupant', () => {
    const apps: Application[] = [
      {
        id: 'a1',
        agencyId: 'ag1',
        propertyId: 'p1',
        agentId: null,
        applicantUserId: 'u2',
        applicantName: 'Sam',
        email: 'sam@test.com',
        phone: '',
        type: 'Rental',
        stage: 'Under Review',
        progress: 20,
        income: 0,
        employment: '',
        creditCheck: 'Not Started',
        creditConsent: false,
        documents: [],
        docs: [],
        viewingSlotId: null,
        notes: '',
        submittedAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ]

    expect(getPropertyDeleteBlockReason(property(), [], apps)).toBeNull()
  })
})
