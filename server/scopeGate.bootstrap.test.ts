import { describe, expect, it } from 'vitest'
import { filterBootstrapForActor } from './scopeGate'
import { buildPropertyScope } from '../src/lib/scope'
import type { DemoActor } from './actor'

const raw = {
  source: 'test',
  fetchedAt: '2026-01-01T00:00:00.000Z',
  agencies: [
    { id: 'ag-a', status: 'Active' },
    { id: 'ag-b', status: 'Active' },
  ],
  users: [{ id: 'u-james' }, { id: 'u-other' }],
  buildings: [
    { id: 'b-a', clientId: 'ag-a' },
    { id: 'b-b', clientId: 'ag-b' },
  ],
  units: [
    { id: 'unt-p-a1', clientId: 'ag-a', buildingId: 'b-a' },
    { id: 'unt-p-b1', clientId: 'ag-b', buildingId: 'b-b' },
  ],
  properties: [
    {
      id: 'p-a1',
      agencyId: 'ag-a',
      agentId: 'u-james',
      landlordId: 'u-ll-a',
      buildingId: 'b-a',
    },
    {
      id: 'p-a2',
      agencyId: 'ag-a',
      agentId: 'u-priya',
      landlordId: 'u-ll-a',
      buildingId: 'b-a',
    },
    {
      id: 'p-b1',
      agencyId: 'ag-b',
      agentId: 'u-other',
      landlordId: 'u-ll-b',
      buildingId: 'b-b',
    },
  ],
  leads: [
    { propertyId: 'p-a1', agencyId: 'ag-a', agentId: 'u-james' },
    { propertyId: 'p-b1', agencyId: 'ag-b', agentId: 'u-other' },
  ],
  applications: [],
  tenancies: [],
  viewings: [],
  viewingSlots: [],
  payments: [
    {
      propertyId: 'p-a1',
      agencyId: 'ag-a',
      partyUserId: 'u-tenant',
      partyName: 'Tenant',
      landlordVisible: true,
    },
    {
      propertyId: 'p-a2',
      agencyId: 'ag-a',
      partyUserId: 'u-other-tenant',
      partyName: 'Other',
      landlordVisible: false,
    },
  ],
  propertyDocuments: [
    { propertyId: 'p-a1', agencyId: 'ag-a' },
    { propertyId: 'p-b1', agencyId: 'ag-b' },
  ],
  tickets: [],
  threads: [
    {
      id: 'th-owner',
      agencyId: 'ag-a',
      propertyId: 'p-a1',
      participantIds: ['u-ll-a', 'u-tenant'],
    },
    {
      id: 'th-agency-only',
      agencyId: 'ag-a',
      propertyId: 'p-a1',
      participantIds: ['u-james', 'u-tenant'],
    },
    {
      id: 'th-other-ll',
      agencyId: 'ag-a',
      propertyId: 'p-a2',
      participantIds: ['u-ll-b', 'u-other-tenant'],
    },
  ],
  messages: [
    { id: 'm1', threadId: 'th-owner' },
    { id: 'm2', threadId: 'th-agency-only' },
    { id: 'm3', threadId: 'th-other-ll' },
  ],
  notifications: [
    { userId: 'u-james', agencyId: 'ag-a' },
    { userId: 'u-other', agencyId: 'ag-b' },
  ],
}

