import { describe, expect, it } from 'vitest'
import {
  canResolveSupportTicket,
  filterSupportTicketsForViewer,
  isSupportDeskViewer,
  supportTicketRoutingAgency,
} from './supportTickets'

describe('CR7 support ticket rules', () => {
  it('routes every new ticket to platform support (super admins)', () => {
    for (const [role, agency] of [
      ['tenant', 'ag-horizon'],
      ['landlord', 'ag-horizon'],
      ['contractor', 'ag-cape'],
      ['tenant', null],
      ['client_admin', 'ag-horizon'],
      ['agent_admin', 'ag-horizon'],
      ['ground_agent', 'ag-horizon'],
      ['agent', 'ag-horizon'],
      ['super_admin', null],
    ] as const) {
      expect(supportTicketRoutingAgency(role, agency)).toBeNull()
    }
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

import {
  nextSupportStatus,
  normalizeSupportStatus,
  redactSupportTicketForReporter,
  similarOpenTickets,
  supportActionRefusal,
  supportTicketAge,
  type SupportTicket,
} from './supportTickets'

describe('system ticket actions', () => {
  const ticket: SupportTicket = {
    id: 'HD-1',
    agencyId: null,
    submittedByUserId: 'u-ll',
    submitterName: 'Lindi',
    submitterRole: 'landlord',
    subject: 'Statement will not download',
    body: 'b',
    status: 'new',
    createdAt: '2026-10-20T08:00:00.000Z',
  }
  const reporter = { userId: 'u-ll', role: 'landlord' as const, agencyId: 'ag-horizon' }
  const other = { userId: 'u-x', role: 'tenant' as const, agencyId: 'ag-horizon' }
  const agencyAdmin = { userId: 'u-a', role: 'client_admin' as const, agencyId: 'ag-horizon', hasUsersManage: true }
  const sa = { userId: 'u-s', role: 'super_admin' as const, agencyId: null }

  it('reads legacy open as new', () => {
    expect(normalizeSupportStatus('open')).toBe('new')
    expect(normalizeSupportStatus('bogus')).toBe('new')
  })

  it('lets the reporter reply, close and rate; never change status, priority or assignee', () => {
    expect(supportActionRefusal(reporter, ticket, { action: 'reply', body: 'more info' })).toBeNull()
    expect(supportActionRefusal(reporter, ticket, { action: 'reply', body: 'x', internal: true })).toMatch(/internal/)
    expect(supportActionRefusal(reporter, ticket, { action: 'status', status: 'resolved' })).not.toBeNull()
    expect(supportActionRefusal(reporter, ticket, { action: 'priority', priority: 'urgent' })).not.toBeNull()
    expect(supportActionRefusal(reporter, ticket, { action: 'assign', assigneeUserId: 'u-s' })).not.toBeNull()
    expect(supportActionRefusal(reporter, ticket, { action: 'close' })).toBeNull()
    expect(supportActionRefusal(reporter, ticket, { action: 'rate', rating: 5 })).toMatch(/resolved/)
    expect(supportActionRefusal(reporter, { ...ticket, status: 'resolved' }, { action: 'rate', rating: 5 })).toBeNull()
    expect(supportActionRefusal(reporter, { ...ticket, status: 'resolved', rating: 4 }, { action: 'rate', rating: 5 })).toMatch(/Already/)
    expect(supportActionRefusal(reporter, { ...ticket, status: 'closed' }, { action: 'reply', body: 'x' })).toMatch(/closed/)
  })

  it('refuses anyone else, including an agency admin on a platform ticket', () => {
    expect(supportActionRefusal(other, ticket, { action: 'reply', body: 'x' })).not.toBeNull()
    expect(supportActionRefusal(agencyAdmin, ticket, { action: 'reply', body: 'x' })).not.toBeNull()
    expect(supportActionRefusal(agencyAdmin, ticket, { action: 'status', status: 'resolved' })).not.toBeNull()
  })

  it('lets a super admin work the ticket and assign it', () => {
    expect(supportActionRefusal(sa, ticket, { action: 'status', status: 'in_progress' })).toBeNull()
    expect(supportActionRefusal(sa, ticket, { action: 'assign', assigneeUserId: 'u-s' })).toBeNull()
    expect(supportActionRefusal(sa, ticket, { action: 'reply', body: 'note', internal: true })).toBeNull()
  })

  it('moves the status on replies', () => {
    expect(nextSupportStatus('new', { action: 'reply', body: 'x' }, true)).toBe('in_progress')
    expect(nextSupportStatus('in_progress', { action: 'reply', body: 'x', status: 'waiting_on_user' }, true)).toBe('waiting_on_user')
    expect(nextSupportStatus('waiting_on_user', { action: 'reply', body: 'x' }, false)).toBe('in_progress')
    expect(nextSupportStatus('resolved', { action: 'reply', body: 'x' }, false)).toBe('in_progress')
    expect(nextSupportStatus('new', { action: 'reply', body: 'x', internal: true }, true)).toBe('new')
    expect(nextSupportStatus('resolved', { action: 'reopen' }, false)).toBe('in_progress')
  })

  it('hides internal notes from the reporter', () => {
    const t = {
      ...ticket,
      replies: [
        { id: '1', authorUserId: 'u-s', authorName: 'S', authorRole: 'super_admin', body: 'hi', at: '' },
        { id: '2', authorUserId: 'u-s', authorName: 'S', authorRole: 'super_admin', body: 'secret', at: '', internal: true },
      ],
    }
    expect(redactSupportTicketForReporter(t).replies?.map((r) => r.id)).toEqual(['1'])
    const viewed = filterSupportTicketsForViewer([t], reporter)
    expect(viewed[0].replies?.map((r) => r.id)).toEqual(['1'])
    expect(filterSupportTicketsForViewer([t], sa)[0].replies).toHaveLength(2)
  })

  it('flags a desk ticket overdue when nobody answered within the window for its priority', () => {
    const now = new Date('2026-10-20T08:00:00.000Z').getTime()
    expect(supportTicketAge({ ...ticket, priority: 'urgent' }, now + 5 * 3_600_000).overdue).toBe(true)
    expect(supportTicketAge({ ...ticket, priority: 'normal' }, now + 5 * 3_600_000).overdue).toBe(false)
    const answered = {
      ...ticket,
      priority: 'urgent' as const,
      replies: [{ id: '1', authorUserId: 'u-s', authorName: 'S', authorRole: 'super_admin', body: 'on it', at: '' }],
    }
    expect(supportTicketAge(answered, now + 5 * 3_600_000).overdue).toBe(false)
  })

  it('hints at similar open tickets', () => {
    expect(similarOpenTickets('Owner statement download fails', [ticket]).map((t) => t.id)).toEqual(['HD-1'])
    expect(similarOpenTickets('Owner statement download fails', [{ ...ticket, status: 'closed' }])).toEqual([])
  })
})
