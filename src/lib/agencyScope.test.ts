import { describe, expect, it } from 'vitest'
import {
  canAccessProperty,
  canImpersonateTarget,
  canSeeAgency,
  canSeeAgentRecord,
  canSeeLandlordAsset,
  filterScopedPropertyDocuments,
  pickAgencyId,
  reconcileAgencyIdSpace,
  resolveViewerAgencyId,
} from './agencyScope'
import { CLIENT_TO_AGENCY } from './supabase/idMap'

const propA = {
  agencyId: 'ag-a',
  agentId: 'u-agent-a',
  landlordId: 'u-ll-a',
}

describe('reconcileAgencyIdSpace (FW-14 / FW-15)', () => {
  const clientUuid = '7515d803-1111-4111-8111-111111111111'

  it('drops duplicate UUID agency rows and remaps user agencyId to ag-*', () => {
    const { agencies, users } = reconcileAgencyIdSpace(
      [
        {
          id: 'ag-vision',
          name: 'Vision',
          slug: 'vision',
          city: '',
          status: 'Active',
          createdAt: '2026-01-01',
          enabledPermissions: [],
        },
        {
          id: clientUuid,
          name: 'Vision',
          slug: 'vision',
          city: '',
          status: 'Active',
          createdAt: '2026-01-01',
          enabledPermissions: [],
        },
      ],
      [
        {
          id: 'u-ll',
          name: 'Pat',
          email: 'p@t.test',
          role: 'landlord',
          agencyId: clientUuid,
          active: true,
          verification: { status: 'pending' },
        },
      ],
    )
    expect(agencies.map((a) => a.id)).toEqual(['ag-vision'])
    expect(users[0]?.agencyId).toBe('ag-vision')
  })
})

describe('pickAgencyId / resolveViewerAgencyId (FW-19 A07)', () => {
  const clientUuid = '7515d803-1111-4111-8111-111111111111'

  it('prefers bootstrap ag-* when session still has client UUID', () => {
    expect(pickAgencyId(clientUuid, 'ag-vision')).toBe('ag-vision')
    expect(pickAgencyId('ag-vision', clientUuid)).toBe('ag-vision')
  })

  it('resolves viewer agency from single scoped agency row', () => {
    expect(
      resolveViewerAgencyId(clientUuid, {
        agencies: [{ id: 'ag-vision' }],
        bootstrapAgencyId: 'ag-vision',
      }),
    ).toBe('ag-vision')
  })

  it('lets agency admin see staff in FE id space', () => {
    expect(
      canSeeAgency('agent_admin', clientUuid, false, 'ag-vision', {
        agencies: [{ id: 'ag-vision' }],
        bootstrapAgencyId: 'ag-vision',
      }),
    ).toBe(true)
  })

  it('matches resource agency UUID to viewer FE id when seed map links them (FW-17)', () => {
    const seedUuid = Object.keys(CLIENT_TO_AGENCY)[0]
    if (!seedUuid) return
    const fe = CLIENT_TO_AGENCY[seedUuid]
    expect(
      canSeeAgency('client_admin', fe, false, seedUuid, {
        agencies: [{ id: fe }],
        bootstrapAgencyId: fe,
      }),
    ).toBe(true)
  })
})

describe('canSeeAgency', () => {
  it('lets super_admin see any agency resource', () => {
    expect(canSeeAgency('super_admin', null, false, 'ag-x')).toBe(true)
    expect(canSeeAgency('super_admin', 'ag-a', true, 'ag-b')).toBe(true)
  })

  it('blocks staff with no agency or a suspended agency', () => {
    expect(canSeeAgency('ground_agent', null, false, 'ag-a')).toBe(false)
    expect(canSeeAgency('client_admin', 'ag-a', true, 'ag-a')).toBe(false)
  })

  it('allows only the viewer’s own agency', () => {
    expect(canSeeAgency('agent_admin', 'ag-a', false, 'ag-a')).toBe(true)
    expect(canSeeAgency('agent_admin', 'ag-a', false, 'ag-b')).toBe(false)
  })
})

describe('canSeeAgentRecord', () => {
  it('principals and agency admins see every agent book', () => {
    expect(canSeeAgentRecord('client_admin', 'u-1', 'u-other')).toBe(true)
    expect(canSeeAgentRecord('agent_admin', 'u-1', 'u-other')).toBe(true)
    expect(canSeeAgentRecord('super_admin', 'u-1', 'u-other')).toBe(true)
  })

  it('field agents only see their own assignments', () => {
    expect(canSeeAgentRecord('ground_agent', 'u-me', 'u-me')).toBe(true)
    expect(canSeeAgentRecord('ground_agent', 'u-me', 'u-other')).toBe(false)
    expect(canSeeAgentRecord('agent', 'u-me', 'u-other')).toBe(false)
  })

  it('field agents do not see unassigned listings (strict assignment)', () => {
    expect(canSeeAgentRecord('ground_agent', 'u-me', null)).toBe(false)
    expect(canSeeAgentRecord('ground_agent', 'u-me', '')).toBe(false)
    expect(canSeeAgentRecord('agent', 'u-me', null)).toBe(false)
  })
})

