/**
 * Client for the help desk (server/supportDesk.ts) and fault thread
 * (server/faultDesk.ts) routes.
 */
import { actorHeaders } from './actorAuth'
import { resolveApiAuthorizationHeader } from './authClient'
import type { SupportAction, SupportTicket } from '../supportTickets'
import type { FaultAccess, FaultThreadEntry } from '../faults'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = await resolveApiAuthorizationHeader()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...actorHeaders(), ...auth, ...init?.headers },
  })
  const json = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw new Error((json.message || `Request failed (${res.status})`).replace(/^Forbidden:\s*/, ''))
  return json
}

export type NewSupportTicket = {
  id: string
  subject: string
  body: string
  category: string
  pageUrl: string | null
  userAgent: string | null
  attachments: string[]
  submitterName: string
}

export async function createSupportTicketApi(input: NewSupportTicket): Promise<SupportTicket> {
  const r = await call<{ ticket: SupportTicket }>('/api/support-tickets', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return r.ticket
}

export async function supportTicketActionApi(
  ticketId: string,
  act: SupportAction,
  actorName: string,
): Promise<SupportTicket> {
  const r = await call<{ ticket: SupportTicket }>(`/api/support-tickets/${encodeURIComponent(ticketId)}/actions`, {
    method: 'POST',
    body: JSON.stringify({ ...act, actorName }),
  })
  return r.ticket
}

export type FaultThread = { access: FaultAccess; entries: FaultThreadEntry[]; status?: string | null }

export function fetchFaultThread(ticketId: string): Promise<FaultThread> {
  return call(`/api/tickets/${encodeURIComponent(ticketId)}/thread`)
}

export function postFaultThread(
  ticketId: string,
  input: { action: 'reply' | 'confirm' | 'reopen'; body?: string; rating?: number | null; internal?: boolean; actorName?: string },
): Promise<FaultThread> {
  return call(`/api/tickets/${encodeURIComponent(ticketId)}/thread`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
