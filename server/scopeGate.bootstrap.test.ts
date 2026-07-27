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
  threads: [],
  messages: [],
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
})
