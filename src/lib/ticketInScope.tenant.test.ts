import { describe, expect, it } from 'vitest'
import { buildPropertyScope, ticketInScope } from './scope'
import { linkableTenancies } from '../components/maintenance/MaintenanceTicketForm'
import type { Tenancy } from '../types/domain'

const properties = [
  { id: 'p-1', agencyId: 'ag-a', agentId: 'u-agent', landlordId: 'u-ll' },
  { id: 'p-2', agencyId: 'ag-a', agentId: 'u-agent', landlordId: 'u-ll' },
]

describe('ticketInScope: tenants are not gated on canSeeAgency', () => {
  const scopeFor = (agencyId: string | null) =>
    buildPropertyScope(
      { role: 'tenant', userId: 'u-t', agencyId, agencySuspended: false },
      { properties, tenancies: [{ tenantUserId: 'u-t', propertyId: 'p-1' }] } as never,
    )
  const t = (propertyId: string) => ({ propertyId, agencyId: 'ag-a', assignedAgentId: null, contractorId: null })

  it('a no-agency tenant has their own property in scope', () => {
    expect(ticketInScope(scopeFor(null), t('p-1'))).toBe(true)
  })
  it('but nothing outside their book', () => {
    expect(ticketInScope(scopeFor(null), t('p-2'))).toBe(false)
  })
  it('a landlord without an agency is still gated', () => {
    const scope = buildPropertyScope(
      { role: 'landlord', userId: 'u-ll', agencyId: null, agencySuspended: false },
      { properties } as never,
    )
    expect(ticketInScope(scope, t('p-1'))).toBe(false)
  })
})

describe('staff tenancy select: Active and Pending Move-In only', () => {
  it('offers only linkable tenancies on the chosen property', () => {
    const rows = [
      { id: 'L-a', propertyId: 'p-1', status: 'Active' },
      { id: 'L-p', propertyId: 'p-1', status: 'Pending Move-In' },
      { id: 'L-e', propertyId: 'p-1', status: 'Ended' },
      { id: 'L-o', propertyId: 'p-2', status: 'Active' },
    ] as Tenancy[]
    expect(linkableTenancies(rows, 'p-1').map((r) => r.id)).toEqual(['L-a', 'L-p'])
  })
})
