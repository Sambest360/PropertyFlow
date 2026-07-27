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

describe('canWriteEntity', () => {
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
    expect(
      canWriteEntity(james, {
        resource: 'lead',
        propertyId: 'p-a2',
        property: properties[1]!,
        agencyId: 'ag-a',
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
})
