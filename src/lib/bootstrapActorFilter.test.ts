import { describe, expect, it } from 'vitest'
import { buildPropertyScope } from './scope'
import { filterBootstrapForActor } from './bootstrapActorFilter'

const raw = {
  source: 'test',
  fetchedAt: new Date().toISOString(),
  agencies: [
    { id: 'ag-a', status: 'Active' },
    { id: 'ag-b', status: 'Active' },
  ],
  users: [],
  buildings: [],
  units: [],
  properties: [
    { id: 'p-a1', agencyId: 'ag-a', agentId: 'u-james', landlordId: 'u-ll' },
    { id: 'p-a2', agencyId: 'ag-a', agentId: 'u-other', landlordId: 'u-ll' },
    { id: 'p-a3', agencyId: 'ag-a', agentId: null, landlordId: 'u-ll' },
    { id: 'p-b1', agencyId: 'ag-b', agentId: 'u-x', landlordId: 'u-ll' },
  ],
  leads: [
    { id: 'l1', propertyId: 'p-a1', agencyId: 'ag-a', agentId: 'u-james' },
    { id: 'l2', propertyId: 'p-a2', agencyId: 'ag-a', agentId: 'u-other' },
  ],
  applications: [],
  tenancies: [],
  viewings: [],
  payments: [],
  propertyDocuments: [],
  tickets: [],
  threads: [],
  messages: [],
  notifications: [],
}

describe('bootstrapActorFilter (shared)', () => {
  it('limits a field agent to their own book', () => {
    const actor = { userId: 'u-james', role: 'ground_agent', agencyId: 'ag-a' }
    const scope = buildPropertyScope(
      { role: 'ground_agent', userId: actor.userId, agencyId: actor.agencyId, agencySuspended: false },
      { properties: raw.properties },
    )
    const out = filterBootstrapForActor(raw, actor, scope)
    expect(out.scoped).toBe(true)
    expect(out.properties.map((p) => p.id)).toEqual(['p-a1'])
    expect(out.leads.map((l) => l.propertyId)).toEqual(['p-a1'])
    expect((out.trustTransactions ?? []).length).toBe(0)
  })

  it('excludes unassigned agency listings from a field agent bootstrap', () => {
    const actor = { userId: 'u-james', role: 'ground_agent', agencyId: 'ag-a' }
    const scope = buildPropertyScope(
      { role: 'ground_agent', userId: actor.userId, agencyId: actor.agencyId, agencySuspended: false },
      { properties: raw.properties },
    )
    const out = filterBootstrapForActor(raw, actor, scope)
    expect(out.properties.map((p) => p.id)).not.toContain('p-a3')
  })
})
