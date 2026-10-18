import { describe, expect, it } from 'vitest'
import {
  canDeletePropertyByRule,
  canDeleteStoredProperty,
  canOpenPropertyArchive,
  getPropertyDeleteBlockReason,
  propertyHasOccupant,
} from './propertyDeletion'
import type { Application, PropertyAsset, Tenancy } from '../types/domain'

const stored = { agencyId: 'ag1', agentId: 'fa1' as string | null }

function property(overrides: Partial<PropertyAsset> = {}): PropertyAsset {
  return {
    id: 'p1',
    agencyId: 'ag1',
    landlordId: 'u1',
    agentId: 'fa1',
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

describe('canDeletePropertyByRule', () => {
  it('super_admin can delete any stored row', () => {
    expect(
      canDeletePropertyByRule(
        { role: 'super_admin', userId: 'sa', agencyId: null },
        { agencyId: 'ag-other', agentId: null },
      ),
    ).toBe(true)
  })

  it('agency admins only within their agency', () => {
    const admin = { role: 'agent_admin' as const, userId: 'adm', agencyId: 'ag1' }
    expect(canDeletePropertyByRule(admin, stored)).toBe(true)
    expect(canDeletePropertyByRule(admin, { agencyId: 'ag2', agentId: null })).toBe(false)
    expect(canDeletePropertyByRule({ ...admin, role: 'client_admin' }, stored)).toBe(true)
  })

  it('ground_agent and candidate agent only when assigned', () => {
    const fa = { role: 'ground_agent' as const, userId: 'fa1', agencyId: 'ag1' }
    expect(canDeletePropertyByRule(fa, stored)).toBe(true)
    expect(canDeletePropertyByRule(fa, { agencyId: 'ag1', agentId: null })).toBe(false)
    expect(canDeletePropertyByRule(fa, { agencyId: 'ag1', agentId: 'other' })).toBe(false)
    expect(
      canDeletePropertyByRule({ role: 'agent', userId: 'fa1', agencyId: 'ag1' }, stored),
    ).toBe(true)
  })

  it('refuses portal roles', () => {
    expect(
      canDeletePropertyByRule(
        { role: 'landlord', userId: 'll', agencyId: 'ag1' },
        stored,
      ),
    ).toBe(false)
    expect(
      canDeletePropertyByRule({ role: 'tenant', userId: 't', agencyId: null }, stored),
    ).toBe(false)
    expect(
      canDeletePropertyByRule({ role: 'contractor', userId: 'c', agencyId: 'ag1' }, stored),
    ).toBe(false)
  })

  it('negative: other agency, other agent, wrong role', () => {
    expect(
      canDeletePropertyByRule(
        { role: 'ground_agent', userId: 'fa1', agencyId: 'ag1' },
        { agencyId: 'ag2', agentId: 'fa1' },
      ),
    ).toBe(false)
    expect(
      canDeletePropertyByRule(
        { role: 'ground_agent', userId: 'fa1', agencyId: 'ag1' },
        { agencyId: 'ag1', agentId: 'fa2' },
      ),
    ).toBe(false)
    expect(
      canDeletePropertyByRule(
        { role: 'landlord', userId: 'fa1', agencyId: 'ag1' },
        stored,
      ),
    ).toBe(false)
  })

  it('canDeleteStoredProperty delegates to rule', () => {
    expect(
      canDeleteStoredProperty({ role: 'agent_admin', userId: 'a', agencyId: 'ag1' }, property()),
    ).toBe(true)
  })

  it('canOpenPropertyArchive includes staff delete roles', () => {
    expect(canOpenPropertyArchive('agent')).toBe(true)
    expect(canOpenPropertyArchive('landlord')).toBe(false)
  })
})

describe('propertyHasOccupant / block reason', () => {
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
