import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupportTicket } from '../../lib/supportTickets'

const auth = vi.hoisted(() => ({
  user: { id: 'u-tenant', name: 'Tina', role: 'tenant', agencyId: 'ag-horizon' } as Record<string, unknown>,
  perms: new Set<string>(),
}))
const store = vi.hoisted(() => ({ tickets: [] as SupportTicket[] }))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: auth.user, isAuthenticated: true, has: (p: string) => auth.perms.has(p) }),
}))
vi.mock('../../context/AppStore', () => ({
  useStore: () => ({
    state: {
      supportTickets: store.tickets,
      agencies: [{ id: 'ag-horizon', name: 'Horizon' }],
      users: [
        { id: 'u-super', name: 'Sam Super', role: 'super_admin', active: true },
        { id: 'u-tenant', name: 'Tina', role: 'tenant', active: true },
      ],
    },
    submitSupportTicket: vi.fn(),
    actOnSupportTicket: vi.fn(),
  }),
}))
vi.mock('../ImageDropzone', () => ({ ImageDropzone: () => null }))

import { HelpDesk } from './HelpDesk'

const base = {
  agencyId: null,
  submitterName: 'Tina',
  submitterRole: 'tenant',
  body: 'b',
  createdAt: '2026-10-09T10:00:00.000Z',
  category: 'bug' as const,
}
const open: SupportTicket = { ...base, id: 'HD-1', submittedByUserId: 'u-tenant', subject: 'Leak', status: 'new' }
const done: SupportTicket = {
  ...base,
  id: 'HD-2',
  submittedByUserId: 'u-tenant',
  subject: 'Keys',
  status: 'resolved',
  replies: [
    { id: 'R1', authorUserId: 'u-super', authorName: 'Sam', authorRole: 'super_admin', body: 'Fixed for you', at: '2026-10-09T11:00:00.000Z' },
    { id: 'R2', authorUserId: 'u-super', authorName: 'Sam', authorRole: 'super_admin', body: 'secret note', at: '2026-10-09T11:00:00.000Z', internal: true },
  ],
}
const legacyAgency: SupportTicket = { ...base, id: 'HD-3', agencyId: 'ag-horizon', submittedByUserId: 'u-t2', subject: 'Old', status: 'new' }

describe('HelpDesk screen', () => {
  beforeEach(() => {
    store.tickets = [open, done]
    auth.perms = new Set()
    auth.user = { id: 'u-tenant', name: 'Tina', role: 'tenant', agencyId: 'ag-horizon' }
  })

  it('lets every role report a problem with a category, and shows My tickets; no inbox for non-desk roles', () => {
    for (const user of [
      { id: 'u-tenant', name: 'T', role: 'tenant', agencyId: 'ag-horizon' },
      { id: 'u-ll', name: 'L', role: 'landlord', agencyId: 'ag-horizon' },
      { id: 'u-co', name: 'C', role: 'contractor', agencyId: 'ag-horizon' },
      { id: 'u-ga', name: 'G', role: 'ground_agent', agencyId: 'ag-horizon' },
      { id: 'u-aa', name: 'A', role: 'agent_admin', agencyId: 'ag-horizon' },
    ]) {
      auth.user = user
      const html = renderToStaticMarkup(<HelpDesk />)
      expect(html).toContain('data-testid="help-raise-ticket"')
      expect(html).toContain('data-testid="help-ticket-category"')
      expect(html).toContain('Feature request')
      expect(html).toContain('data-testid="help-my-tickets"')
      expect(html).not.toContain('data-testid="help-desk-section"')
    }
  })

  it('gives super admins the support inbox with every ticket', () => {
    auth.user = { id: 'u-super', name: 'Sam', role: 'super_admin', agencyId: null }
    const html = renderToStaticMarkup(<HelpDesk />)
    expect(html).toContain('Support inbox')
    expect(html).toContain('data-testid="help-desk-ticket-HD-1"')
    expect(html).toContain('Assigned to me')
  })

  it('keeps the desk for an agency admin only while legacy agency tickets remain', () => {
    auth.user = { id: 'u-aa', name: 'A', role: 'agent_admin', agencyId: 'ag-horizon' }
    auth.perms = new Set(['users.manage'])
    expect(renderToStaticMarkup(<HelpDesk />)).not.toContain('data-testid="help-desk-section"')
    store.tickets = [open, legacyAgency]
    const html = renderToStaticMarkup(<HelpDesk />)
    expect(html).toContain('data-testid="help-desk-section"')
    expect(html).toContain('data-testid="help-desk-ticket-HD-3"')
    expect(html).not.toContain('data-testid="help-desk-ticket-HD-1"')
  })

  it('shows each of my tickets with its number and status, without SLA promises to the reporter', () => {
    const html = renderToStaticMarkup(<HelpDesk />)
    const item = (id: string) => {
      const start = html.indexOf(`data-testid="help-my-ticket-${id}"`)
      return html.slice(start, html.indexOf('</li>', start))
    }
    expect(item('HD-1')).toContain('Ticket HD-1')
    expect(item('HD-1')).toContain('New')
    expect(item('HD-2')).toContain('Resolved')
    expect(item('HD-2')).toContain('1 reply')
    expect(html).not.toMatch(/SLA|within \d+ (hours|days)|No reply ·/i)
  })
})
