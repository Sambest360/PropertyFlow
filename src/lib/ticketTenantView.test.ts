import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { MaintenanceTicket, Tenancy } from '../types/domain'
import { tenantPortalTickets } from './ticketTenantView'

const ticket = (over: Partial<MaintenanceTicket>): MaintenanceTicket => ({
  id: 'MT-1',
  agencyId: 'ag-a',
  propertyId: 'p-1',
  assetLabel: 'Geyser',
  reportedBy: 'Agent Annie',
  reportedByUserId: 'u-agent',
  title: 'Geyser leaking',
  priority: 'High',
  status: 'In Progress',
  contractorId: 'u-co',
  assignedAgentId: 'u-agent',
  cost: 4200,
  photos: 0,
  openedAt: '2026-10-01',
  description: 'Logged by agent',
  resolutionNotes: 'Internal note',
  warrantyCovered: true,
  estimatedCost: 3900,
  ...over,
})
const tenancies = [
  { id: 'L-t', tenantUserId: 'u-t' },
  { id: 'L-t2', tenantUserId: 'u-t2' },
] as Array<Pick<Tenancy, 'id' | 'tenantUserId'>>

describe('tenant portal tickets', () => {
  it('lists a staff ticket linked to my tenancy, in the tenant view', () => {
    const out = tenantPortalTickets([ticket({ id: 'MT-link', tenancyId: 'L-t' })], tenancies, 'u-t')
    expect(out.map((t) => t.id)).toEqual(['MT-link'])
    const t = out[0] as Record<string, unknown>
    for (const k of ['cost', 'estimatedCost', 'contractorId', 'resolutionNotes', 'warrantyCovered', 'assignedAgentId']) {
      expect(t).not.toHaveProperty(k)
    }
    expect(t.status).toBe('In Progress')
  })

  it("does not list another tenant's linked ticket", () => {
    expect(tenantPortalTickets([ticket({ tenancyId: 'L-t2' })], tenancies, 'u-t')).toEqual([])
  })

  it('no name fallback: a ticket whose reporter name matches mine is not listed', () => {
    const t = ticket({ reportedBy: 'Tess Tenant', reportedByUserId: 'u-other' })
    expect(tenantPortalTickets([t], tenancies, 'u-t')).toEqual([])
  })

  it('my own reported ticket is listed unchanged', () => {
    const t = ticket({ reportedBy: 'Tess', reportedByUserId: 'u-t' })
    expect(tenantPortalTickets([t], tenancies, 'u-t')).toEqual([t])
  })
})

describe('tenant ticket forms: no agency required', () => {
  it('TenantMaintenanceView and TenantComplaintsView do not block on portal.agencyId', () => {
    for (const f of ['../pages/tenant/TenantMaintenanceView.tsx', '../pages/tenant/TenantComplaintsView.tsx']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8')
      expect(src).not.toMatch(/!portal\.agencyId/)
    }
  })
})
