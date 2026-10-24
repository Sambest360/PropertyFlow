/** Client for the maintenance responsibility routes (server/maintenanceRuleRoutes.ts). */
import { resolveApiAuthorizationHeader } from './authClient'
import type {
  ResponsibleParty,
  RuleItem,
  RulePropertyType,
  TenantCategoryOption,
} from '../maintenanceRules'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

export type RuleWarning = { code: string; message: string }

export type UnitCategories = {
  unitId: string
  propertyType: RulePropertyType
  ruleSet: { id: string | null; name: string; version: number; source: string }
  categories: TenantCategoryOption[]
  afterHoursPhone: string | null
  warnings?: RuleWarning[]
}

export type RuleSetView = {
  id: string
  unitId: string | null
  propertyType: RulePropertyType | null
  name: string
  version: number
  active: boolean
  platformTemplate: boolean
  sourceDocumentId: string | null
  sourceUrl: string | null
  bodyCorporateEmail: string | null
  items: RuleItem[]
}

export type UnitRules = {
  unitId: string
  propertyType: RulePropertyType
  effective: {
    id: string | null
    name: string
    version: number
    source: 'unit' | 'agency' | 'platform' | 'seed'
    sourceDocumentId: string | null
    sourceUrl: string | null
    bodyCorporateEmail: string | null
    items: RuleItem[]
  }
  unitRuleSet: RuleSetView | null
  warnings: RuleWarning[]
}

export type EmailDraft = { to: string | null; subject: string; body: string }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = await resolveApiAuthorizationHeader()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...auth, ...init?.headers },
  })
  const json = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`)
  return json
}

export function fetchUnitCategories(unitRef: string): Promise<UnitCategories> {
  return call(`/api/units/${encodeURIComponent(unitRef)}/maintenance-categories`)
}

export function fetchUnitRules(unitRef: string): Promise<UnitRules> {
  return call(`/api/maintenance-rule-sets?unitId=${encodeURIComponent(unitRef)}`)
}

export type RuleSetInput = {
  name?: string
  sourceDocumentId?: string | null
  sourceUrl?: string | null
  bodyCorporateEmail?: string | null
  items?: RuleItem[]
}

export function createUnitRuleSet(unitRef: string, input: RuleSetInput): Promise<RuleSetView> {
  return call('/api/maintenance-rule-sets', { method: 'POST', body: JSON.stringify({ ...input, unitId: unitRef }) })
}

export function updateRuleSet(id: string, input: RuleSetInput): Promise<RuleSetView> {
  return call(`/api/maintenance-rule-sets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deactivateRuleSet(id: string): Promise<{ ok: true }> {
  return call(`/api/maintenance-rule-sets/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function overrideTicketResponsibility(
  ticketId: string,
  responsibleParty: ResponsibleParty,
  reason: string,
): Promise<{ ok: true; responsibleParty: ResponsibleParty; overrideReason: string }> {
  return call(`/api/tickets/${encodeURIComponent(ticketId)}/responsibility`, {
    method: 'PATCH',
    body: JSON.stringify({ responsibleParty, reason }),
  })
}

export function forwardTicketToBodyCorporate(ticketId: string): Promise<{ ok: true; emailDraft: EmailDraft }> {
  return call(`/api/tickets/${encodeURIComponent(ticketId)}/forward-body-corporate`, { method: 'POST' })
}

export function mailtoFromDraft(d: EmailDraft): string {
  return `mailto:${encodeURIComponent(d.to ?? '')}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`
}
