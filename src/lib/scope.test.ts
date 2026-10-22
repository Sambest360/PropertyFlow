import { describe, expect, it } from 'vitest'
import {
  allowedPropertyIds,
  buildPropertyScope,
  canMutateProperty,
  dealInScope,
  paymentInScope,
  resolveContractorPropertyIds,
  resolveTenantPropertyIds,
  ticketInScope,
  threadInScope,
} from './scope'

const properties = [
  { id: 'p-a1', agencyId: 'ag-a', agentId: 'u-james', landlordId: 'u-ll-a' },
  { id: 'p-a2', agencyId: 'ag-a', agentId: 'u-priya', landlordId: 'u-ll-a' },
  { id: 'p-a3', agencyId: 'ag-a', agentId: 'u-james', landlordId: 'u-ll-b' },
  { id: 'p-b1', agencyId: 'ag-b', agentId: 'u-zane', landlordId: 'u-ll-c' },
]

const baseStaff = {
  userId: 'u-james',
  agencyId: 'ag-a',
  agencySuspended: false,
}

describe('resolveTenantPropertyIds', () => {
  it('includes applications and tenancies, excludes blocked', () => {
    const ids = resolveTenantPropertyIds({
      userId: 'u-t',
      viewerEmail: 't@x.com',
      blockedPropertyIds: new Set(['p-block']),
      applications: [
        { applicantUserId: 'u-t', email: 't@x.com', propertyId: 'p-app', stage: 'Under Review' },
        { applicantUserId: 'u-t', email: 't@x.com', propertyId: 'p-block', stage: 'Blocked' },
        { applicantUserId: 'u-other', email: 'o@x.com', propertyId: 'p-other', stage: 'Approved' },
      ],
      tenancies: [
        { tenantUserId: 'u-t', propertyId: 'p-lease' },
        { tenantUserId: 'u-other', propertyId: 'p-x' },
      ],
    })
    expect([...ids].sort()).toEqual(['p-app', 'p-lease'])
  })
})

describe('resolveContractorPropertyIds', () => {
  const roster = [
    { agencyId: 'ag-a', contractorUserId: 'u-c', status: 'approved' as const },
    { agencyId: 'ag-b', contractorUserId: 'u-c', status: 'approved' as const },
  ]

  it('includes assigned and roster-approved claimable open jobs', () => {
    const ids = resolveContractorPropertyIds(
      [
        { contractorId: 'u-c', propertyId: 'p-mine', agencyId: 'ag-a', status: 'In Progress', assignedAgentId: null },
        { contractorId: null, propertyId: 'p-open', agencyId: 'ag-a', status: 'Requested', assignedAgentId: null },
        { contractorId: null, propertyId: 'p-done', agencyId: 'ag-a', status: 'Completed', assignedAgentId: null },
        { contractorId: null, propertyId: 'p-other-ag', agencyId: 'ag-b', status: 'Requested', assignedAgentId: null },
        { contractorId: null, propertyId: 'p-no-roster', agencyId: 'ag-z', status: 'Requested', assignedAgentId: null },
      ],
      'u-c',
      roster,
    )
    expect([...ids].sort()).toEqual(['p-mine', 'p-open', 'p-other-ag'])
  })
})

describe('allowedPropertyIds / buildPropertyScope', () => {
  it('gives principals the full agency book', () => {
    const scope = buildPropertyScope(
      { role: 'client_admin', userId: 'u-admin', agencyId: 'ag-a', agencySuspended: false },
      { properties },
    )
    expect(scope.agencyWide).toBe(true)
    expect([...scope.allowedPropertyIds].sort()).toEqual(['p-a1', 'p-a2', 'p-a3'])
  })

  it('limits field agents to assigned listings (+ ticket assignee extras)', () => {
    const scope = buildPropertyScope(
      { ...baseStaff, role: 'ground_agent' },
      {
        properties,
        tickets: [
          {
            contractorId: null,
            propertyId: 'p-a2',
            agencyId: 'ag-a',
            status: 'Requested',
            assignedAgentId: 'u-james',
          },
        ],
      },
    )
    expect(scope.agencyWide).toBe(false)
    expect([...scope.allowedPropertyIds].sort()).toEqual(['p-a1', 'p-a2', 'p-a3'])
  })

  it('limits landlords to owned properties across agents', () => {
    const ids = allowedPropertyIds(
      buildPropertyScope(
        { role: 'landlord', userId: 'u-ll-a', agencyId: 'ag-a', agencySuspended: false },
        { properties },
      ).viewer,
      { properties },
    )
    expect([...ids].sort()).toEqual(['p-a1', 'p-a2'])
  })
})

