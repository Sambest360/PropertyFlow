import { describe, expect, it } from 'vitest'
import { filterBootstrapForActor } from './scopeGate'
import { buildPropertyScope } from '../src/lib/scope'
import type { DemoActor } from './actor'

/**
 * Tenant maintenance tickets (Michael's queue item 2): a ticket staff raise
 * for a tenant (tenancyId = their lease) reaches that tenant's portal, and
 * only theirs; linked tickets show the tenant view only.
 */
const T_UUID = '00000000-0000-4000-8000-000000000020'

const staffTicket = (id: string, tenancyId: string | null, propertyId = 'p-1') => ({
  id,
  agencyId: 'ag-a',
  propertyId,
  unitId: null,
  categoryKey: 'PLUMBING',
  assetLabel: 'Geyser',
  reportedBy: 'Agent Annie',
  reportedByUserId: 'u-agent',
  tenancyId,
  title: 'Geyser leaking',
  priority: 'High',
  status: 'In Progress',
  contractorId: 'u-co',
  assignedAgentId: 'u-agent',
  cost: 4200,
  estimatedCost: 3900,
  photos: 2,
  photoUrls: ['/staff/photo.jpg'],
  openedAt: '2026-10-01',
  description: 'Agent logged on inspection',
  accessNotes: 'Lockbox 1234',
  resolutionNotes: 'Internal: landlord to be billed',
  warrantyCovered: true,
  contractorAssignedAt: '2026-10-02T08:00:00Z',
})

function raw() {
  return {
    source: 'test',
    fetchedAt: '2026-10-10T00:00:00.000Z',
    agencies: [{ id: 'ag-a', status: 'Active' }],
    users: [{ id: 'u-t' }, { id: 'u-t2' }, { id: 'u-t3' }, { id: 'u-agent' }],
    buildings: [{ id: 'b-a', clientId: 'ag-a' }],
    units: [],
    properties: [
      { id: 'p-1', agencyId: 'ag-a', agentId: 'u-agent', landlordId: 'u-ll', buildingId: 'b-a' },
      { id: 'p-2', agencyId: 'ag-a', agentId: 'u-agent', landlordId: 'u-ll', buildingId: 'b-a' },
    ],
    leads: [],
    applications: [],
    tenancies: [
      { id: 'L-t', agencyId: 'ag-a', propertyId: 'p-1', tenantUserId: 'u-t', status: 'Active' },
      { id: 'L-t2', agencyId: 'ag-a', propertyId: 'p-1', tenantUserId: 'u-t2', status: 'Active' },
      { id: 'L-t-old', agencyId: 'ag-a', propertyId: 'p-2', tenantUserId: 'u-t', status: 'Ended' },
      { id: 'L-t3', agencyId: 'ag-a', propertyId: 'p-2', tenantUserId: 'u-t3', status: 'Active' },
    ],
    viewings: [],
    viewingSlots: [],
    payments: [],
    propertyDocuments: [],
    tickets: [
      staffTicket('MT-for-t', 'L-t'),
      staffTicket('MT-for-t2', 'L-t2'),
      staffTicket('MT-unlinked', null),
      staffTicket('MT-old-tenancy', 'L-t-old', 'p-2'),
      { ...staffTicket('MT-own', null), reportedBy: 'Tess', reportedByUserId: 'u-t' },
    ],
    threads: [],
    messages: [],
    notifications: [],
  }
}

function tenantView(userId: string, actorIds?: Set<string>) {
  const actor: DemoActor = { userId, role: 'tenant', agencyId: 'ag-a' } as DemoActor
  const data = raw()
  const scope = buildPropertyScope(
    { role: 'tenant', userId, agencyId: 'ag-a', agencySuspended: false },
    {
      properties: data.properties,
      tenancies: data.tenancies.map((t) => ({ tenantUserId: t.tenantUserId, propertyId: t.propertyId })),
    } as never,
  )
  return filterBootstrapForActor(data as never, actor, scope, actorIds)
}

describe('tenant bootstrap: staff tickets linked to a tenancy', () => {
  it('a staff ticket linked to my tenancy reaches me', () => {
    const ids = tenantView('u-t').tickets.map((t) => t.id)
    expect(ids).toContain('MT-for-t')
  })

  it('point 6: the link never leaks to another tenant, even on the same unit', () => {
    const t2 = tenantView('u-t2').tickets.map((t) => t.id)
    expect(t2).toEqual(['MT-for-t2'])
    // Same property, no link, not the reporter: not shown (no unit match).
    expect(tenantView('u-t').tickets.map((t) => t.id)).not.toContain('MT-unlinked')
    // Tenant on p-2 now does not see the previous tenant's ticket on p-2.
    expect(tenantView('u-t3').tickets.map((t) => t.id)).toEqual([])
  })

  it("a past tenant keeps their own old tenancy's tickets", () => {
    expect(tenantView('u-t').tickets.map((t) => t.id)).toContain('MT-old-tenancy')
  })

  it('Oscar: a linked ticket has no notes, quote, cost, vendor or warranty fields', () => {
    const t = tenantView('u-t').tickets.find((x) => x.id === 'MT-for-t') as Record<string, unknown>
    expect(t).toMatchObject({ id: 'MT-for-t', title: 'Geyser leaking', status: 'In Progress', tenancyId: 'L-t' })
    for (const k of [
      'resolutionNotes',
      'cost',
      'estimatedCost',
      'contractorId',
      'assignedAgentId',
      'warrantyCovered',
      'contractorAssignedAt',
      'accessNotes',
      'photoUrls',
    ]) {
      expect(t).not.toHaveProperty(k)
    }
    expect(t.reportedByUserId).toBeNull()
    expect(JSON.stringify(t)).not.toMatch(/landlord to be billed|4200|3900|Lockbox/)
  })

  it('Jim #92 (2): my own report that staff later quoted on and annotated shows only my description, status and dates', () => {
    const t = tenantView('u-t').tickets.find((x) => x.id === 'MT-own') as Record<string, unknown>
    expect(t).toMatchObject({
      id: 'MT-own',
      reportedByUserId: 'u-t',
      reportedBy: 'Tess',
      description: 'Agent logged on inspection',
      status: 'In Progress',
      openedAt: '2026-10-01',
    })
    for (const k of ['resolutionNotes', 'cost', 'estimatedCost', 'contractorId', 'assignedAgentId', 'warrantyCovered', 'contractorAssignedAt', 'accessNotes']) {
      expect(t).not.toHaveProperty(k)
    }
    expect(JSON.stringify(t)).not.toMatch(/landlord to be billed|4200|3900|Lockbox/)
  })

  it('reporter match uses every id form the tenant carries (actorIds)', () => {
    // Session id is the uuid; the row carries the front-end id.
    const ids = tenantView(T_UUID, new Set([T_UUID, 'u-t'])).tickets.map((t) => t.id)
    expect(ids).toContain('MT-own')
    expect(ids).toContain('MT-for-t')
  })
})
