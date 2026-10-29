/** Client for the escalation routes (server/escalations.ts). */
import { actorHeaders } from './actorAuth'
import { resolveApiAuthorizationHeader } from './authClient'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = await resolveApiAuthorizationHeader()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...actorHeaders(), ...auth, ...init?.headers },
  })
  const json = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`)
  return json
}

export type EscalationPriority = 'EMERGENCY' | 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
export const ESCALATION_PRIORITIES: EscalationPriority[] = ['EMERGENCY', 'URGENT', 'HIGH', 'MEDIUM', 'LOW']

export type EscalationSettings = {
  enabled: boolean
  responseHours: Record<EscalationPriority, number>
  resolveHours: Record<EscalationPriority, number>
  supportResponseHours: number
  rentNoticeDays: number
  autoApplyRent: boolean
  defaultRentEscalationPct: number | null
}

export type Escalation = {
  id: string
  agencyId: string | null
  subjectType: 'maintenance_ticket' | 'support_ticket'
  subjectId: string
  title: string
  reason: string
  level: number
  status: 'open' | 'acknowledged' | 'resolved'
  link: string
  manual: boolean
  createdAt: string
  updatedAt: string
  history: Array<{ at: string; action: string; level?: number; note?: string | null }>
}

export type RentEscalationRow = {
  id: string
  reference: string
  tenantName: string
  rent: number
  pct: number | null
  nextOn: string | null
  leaseId: string
  agency: string
}

export function listEscalationsApi() {
  return call<{ escalations: Escalation[]; rent: RentEscalationRow[] }>('/api/escalations')
}

export function actOnEscalationApi(id: string, action: 'acknowledge' | 'resolve' | 'reopen', note?: string) {
  return call<{ escalation: Escalation }>(`/api/escalations/${encodeURIComponent(id)}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action, note }),
  })
}

export function escalateTicketApi(ticketId: string, reason: string) {
  return call<{ level: number }>('/api/escalations', { method: 'POST', body: JSON.stringify({ ticketId, reason }) })
}

export function getEscalationSettingsApi(agencyId?: string | null) {
  const q = agencyId ? `?agencyId=${encodeURIComponent(agencyId)}` : ''
  return call<{ settings: EscalationSettings }>(`/api/escalations/settings${q}`)
}

export function saveEscalationSettingsApi(settings: EscalationSettings, agencyId?: string | null) {
  return call<{ settings: EscalationSettings }>('/api/escalations/settings', {
    method: 'PUT',
    body: JSON.stringify({ settings, agencyId: agencyId ?? null }),
  })
}
