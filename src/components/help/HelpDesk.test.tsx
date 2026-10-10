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
    state: { supportTickets: store.tickets, agencies: [{ id: 'ag-horizon', name: 'Horizon' }] },
    submitSupportTicket: vi.fn(),
    resolveSupportTicket: vi.fn(),
  }),
}))

import { HelpDesk } from './HelpDesk'

const base = {
  agencyId: 'ag-horizon',
  submitterName: 'Tina',
  submitterRole: 'tenant',
  body: 'b',
  createdAt: '2026-10-09T10:00:00.000Z',
}
const open: SupportTicket = { ...base, id: 'HD-1', submittedByUserId: 'u-tenant', subject: 'Leak', status: 'open' }
const done: SupportTicket = {
  ...base,
  id: 'HD-2',
  submittedByUserId: 'u-tenant',
  subject: 'Keys',
  status: 'resolved',
  resolvedByName: 'Ann',
  resolvedAt: '2026-10-09T11:00:00.000Z',
  resolutionNote: 'Keys left at reception',
}

describe('CR7 HelpDesk screen', () => {
  beforeEach(() => {
    store.tickets = [open, done]
    auth.perms = new Set()
  })

  it('hides the desk for non-admins (tenant, ground agent, agency admin without users.manage)', () => {
    for (const user of [
      { id: 'u-tenant', name: 'T', role: 'tenant', agencyId: 'ag-horizon' },
      { id: 'u-ga', name: 'G', role: 'ground_agent', agencyId: 'ag-horizon' },
      { id: 'u-aa', name: 'A', role: 'agent_admin', agencyId: 'ag-horizon' },
    ]) {
      auth.user = user
      const html = renderToStaticMarkup(<HelpDesk />)
      expect(html).toContain('data-testid="help-raise-ticket"')
      expect(html).toContain('data-testid="help-my-tickets"')
      expect(html).not.toContain('data-testid="help-desk-section"')
      expect(html).not.toContain('Resolve</button>')
    }
  })

  it('shows the desk with Resolve for an agency admin holding users.manage', () => {
    auth.user = { id: 'u-aa', name: 'A', role: 'agent_admin', agencyId: 'ag-horizon' }
    auth.perms = new Set(['users.manage'])
    const html = renderToStaticMarkup(<HelpDesk />)
    expect(html).toContain('data-testid="help-desk-section"')
    expect(html).toContain('data-testid="help-desk-resolve-HD-1"')
  })

  it('shows each of my tickets with its number, Open or Resolved, and the resolve note once resolved', () => {
    auth.user = { id: 'u-tenant', name: 'T', role: 'tenant', agencyId: 'ag-horizon' }
    const html = renderToStaticMarkup(<HelpDesk />)
    const item = (id: string) => {
      const start = html.indexOf(`data-testid="help-my-ticket-${id}"`)
      return html.slice(start, html.indexOf('</li>', start))
    }
    expect(item('HD-1')).toContain('Ticket HD-1')
    expect(item('HD-1')).toContain('Open')
    expect(item('HD-1')).not.toContain('help-ticket-resolution')
    expect(item('HD-2')).toContain('Ticket HD-2')
    expect(item('HD-2')).toContain('Resolved')
    expect(item('HD-2')).toContain('Keys left at reception')
    expect(html).not.toMatch(/SLA|within \d+ (hours|days)/i)
  })
})