describe('canSeeLandlordAsset', () => {
  it('landlords only see their own assets; staff pass through', () => {
    expect(canSeeLandlordAsset('landlord', 'u-ll', 'u-ll')).toBe(true)
    expect(canSeeLandlordAsset('landlord', 'u-ll', 'u-other')).toBe(false)
    expect(canSeeLandlordAsset('client_admin', 'u-admin', 'u-ll')).toBe(true)
  })
})

describe('canAccessProperty', () => {
  it('denies cross-agency property URLs for agency staff', () => {
    expect(
      canAccessProperty(
        {
          role: 'client_admin',
          userId: 'u-1',
          agencyId: 'ag-a',
          agencySuspended: false,
        },
        { ...propA, agencyId: 'ag-b' },
        'p-1',
      ),
    ).toBe(false)
  })

  it('denies field agents another agent’s listing in the same agency', () => {
    expect(
      canAccessProperty(
        {
          role: 'ground_agent',
          userId: 'u-me',
          agencyId: 'ag-a',
          agencySuspended: false,
        },
        propA,
        'p-1',
      ),
    ).toBe(false)
  })

  it('denies field agents unassigned listings in their agency', () => {
    expect(
      canAccessProperty(
        {
          role: 'ground_agent',
          userId: 'u-me',
          agencyId: 'ag-a',
          agencySuspended: false,
        },
        { ...propA, agentId: null },
        'p-unassigned',
      ),
    ).toBe(false)
  })

  it('allows tenants only for linked application / tenancy property ids', () => {
    expect(
      canAccessProperty(
        {
          role: 'tenant',
          userId: 'u-t',
          agencyId: 'ag-a',
          agencySuspended: false,
          tenantPropertyIds: new Set(['p-mine']),
        },
        propA,
        'p-other',
      ),
    ).toBe(false)
    expect(
      canAccessProperty(
        {
          role: 'tenant',
          userId: 'u-t',
          agencyId: 'ag-a',
          agencySuspended: false,
          tenantPropertyIds: new Set(['p-mine']),
        },
        propA,
        'p-mine',
      ),
    ).toBe(true)
  })

  it('allows contractors only for assigned or same-agency claimable jobs', () => {
    expect(
      canAccessProperty(
        {
          role: 'contractor',
          userId: 'u-c',
          agencyId: 'ag-a',
          agencySuspended: false,
          contractorPropertyIds: new Set(['p-job']),
        },
        propA,
        'p-job',
      ),
    ).toBe(true)
    expect(
      canAccessProperty(
        {
          role: 'contractor',
          userId: 'u-c',
          agencyId: 'ag-a',
          agencySuspended: false,
          contractorPropertyIds: new Set(['p-job']),
        },
        propA,
        'p-secret',
      ),
    ).toBe(false)
  })

  it('allows landlords only for owned assets', () => {
    expect(
      canAccessProperty(
        {
          role: 'landlord',
          userId: 'u-ll-a',
          agencyId: 'ag-a',
          agencySuspended: false,
        },
        propA,
        'p-1',
      ),
    ).toBe(true)
    expect(
      canAccessProperty(
        {
          role: 'landlord',
          userId: 'u-other',
          agencyId: 'ag-a',
          agencySuspended: false,
        },
        propA,
        'p-1',
      ),
    ).toBe(false)
  })
})

describe('canImpersonateTarget', () => {
  it('blocks inactive targets and cross-agency impersonation', () => {
    expect(
      canImpersonateTarget(
        { role: 'client_admin', agencyId: 'ag-a' },
        { role: 'tenant', agencyId: 'ag-a', active: false },
      ),
    ).toBe(false)
    expect(
      canImpersonateTarget(
        { role: 'client_admin', agencyId: 'ag-a' },
        { role: 'tenant', agencyId: 'ag-b', active: true },
      ),
    ).toBe(false)
  })

  it('blocks non-platform actors from impersonating super_admin', () => {
    expect(
      canImpersonateTarget(
        { role: 'client_admin', agencyId: 'ag-a' },
        { role: 'super_admin', agencyId: null, active: true },
      ),
    ).toBe(false)
    expect(
      canImpersonateTarget(
        { role: 'super_admin', agencyId: null },
        { role: 'super_admin', agencyId: null, active: true },
      ),
    ).toBe(true)
  })

  it('allows same-agency impersonation for principals', () => {
    expect(
      canImpersonateTarget(
        { role: 'client_admin', agencyId: 'ag-a' },
        { role: 'ground_agent', agencyId: 'ag-a', active: true },
      ),
    ).toBe(true)
    expect(
      canImpersonateTarget(
        { role: 'client_admin', agencyId: 'ag-a' },
        { role: 'landlord', agencyId: 'ag-a', active: true },
      ),
    ).toBe(true)
  })

  it('limits agency administrators to agents, landlords, and portal users', () => {
    expect(
      canImpersonateTarget(
        { role: 'agent_admin', agencyId: 'ag-a' },
        { role: 'ground_agent', agencyId: 'ag-a', active: true },
      ),
    ).toBe(true)
    expect(
      canImpersonateTarget(
        { role: 'agent_admin', agencyId: 'ag-a' },
        { role: 'landlord', agencyId: 'ag-a', active: true },
      ),
    ).toBe(true)
    expect(
      canImpersonateTarget(
        { role: 'agent_admin', agencyId: 'ag-a' },
        { role: 'client_admin', agencyId: 'ag-a', active: true },
      ),
    ).toBe(false)
    expect(
      canImpersonateTarget(
        { role: 'agent_admin', agencyId: 'ag-a' },
        { role: 'agent_admin', agencyId: 'ag-a', active: true },
      ),
    ).toBe(false)
  })
})

