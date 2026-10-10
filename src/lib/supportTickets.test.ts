import { describe, expect, it } from 'vitest'
import {
  canResolveSupportTicket,
  filterSupportTicketsForViewer,
  isSupportDeskViewer,
  supportTicketRoutingAgency,
} from './supportTickets'

describe('CR7 support ticket rules', () => {
  it('routes portal users to their agency and staff / no-agency users to the platform', () => {
    expect(supportTicketRoutingAgency('tenant', 'ag-horizon')).toBe('ag-horizon')
    expect(supportTicketRoutingAgency('landlord', 'ag-horizon')).toBe('ag-horizon')
    expect(supportTicketRoutingAgency('contractor', 'ag-cape')).toBe('ag-cape')
    expect(supportTicketRoutingAgency('tenant', null)).toBeNull()
    expect(supportTicketRoutingAgency('client_admin', 'ag-horizon')).toBeNull()
    expect(supportTicketRoutingAgency('agent_admin', 'ag-horizon')).toBeNull()
    expect(supportTicketRoutingAgency('ground_agent', 'ag-horizon')).toBeNull()
    expect(supportTicketRoutingAgency('agent', 'ag-horizon')).toBeNull()
    expect(supportTicketRoutingAgency('super_admin', null)).toBeNull()
  })

  it('limits the desk to super admin, principal and agency admin holding users.manage', () => {
    const v = (role: Parameters<typeof isSupportDeskViewer>[0]['role'], hasUsersManage?: boolean) =>
      isSupportDeskViewer({ userId: 'u', role, agencyId: 'ag-horizon', hasUsersManage })
    expect(v('super_admin')).toBe(true)
    expect(v('client_admin')).toBe(true)
    expect(v('agent_admin')).toBe(true)
    expect(v('agent_admin', false)).toBe(false)
    expect(v('ground_agent')).toBe(false)
    expect(v('agent')).toBe(false)
    expect(v('tenant')).toBe(false)
    expect(v('landlord')).toBe(false)
  })

  it('lets an agency desk resolve only its own agency tickets', () => {
    const admin = { userId: 'u-a', role: 'client_admin' as const, agencyId: 'ag-horizon' }
    expect(canResolveSupportTicket(admin, { agencyId: 'ag-horizon' })).toBe(true)
    expect(canResolveSupportTicket(admin, { agencyId: 'ag-cape' })).toBe(false)
    expect(canResolveSupportTicket(admin, { agencyId: null })).toBe(false)
    const sa = { userId: 'u-s', role: 'super_admin' as const, agencyId: null }
    expect(canResolveSupportTicket(sa, { agencyId: null })).toBe(true)
    expect(canResolveSupportTicket(sa, { agencyId: 'ag-cape' })).toBe(true)
  })

  it('filters to own submissions for non-desk roles', () => {
    const tickets = [
      { id: '1', agencyId: 'ag-horizon', submittedByUserId: 'u-ll' },
      { id: '2', agencyId: 'ag-horizon', submittedByUserId: 'u-other' },
    ]
    const out = filterSupportTicketsForViewer(tickets, {
      userId: 'u-ll',
      role: 'landlord',
      agencyId: 'ag-horizon',
    })
    expect(out.map((t) => t.id)).toEqual(['1'])
  })
})