describe('ticketInScope / dealInScope / paymentInScope / threadInScope', () => {
  const agentScope = buildPropertyScope(
    { ...baseStaff, role: 'ground_agent' },
    { properties },
  )

  it('allows ticket on assigned property or direct assignee', () => {
    expect(
      ticketInScope(agentScope, {
        propertyId: 'p-a1',
        assignedAgentId: null,
        contractorId: null,
        agencyId: 'ag-a',
      }),
    ).toBe(true)
    expect(
      ticketInScope(agentScope, {
        propertyId: 'p-a2',
        assignedAgentId: 'u-james',
        contractorId: null,
        agencyId: 'ag-a',
      }),
    ).toBe(true)
    expect(
      ticketInScope(agentScope, {
        propertyId: 'p-a2',
        assignedAgentId: 'u-priya',
        contractorId: null,
        agencyId: 'ag-a',
      }),
    ).toBe(false)
  })

  it('allows deals on book or when agent owns the row', () => {
    expect(
      dealInScope(agentScope, { propertyId: 'p-a1', agentId: 'u-priya', agencyId: 'ag-a' }),
    ).toBe(true)
    expect(
      dealInScope(agentScope, { propertyId: 'p-a2', agentId: 'u-james', agencyId: 'ag-a' }),
    ).toBe(true)
    expect(
      dealInScope(agentScope, { propertyId: 'p-a2', agentId: 'u-priya', agencyId: 'ag-a' }),
    ).toBe(false)
  })

  it('denies unassigned off-book deals for field agents (strict assignment)', () => {
    expect(
      dealInScope(agentScope, { propertyId: 'p-a2', agentId: null, agencyId: 'ag-a' }),
    ).toBe(false)
    expect(
      dealInScope(agentScope, { propertyId: 'p-a2', agentId: '', agencyId: 'ag-a' }),
    ).toBe(false)
    expect(
      dealInScope(agentScope, { propertyId: 'p-b1', agentId: null, agencyId: 'ag-b' }),
    ).toBe(false)
  })

  it('scopes payments for field agents to their property book', () => {
    expect(
      paymentInScope(agentScope, {
        propertyId: 'p-a1',
        agencyId: 'ag-a',
        partyUserId: null,
        partyName: 'X',
        landlordVisible: true,
      }),
    ).toBe(true)
    expect(
      paymentInScope(agentScope, {
        propertyId: 'p-a2',
        agencyId: 'ag-a',
        partyUserId: null,
        partyName: 'X',
        landlordVisible: true,
      }),
    ).toBe(false)
  })

  it('landlords see participant threads; field agents need property link', () => {
    const landlordScope = buildPropertyScope(
      { role: 'landlord', userId: 'u-ll-a', agencyId: 'ag-a', agencySuspended: false },
      { properties },
    )
    expect(
      threadInScope(landlordScope, {
        agencyId: 'ag-a',
        propertyId: 'p-a1',
        participantIds: ['u-ll-a', 'u-tenant'],
      }),
    ).toBe(true)
    expect(
      threadInScope(landlordScope, {
        agencyId: 'ag-a',
        propertyId: 'p-a1',
        participantIds: ['u-other'],
      }),
    ).toBe(false)
    expect(
      threadInScope(agentScope, {
        agencyId: 'ag-a',
        propertyId: 'p-a2',
        participantIds: [],
      }),
    ).toBe(false)
    expect(
      threadInScope(agentScope, {
        agencyId: 'ag-a',
        propertyId: 'p-a1',
        participantIds: [],
      }),
    ).toBe(true)
  })

  it('null-agency tenant keeps deals on their tenant book without canSeeAgency', () => {
    const tenantScope = buildPropertyScope(
      { role: 'tenant', userId: 'u-t', agencyId: null, agencySuspended: false },
      {
        properties,
        applications: [
          {
            applicantUserId: 'u-t',
            email: 't@x.com',
            propertyId: 'p-a1',
            stage: 'Under Review',
          },
        ],
      },
    )
    expect(
      dealInScope(tenantScope, { propertyId: 'p-a1', agentId: 'u-james', agencyId: 'ag-a' }),
    ).toBe(true)
    expect(
      dealInScope(tenantScope, { propertyId: 'p-a2', agentId: null, agencyId: 'ag-a' }),
    ).toBe(false)
  })

})