describe('filterScopedPropertyDocuments', () => {
  const props = new Map([
    ['p-a1', { agencyId: 'ag-a', agentId: 'u-agent-a', landlordId: 'u-ll-a' }],
    ['p-a2', { agencyId: 'ag-a', agentId: 'u-agent-b', landlordId: 'u-ll-a' }],
    ['p-b1', { agencyId: 'ag-b', agentId: 'u-agent-c', landlordId: 'u-ll-b' }],
  ])

  const docs = [
    { id: 'd1', agencyId: 'ag-a', propertyId: 'p-a1', name: 'A1 title' },
    { id: 'd2', agencyId: 'ag-a', propertyId: 'p-a2', name: 'A2 lease' },
    { id: 'd3', agencyId: 'ag-b', propertyId: 'p-b1', name: 'B1 title' },
    { id: 'd4', agencyId: 'ag-a', propertyId: 'missing', name: 'Orphan' },
    { id: 'd5', agencyId: 'ag-b', propertyId: 'p-a1', name: 'Tampered agency' },
  ]

  it('keeps only the viewer agency’s documents for staff', () => {
    const rows = filterScopedPropertyDocuments(docs, props, {
      role: 'client_admin',
      userId: 'u-admin',
      agencyId: 'ag-a',
      agencySuspended: false,
    })
    expect(rows.map((r) => r.id).sort()).toEqual(['d1', 'd2'])
  })

  it('limits field agents to their assigned properties’ docs', () => {
    const rows = filterScopedPropertyDocuments(docs, props, {
      role: 'ground_agent',
      userId: 'u-agent-a',
      agencyId: 'ag-a',
      agencySuspended: false,
    })
    expect(rows.map((r) => r.id)).toEqual(['d1'])
  })

  it('denies orphan and cross-agency-mismatched rows', () => {
    const rows = filterScopedPropertyDocuments(docs, props, {
      role: 'super_admin',
      userId: 'u-sa',
      agencyId: null,
      agencySuspended: false,
    })
    expect(rows.some((r) => r.id === 'd4')).toBe(false)
    // Super admin may still see mismatched agencyId if property exists — property access wins.
    // Non-super path already covered; ensure cape docs never appear for horizon staff.
    const horizonOnly = filterScopedPropertyDocuments(docs, props, {
      role: 'agent_admin',
      userId: 'u-1',
      agencyId: 'ag-a',
      agencySuspended: false,
    })
    expect(horizonOnly.some((r) => r.agencyId === 'ag-b')).toBe(false)
    expect(horizonOnly.some((r) => r.id === 'd5')).toBe(false)
  })
})

describe('agency admin property access (issue 15 / A02)', () => {
  const clientUuid = '7515d803-1111-4111-8111-111111111111'

  it('allows access when listing agencyId is server UUID and viewer uses ag-* FE id', () => {
    const property = {
      agencyId: clientUuid,
      agentId: 'u-agent',
      landlordId: 'u-ll',
    }
    const { properties } = reconcileAgencyIdSpace(
      [
        {
          id: 'ag-vision',
          name: 'Vision',
          slug: 'vision',
          city: '',
          status: 'Active',
          createdAt: '2026-01-01',
          enabledPermissions: [],
        },
        {
          id: clientUuid,
          name: 'Vision',
          slug: 'vision',
          city: '',
          status: 'Active',
          createdAt: '2026-01-01',
          enabledPermissions: [],
        },
      ],
      [],
      [property],
    )
    const viewer = {
      role: 'agent_admin' as const,
      userId: 'u-admin',
      agencyId: 'ag-vision',
      agencySuspended: false,
    }
    expect(canAccessProperty(viewer, properties![0]!, 'PR-csirjj')).toBe(true)
    expect(properties![0]!.agencyId).toBe('ag-vision')
  })
})
