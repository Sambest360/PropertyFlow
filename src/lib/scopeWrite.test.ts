import { describe, expect, it } from 'vitest'
import { buildPropertyScope } from './scope'
import { canWriteEntity } from './scopeWrite'

const properties = [
  { id: 'p-a1', agencyId: 'ag-a', agentId: 'u-james', landlordId: 'u-ll-a' },
  { id: 'p-a2', agencyId: 'ag-a', agentId: 'u-priya', landlordId: 'u-ll-a' },
]

const james = buildPropertyScope(
  { role: 'ground_agent', userId: 'u-james', agencyId: 'ag-a', agencySuspended: false },
  { properties },
)

const amelia = buildPropertyScope(
  { role: 'client_admin', userId: 'u-amelia', agencyId: 'ag-a', agencySuspended: false },
  { properties },
)

const johan = buildPropertyScope(
  { role: 'landlord', userId: 'u-johan', agencyId: 'ag-ll-johan', agencySuspended: false },
  { properties: [] },
)

describe('canWriteEntity', () => {
  it('allows landlord to create a building in their agency (L03 draft wizard)', () => {
    expect(
      canWriteEntity(johan, {
        resource: 'building',
        propertyId: null,
        property: { agencyId: 'ag-ll-johan', agentId: null, landlordId: 'u-johan' },
        agencyId: 'ag-ll-johan',
      }),
    ).toBe(true)
  })

  it('allows landlord building create when session agency is unset but they own the listing (L03)', () => {
    const noAgency = buildPropertyScope(
      { role: 'landlord', userId: 'u-johan', agencyId: null, agencySuspended: false },
      { properties: [] },
    )
    expect(
      canWriteEntity(noAgency, {
        resource: 'building',
        propertyId: null,
        property: { agencyId: 'ag-ll-johan', agentId: null, landlordId: 'u-johan' },
        agencyId: 'ag-ll-johan',
      }),
    ).toBe(true)
  })

  it('allows landlord unit upsert when landlordId is filled from the building (L03)', () => {
    expect(
      canWriteEntity(johan, {
        resource: 'unit',
        propertyId: 'unt-new',
        property: { agencyId: 'ag-ll-johan', agentId: null, landlordId: 'u-johan' },
        agencyId: 'ag-ll-johan',
      }),
    ).toBe(true)
  })

  it('rejects landlord listing writes for another landlord', () => {
    expect(
      canWriteEntity(johan, {
        resource: 'building',
        propertyId: null,
        property: { agencyId: 'ag-ll-johan', agentId: null, landlordId: 'u-other' },
        agencyId: 'ag-ll-johan',
      }),
    ).toBe(false)
  })

  it('allows ground agent upserts on assigned property', () => {
    expect(
      canWriteEntity(james, {
        resource: 'lead',
        propertyId: 'p-a1',
        property: properties[0]!,
        agencyId: 'ag-a',
      }),
    ).toBe(true)
  })

  it('rejects ground agent upserts on another agent’s property', () => {
    // Deal row assigned to Priya on her listing — off James's book → deny (r19)
    expect(
      canWriteEntity(james, {
        resource: 'lead',
        propertyId: 'p-a2',
        property: properties[1]!,
        agencyId: 'ag-a',
        agentId: 'u-priya',
      }),
    ).toBe(false)
    expect(
      canWriteEntity(james, {
        resource: 'property',
        propertyId: 'p-a2',
        property: properties[1]!,
        agencyId: 'ag-a',
      }),
    ).toBe(false)
  })

  it('allows agency admin within agency', () => {
    expect(
      canWriteEntity(amelia, {
        resource: 'lead',
        propertyId: 'p-a2',
        property: properties[1]!,
        agencyId: 'ag-a',
      }),
    ).toBe(true)
  })

  it('rejects agency admin mutating another agency', () => {
    expect(
      canWriteEntity(amelia, {
        resource: 'lookup',
        propertyId: null,
        property: null,
        agencyId: 'ag-b',
      }),
    ).toBe(false)
  })

  it('allows users to update their own notifications', () => {
    expect(
      canWriteEntity(james, {
        resource: 'notification',
        propertyId: null,
        property: null,
        agencyId: 'ag-a',
        ownerUserId: 'u-james',
      }),
    ).toBe(true)
  })

  // P0-5 r15 residual: FA building create is agency-level (no propertyId yet).
  // Unit/property synthesize a property subject after the building exists.
  it('allows field agent (ground_agent) agency-level building upsert', () => {
    expect(
      canWriteEntity(james, {
        resource: 'building',
        propertyId: null,
        property: null,
        agencyId: 'ag-a',
      }),
    ).toBe(true)
  })

  it('allows field agent (agent) agency-level building upsert', () => {
    const candidate = buildPropertyScope(
      { role: 'agent', userId: 'u-cand', agencyId: 'ag-a', agencySuspended: false },
      { properties },
    )
    expect(
      canWriteEntity(candidate, {
        resource: 'building',
        propertyId: null,
        property: null,
        agencyId: 'ag-a',
      }),
    ).toBe(true)
  })

  it('rejects field agent building upsert in another agency', () => {
    expect(
      canWriteEntity(james, {
        resource: 'building',
        propertyId: null,
        property: null,
        agencyId: 'ag-b',
      }),
    ).toBe(false)
  })

  it('still rejects field agent agency-level writes for non-fieldOk resources', () => {
    expect(
      canWriteEntity(james, {
        resource: 'lookup',
        propertyId: null,
        property: null,
        agencyId: 'ag-a',
      }),
    ).toBe(false)
    expect(
      canWriteEntity(james, {
        resource: 'invoice',
        propertyId: null,
        property: null,
        agencyId: 'ag-a',
      }),
    ).toBe(false)
  })

  // P0 r19: deal write mirrors dealInScope (#41) — Unassigned pool before hard deny.
  // application is NOT added to agency-level fieldOk (laundry stays closed).
  it('allows FA Unassigned off-book in-agency application write', () => {
    // p-a2 is Priya's listing (off James's book); agentId null = Unassigned pool
    expect(
      canWriteEntity(james, {
        resource: 'application',
        propertyId: 'p-a2',
        property: properties[1]!,
        agencyId: 'ag-a',
        agentId: null,
      }),
    ).toBe(true)
    expect(
      canWriteEntity(james, {
        resource: 'lead',
        propertyId: 'p-a2',
        property: properties[1]!,
        agencyId: 'ag-a',
        agentId: '',
      }),
    ).toBe(true)
  })

  it('denies FA Unassigned application write cross-agency', () => {
    const offAgencyProp = {
      id: 'p-b1',
      agencyId: 'ag-b',
      agentId: 'u-zane',
      landlordId: 'u-ll-c',
    }
    expect(
      canWriteEntity(james, {
        resource: 'application',
        propertyId: 'p-b1',
        property: offAgencyProp,
        agencyId: 'ag-b',
        agentId: null,
      }),
    ).toBe(false)
  })

  it('denies FA write on other agent’s assigned off-book application', () => {
    // p-a2 Priya's listing + assigned to Priya — not Unassigned, not James's book
    expect(
      canWriteEntity(james, {
        resource: 'application',
        propertyId: 'p-a2',
        property: properties[1]!,
        agencyId: 'ag-a',
        agentId: 'u-priya',
      }),
    ).toBe(false)
  })

  it('SA unchanged: super_admin still writes any application', () => {
    const sa = buildPropertyScope(
      { role: 'super_admin', userId: 'u-sa', agencyId: null, agencySuspended: false },
      { properties },
    )
    expect(
      canWriteEntity(sa, {
        resource: 'application',
        propertyId: 'p-a2',
        property: properties[1]!,
        agencyId: 'ag-a',
        agentId: 'u-priya',
      }),
    ).toBe(true)
    expect(
      canWriteEntity(sa, {
        resource: 'application',
        propertyId: 'p-b1',
        property: {
          id: 'p-b1',
          agencyId: 'ag-b',
          agentId: null,
          landlordId: 'u-ll-c',
        },
        agencyId: 'ag-b',
        agentId: null,
      }),
    ).toBe(true)
  })

  it('does not open application via agency-level fieldOk (no propertyId)', () => {
    expect(
      canWriteEntity(james, {
        resource: 'application',
        propertyId: null,
        property: null,
        agencyId: 'ag-a',
        agentId: null,
      }),
    ).toBe(false)
  })

})
