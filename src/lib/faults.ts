/**
 * Tenant faults — shared rules (client + server).
 *
 * Tenants report "faults"; staff keep working them as maintenance tickets.
 * Urgency is the tenant-facing name for the ticket priority.
 */
import type { MaintenanceTicket } from '../types/domain.js'

export const FAULT_REPLY_MAX = 2000

export const FAULT_URGENCIES = [
  { key: 'Emergency', label: 'Emergency', hint: 'Danger, flooding, no power, gas, break-in' },
  { key: 'High', label: 'Urgent', hint: 'Needs attention within a day or two' },
  { key: 'Medium', label: 'Routine', hint: 'Can be booked in normally' },
] as const
export type FaultUrgency = (typeof FAULT_URGENCIES)[number]['key']

export function faultUrgencyLabel(priority: string | undefined): string {
  if (priority === 'Emergency') return 'Emergency'
  if (priority === 'High' || priority === 'Urgent') return 'Urgent'
  return 'Routine'
}

/** Tenant-facing status words for a maintenance ticket status. */
export function faultStatusLabel(status: MaintenanceTicket['status'] | string): string {
  switch (status) {
    case 'Requested':
      return 'Reported'
    case 'In Progress':
      return 'Being fixed'
    case 'Awaiting Parts':
      return 'Waiting for parts'
    case 'Completed':
      return 'Fixed'
    case 'Cancelled':
      return 'Cancelled'
    default:
      return String(status)
  }
}

export type FaultAccess = 'reporter' | 'staff' | 'landlord' | 'contractor'

export type FaultThreadEntry = {
  id: string
  kind: 'reply' | 'confirmed' | 'reopened'
  body: string
  authorUserId: string
  authorName: string
  authorRole: string
  at: string
  rating?: number
  internal?: boolean
}

/** DB statuses (maintenance_tickets.status) the tenant can confirm or reopen. */
const DONE_DB = new Set(['COMPLETED', 'RESOLVED'])

export function isFaultDone(status: string): boolean {
  return DONE_DB.has(status.toUpperCase()) || status === 'Completed'
}

/**
 * Who may post what on a fault thread (server-checked):
 *  - reply: anyone with access; internal notes are staff-only
 *  - confirm (fixed, optional 1–5 rating) / reopen: the reporting tenant, once
 *    the ticket is completed
 */
export function faultActionRefusal(
  access: FaultAccess,
  status: string,
  act: { action: 'reply' | 'confirm' | 'reopen'; body: string; rating?: number | null; internal?: boolean },
): string | null {
  if (act.internal && access !== 'staff') return 'only staff add internal notes'
  if (act.action === 'reply') return act.body.trim() ? null : 'write a message first'
  if (access !== 'reporter') return 'only the tenant who reported it can confirm or reopen'
  if (!isFaultDone(status)) return 'the fault is not marked fixed yet'
  if (act.action === 'reopen') return act.body.trim() ? null : 'say what is still wrong'
  if (act.rating != null && !(Number.isInteger(act.rating) && act.rating >= 1 && act.rating <= 5)) return 'rating is 1 to 5'
  return null
}

/** Hours a fault may sit before it is overdue, by urgency (staff + tenant age hint). */
export const FAULT_TARGET_HOURS: Record<string, number> = {
  Emergency: 4,
  Urgent: 24,
  High: 48,
  Medium: 24 * 7,
  Low: 24 * 14,
}

export type FaultAge = { label: string; overdue: boolean }

export function faultAge(t: Pick<MaintenanceTicket, 'openedAt' | 'openedAtIso' | 'priority' | 'status'>, now = Date.now()): FaultAge {
  const opened = new Date(t.openedAtIso ?? t.openedAt).getTime()
  const ms = Number.isFinite(opened) ? Math.max(0, now - opened) : 0
  const h = Math.floor(ms / 3_600_000)
  const label = h < 1 ? 'just now' : h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
  const open = t.status !== 'Completed' && t.status !== 'Cancelled'
  return { label, overdue: open && h >= (FAULT_TARGET_HOURS[t.priority] ?? 24 * 7) }
}

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4))
}

/**
 * Open faults that look like the one being reported: same category, or two
 * shared words in the title. Hint only — the tenant can still report it.
 */
export function similarOpenFaults<T extends Pick<MaintenanceTicket, 'title' | 'status' | 'categoryKey'>>(
  draft: { title: string; categoryKey?: string },
  tickets: T[],
): T[] {
  const mine = words(draft.title)
  return tickets.filter((t) => {
    if (t.status === 'Completed' || t.status === 'Cancelled') return false
    if (draft.categoryKey && t.categoryKey && draft.categoryKey.toUpperCase() === t.categoryKey.toUpperCase()) return true
    if (mine.size === 0) return false
    let hits = 0
    for (const w of words(t.title)) if (mine.has(w)) hits++
    return hits >= Math.min(2, mine.size)
  })
}