describe('canMutateProperty', () => {
  it('refuses mutation outside the book', () => {
    const scope = buildPropertyScope(
      { ...baseStaff, role: 'ground_agent' },
      { properties },
    )
    expect(canMutateProperty(scope, properties[0], 'p-a1')).toBe(true)
    expect(canMutateProperty(scope, properties[1], 'p-a2')).toBe(false)
    expect(canMutateProperty(scope, null, 'p-a1')).toBe(false)
  })

  // Test cases for the new access rules
  describe('new access rules with specific property set', () => {
    const testProperties = [
      // own: agent's own property
      { id: 'p-own', agencyId: 'ag-a', agentId: 'u-viewer', landlordId: 'u-ll' },
      // other-agent: another agent's property in same agency
      { id: 'p-other-agent', agencyId: 'ag-a', agentId: 'u-other', landlordId: 'u-ll' },
      // unassigned: null agentId in same agency
      { id: 'p-unassigned', agencyId: 'ag-a', agentId: null, landlordId: 'u-ll' },
      // other-agency-unassigned: null agentId in different agency
      { id: 'p-other-agency-unassigned', agencyId: 'ag-b', agentId: null, landlordId: 'u-ll' },
    ]

    it('ground_agent: allowedPropertyIds = {own} only', () => {
      const scope = buildPropertyScope(
        { role: 'ground_agent', userId: 'u-viewer', agencyId: 'ag-a', agencySuspended: false },
        { properties: testProperties },
      )
      expect(scope.agencyWide).toBe(false)
      expect([...scope.allowedPropertyIds]).toEqual(['p-own'])
    })

    it('agent: allowedPropertyIds = {own} only', () => {
      const scope = buildPropertyScope(
        { role: 'agent', userId: 'u-viewer', agencyId: 'ag-a', agencySuspended: false },
        { properties: testProperties },
      )
      expect(scope.agencyWide).toBe(false)
      expect([...scope.allowedPropertyIds]).toEqual(['p-own'])
    })

    it('client_admin: {own, other-agent, unassigned} and NOT other-agency', () => {
      const scope = buildPropertyScope(
        { role: 'client_admin', userId: 'u-viewer', agencyId: 'ag-a', agencySuspended: false },
        { properties: testProperties },
      )
      expect(scope.agencyWide).toBe(true)
      const allowed = [...scope.allowedPropertyIds].sort()
      expect([...allowed].sort()).toEqual(['p-own', 'p-other-agent', 'p-unassigned'].sort())
      expect(allowed).not.toContain('p-other-agency-unassigned')
    })

    it('agent_admin: {own, other-agent, unassigned} and NOT other-agency', () => {
      const scope = buildPropertyScope(
        { role: 'agent_admin', userId: 'u-viewer', agencyId: 'ag-a', agencySuspended: false },
        { properties: testProperties },
      )
      expect(scope.agencyWide).toBe(true)
      const allowed = [...scope.allowedPropertyIds].sort()
      expect([...allowed].sort()).toEqual(['p-own', 'p-other-agent', 'p-unassigned'].sort())
      expect(allowed).not.toContain('p-other-agency-unassigned')
    })

    it('super_admin: all four', () => {
      const scope = buildPropertyScope(
        { role: 'super_admin', userId: 'u-viewer', agencyId: null, agencySuspended: false },
        { properties: testProperties },
      )
      expect(scope.agencyWide).toBe(true)
      const allowed = [...scope.allowedPropertyIds].sort()
      expect(allowed).toEqual([
        'p-own',
        'p-other-agent',
        'p-unassigned',
        'p-other-agency-unassigned',
      ].sort())
    })

    it('ground_agent: dealInScope for application on unassigned property is false', () => {
      const scope = buildPropertyScope(
        { role: 'ground_agent', userId: 'u-viewer', agencyId: 'ag-a', agencySuspended: false },
        { properties: testProperties },
      )
      expect(
        dealInScope(scope, {
          propertyId: 'p-unassigned',
          agentId: null,
          agencyId: 'ag-a',
        }),
      ).toBe(false)
      expect(
        dealInScope(scope, {
          propertyId: 'p-own',
          agentId: 'u-viewer',
          agencyId: 'ag-a',
        }),
      ).toBe(true)
    })

    it('agent: dealInScope for application on unassigned property is false', () => {
      const scope = buildPropertyScope(
        { role: 'agent', userId: 'u-viewer', agencyId: 'ag-a', agencySuspended: false },
        { properties: testProperties },
      )
      expect(
        dealInScope(scope, {
          propertyId: 'p-unassigned',
          agentId: null,
          agencyId: 'ag-a',
        }),
      ).toBe(false)
      expect(
        dealInScope(scope, {
          propertyId: 'p-own',
          agentId: 'u-viewer',
          agencyId: 'ag-a',
        }),
      ).toBe(true)
    })
  })
})
