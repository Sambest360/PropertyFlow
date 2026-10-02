import { describe, expect, it } from 'vitest'
import {
  isTenantOccupancyPermission,
  ownTenancyForApplication,
  tenantHasApprovedOccupancy,
} from './tenantOccupancy'
import type { Application, Tenancy } from '../types/domain'

const user = { id: 'u-tenant', email: 'tenant@test.com', name: 'Tenant' }

function app(partial: Partial<Application> & Pick<Application, 'id' | 'stage'>): Application {
  return {
    agencyId: 'ag-a',
    propertyId: 'p-1',
    agentId: null,
    applicantUserId: 'u-tenant',
    applicantName: 'Tenant',
    email: 'tenant@test.com',
    phone: '',
    type: 'Rental',
    progress: 50,
    income: 0,
    employment: '',
    creditCheck: 'Pending',
    creditConsent: false,
    documents: [],
    docs: [],
    viewingSlotId: null,
    notes: '',
    createdAt: '2026-01-01',
    workflowStatus: undefined,
    ...partial,
  }
}

describe('tenantHasApprovedOccupancy', () => {
  it('denies applicants still under review', () => {
    expect(
      tenantHasApprovedOccupancy(
        [app({ id: 'a1', stage: 'Under Review' }), app({ id: 'a2', stage: 'Documents Pending' })],
        [],
        user,
      ),
    ).toBe(false)
  })

  it('unlocks after application approval', () => {
    expect(
      tenantHasApprovedOccupancy([app({ id: 'a1', stage: 'Approved' })], [], user),
    ).toBe(true)
    expect(
      tenantHasApprovedOccupancy([app({ id: 'a1', stage: 'Active Tenancy' })], [], user),
    ).toBe(true)
  })

  it('unlocks after conditional (agent-authority) approval — P0-3', () => {
    expect(
      tenantHasApprovedOccupancy([app({ id: 'a1', stage: 'Conditionally approved' })], [], user),
    ).toBe(true)
  })

  it('unlocks from an active tenancy even without an approved application row', () => {
    const tenancy = {
      id: 't1',
      agencyId: 'ag-a',
      propertyId: 'p-1',
      landlordId: 'u-ll',
      agentId: null,
      applicationId: null,
      tenantUserId: 'u-tenant',
      tenantName: 'Tenant',
      tenantEmail: 'tenant@test.com',
      startDate: '2026-01-01',
      endDate: '2027-01-01',
      rent: 10000,
      deposit: 20000,
      status: 'Active',
      keyCollection: {
        location: '',
        instructions: '',
        contactName: '',
        contactPhone: '',
      },
    } satisfies Tenancy
    expect(tenantHasApprovedOccupancy([], [tenancy], user)).toBe(true)
  })

  it('P0-7: unlocks from workflow status conditionally_approved', () => {
    expect(
      tenantHasApprovedOccupancy(
        [app({ id: 'a1', stage: 'Application started', workflowStatus: 'conditionally_approved' })],
        [],
        user,
      ),
    ).toBe(true)
  })

  it('P0-7: unlocks from workflow status deposit_invoice_sent', () => {
    expect(
      tenantHasApprovedOccupancy(
        [app({ id: 'a1', stage: 'Application started', workflowStatus: 'deposit_invoice_sent' })],
        [],
        user,
      ),
    ).toBe(true)
  })

  it('P0-7: unlocks from workflow status active_tenancy', () => {
    expect(
      tenantHasApprovedOccupancy(
        [app({ id: 'a1', stage: 'Application started', workflowStatus: 'active_tenancy' })],
        [],
        user,
      ),
    ).toBe(true)
  })


  it('Mode A Sipho: unlocks from stage Deposit paid (lowercase p)', () => {
    expect(
      tenantHasApprovedOccupancy([app({ id: 'a1', stage: 'Deposit paid' })], [], user),
    ).toBe(true)
  })

  it('Mode A Sipho: unlocks from workflow status deposit_paid', () => {
    expect(
      tenantHasApprovedOccupancy(
        [app({ id: 'a1', stage: 'Application started', workflowStatus: 'deposit_paid' })],
        [],
        user,
      ),
    ).toBe(true)
  })

  it('ignores other people’s applications', () => {
    expect(
      tenantHasApprovedOccupancy(
        [app({ id: 'a1', stage: 'Approved', applicantUserId: 'u-other', email: 'other@test.com' })],
        [],
        user,
      ),
    ).toBe(false)
  })
})

describe('isTenantOccupancyPermission', () => {
  it('flags payments and maintenance as occupancy-gated', () => {
    expect(isTenantOccupancyPermission('payments.view')).toBe(true)
    expect(isTenantOccupancyPermission('maintenance.manage')).toBe(true)
    expect(isTenantOccupancyPermission('portal.tenant')).toBe(false)
  })
})

function tenancyRow(partial: Partial<Tenancy> & Pick<Tenancy, 'id'>): Tenancy {
  return {
    agencyId: 'ag-a',
    propertyId: 'p-1',
    landlordId: 'u-ll',
    agentId: null,
    applicationId: 'APP-it4z5k',
    tenantUserId: 'u-tenant',
    tenantName: 'Tenant',
    tenantEmail: 'tenant@test.com',
    startDate: '2026-10-01',
    endDate: '2027-10-01',
    rent: 8500,
    deposit: 17000,
    status: 'Pending Move-In',
    keyCollection: {
      location: '',
      instructions: '',
      contactName: '',
      contactPhone: '',
    },
    ...partial,
  }
}

describe('ownTenancyForApplication', () => {
  it('joins own APP→TN by applicationId + tenantUserId', () => {
    const tn = tenancyRow({ id: 'TN-4050qwl', applicationId: 'APP-it4z5k', tenantUserId: 'u-tenant' })
    expect(ownTenancyForApplication([tn], 'APP-it4z5k', user)?.id).toBe('TN-4050qwl')
  })

  it('joins orphan TN (null tenantUserId) for own applicationId', () => {
    const tn = tenancyRow({ id: 'TN-orphan', tenantUserId: null })
    expect(ownTenancyForApplication([tn], 'APP-it4z5k', user)?.id).toBe('TN-orphan')
  })

  it('fail-closed: never returns another tenant\'s TN', () => {
    const tn = tenancyRow({ id: 'TN-other', tenantUserId: 'u-other' })
    expect(ownTenancyForApplication([tn], 'APP-it4z5k', user)).toBeUndefined()
  })

  it('fail-closed: ignores TN linked to a different application', () => {
    const tn = tenancyRow({ id: 'TN-4050qwl', applicationId: 'APP-other' })
    expect(ownTenancyForApplication([tn], 'APP-it4z5k', user)).toBeUndefined()
  })
})