describe('Agency bootstrap filtering', () => {
  it('hides other agencies’ properties from an agency admin', () => {
    const actor: DemoActor = {
      userId: 'u-amelia',
      role: 'client_admin',
      agencyId: 'ag-a',
    }
    const scope = buildPropertyScope(
      { role: actor.role, userId: actor.userId, agencyId: actor.agencyId, agencySuspended: false },
      { properties: raw.properties },
    )
    const out = filterBootstrapForActor(raw, actor, scope)
    expect(out.agencies.map((a) => a.id)).toEqual(['ag-a'])
    expect(out.properties.map((p) => p.id).sort()).toEqual(['p-a1', 'p-a2'])
    expect(out.leads.every((l) => l.agencyId === 'ag-a')).toBe(true)
    expect(out.propertyDocuments.every((d) => d.agencyId === 'ag-a')).toBe(true)
  })

  it('limits a field agent to their own book', () => {
    const actor: DemoActor = {
      userId: 'u-james',
      role: 'ground_agent',
      agencyId: 'ag-a',
    }
    const scope = buildPropertyScope(
      { role: actor.role, userId: actor.userId, agencyId: actor.agencyId, agencySuspended: false },
      { properties: raw.properties },
    )
    const out = filterBootstrapForActor(raw, actor, scope)
    expect(out.scoped).toBe(true)
    expect(out.properties.map((p) => p.id)).toEqual(['p-a1'])
    expect(out.leads.map((l) => l.propertyId)).toEqual(['p-a1'])
    expect(out.notifications.every((n) => n.userId === 'u-james')).toBe(true)
  })

  it('shows a tenant only their own payments', () => {
    const actor: DemoActor = {
      userId: 'u-tenant',
      role: 'tenant',
      agencyId: 'ag-a',
    }
    const scope = buildPropertyScope(
      {
        role: actor.role,
        userId: actor.userId,
        agencyId: actor.agencyId,
        agencySuspended: false,
      },
      {
        properties: raw.properties,
        applications: [
          {
            applicantUserId: 'u-tenant',
            email: 't@test.com',
            propertyId: 'p-a1',
            stage: 'Approved',
          },
        ],
        tenancies: [{ tenantUserId: 'u-tenant', propertyId: 'p-a1' }],
      },
    )
    const out = filterBootstrapForActor(raw, actor, scope)
    expect(out.payments).toEqual([
      expect.objectContaining({ partyUserId: 'u-tenant', propertyId: 'p-a1' }),
    ])
  })


  it('ag-ll landlord bootstrap keeps owned draft property, building, and unit (FW-23 L04)', () => {
    const actor: DemoActor = {
      userId: 'u-johan',
      role: 'landlord',
      agencyId: 'ag-ll-johan',
    }
    const llPortfolio = {
      ...raw,
      agencies: [{ id: 'ag-ll-johan', status: 'Active' }],
      buildings: [{ id: 'b-ll', clientId: 'ag-ll-johan', landlordId: 'u-johan' }],
      units: [{ id: 'unt-draft1', clientId: 'ag-ll-johan', buildingId: 'b-ll' }],
      properties: [
        {
          id: 'draft1',
          agencyId: 'ag-ll-johan',
          agentId: null,
          landlordId: 'u-johan',
          buildingId: 'b-ll',
          unitId: 'unt-draft1',
          status: 'Draft',
        },
      ],
    }
    const scope = buildPropertyScope(
      { role: actor.role, userId: actor.userId, agencyId: actor.agencyId, agencySuspended: false },
      { properties: llPortfolio.properties },
    )
    const out = filterBootstrapForActor(llPortfolio, actor, scope)
    expect(out.scoped).toBe(true)
    expect(out.properties.map((p) => p.id)).toEqual(['draft1'])
    expect(out.buildings.map((b) => b.id)).toEqual(['b-ll'])
    expect(out.units.map((u) => u.id)).toEqual(['unt-draft1'])
  })

  it('landlords keep participant threads on bootstrap (Mode A)', () => {
    const actor: DemoActor = {
      userId: 'u-ll-a',
      role: 'landlord',
      agencyId: 'ag-a',
    }
    const scope = buildPropertyScope(
      { role: actor.role, userId: actor.userId, agencyId: actor.agencyId, agencySuspended: false },
      { properties: raw.properties },
    )
    const out = filterBootstrapForActor(raw, actor, scope)
    expect(out.threads.map((t) => t.id)).toEqual(['th-owner'])
    expect(out.messages.map((m) => m.id)).toEqual(['m1'])
  })

  it('leaves platform admin data unscoped', () => {
    const actor: DemoActor = {
      userId: 'u-platform',
      role: 'super_admin',
      agencyId: null,
    }
    const scope = buildPropertyScope(
      { role: actor.role, userId: actor.userId, agencyId: null, agencySuspended: false },
      { properties: raw.properties },
    )
    const out = filterBootstrapForActor(raw, actor, scope)
    expect(out.scoped).toBe(false)
    expect(out.properties).toHaveLength(3)
    expect(out.agencies).toHaveLength(2)
  })

  it('null-agency tenant keeps own applications without agency membership', () => {
    const actor: DemoActor = {
      userId: 'u-guest-tenant',
      role: 'tenant',
      agencyId: null,
    }
    const rawWithApp = {
      ...raw,
      users: [
        ...raw.users,
        { id: 'u-guest-tenant', email: 'guest.tenant@example.com' },
      ],
      applications: [
        {
          propertyId: 'p-a1',
          agencyId: 'ag-a',
          agentId: 'u-james',
          applicantUserId: 'u-guest-tenant',
          email: 'guest.tenant@example.com',
        },
        {
          propertyId: 'p-a1',
          agencyId: 'ag-a',
          agentId: 'u-james',
          applicantUserId: 'u-other-applicant',
          email: 'other@example.com',
        },
      ],
    }
    const scope = buildPropertyScope(
      {
        role: actor.role,
        userId: actor.userId,
        agencyId: null,
        agencySuspended: false,
      },
      {
        properties: rawWithApp.properties,
        applications: [
          {
            applicantUserId: 'u-guest-tenant',
            email: 'guest.tenant@example.com',
            propertyId: 'p-a1',
            stage: 'Under Review',
          },
        ],
      },
    )
    const out = filterBootstrapForActor(rawWithApp, actor, scope)
    expect(out.scoped).toBe(true)
    expect(out.applications).toEqual([
      expect.objectContaining({
        applicantUserId: 'u-guest-tenant',
        propertyId: 'p-a1',
      }),
    ])
    expect(out.properties.map((p) => p.id)).toEqual(['p-a1'])
  })
})
