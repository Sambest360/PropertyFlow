import { describe, expect, it } from 'vitest'
import {
  isTenantOccupancyPermission,
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
