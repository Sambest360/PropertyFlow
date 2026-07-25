import type { AppUser, MaintenanceTicket, PropertyAsset } from '../../types/domain'
import type { AssetHealthMetric } from '../../lib/api/ticketsApi'

export type MaintenanceViewMode = 'list' | 'cards' | 'board'

export type PriorityFilter = 'all' | MaintenanceTicket['priority']
export type StatusFilter = 'all' | MaintenanceTicket['status']
export type DispositionFilter = 'all' | 'REPAIR' | 'REPLACE' | 'MONITOR' | 'UNKNOWN'
export type AttentionFilter = 'all' | 'emergency' | 'escalated' | 'warranty' | 'unassigned' | 'open'
export type SortKey = 'priority' | 'opened' | 'property' | 'status' | 'cost'

export type PortfolioTicket = {
  ticket: MaintenanceTicket
  property: PropertyAsset
  assetHealth: AssetHealthMetric
  contractorName: string | null
  agentName: string | null
  /** Higher = more urgent for ops sorting */
  urgencyScore: number
  /** Hours open since openedAtIso / openedAt */
  ageHours: number
}

export const VIEW_STORAGE_KEY = 'propertyflow-maintenance-view-v2'

export const TICKET_STATUSES: MaintenanceTicket['status'][] = [
  'Requested',
  'In Progress',
  'Awaiting Parts',
  'Completed',
  'Cancelled',
]

export const TICKET_PRIORITIES: MaintenanceTicket['priority'][] = [
  'Emergency',
  'Urgent',
  'High',
  'Medium',
  'Low',
]

export const PRIORITY_WEIGHT: Record<MaintenanceTicket['priority'], number> = {
  Emergency: 100,
  Urgent: 80,
  High: 60,
  Medium: 30,
  Low: 10,
}

export function isOpenStatus(status: MaintenanceTicket['status']) {
  return status !== 'Completed' && status !== 'Cancelled'
}

export function ticketAgeHours(ticket: MaintenanceTicket): number {
  const iso = ticket.openedAtIso ?? `${ticket.openedAt}T08:00:00.000Z`
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, ms / (1000 * 60 * 60))
}

export function urgencyScore(ticket: MaintenanceTicket, health: AssetHealthMetric): number {
  let score = PRIORITY_WEIGHT[ticket.priority]
  if (ticket.escalatedAt) score += 40
  if (health.disposition === 'REPLACE') score += 25
  if (health.disposition === 'REPAIR') score += 12
  if (!ticket.contractorId && isOpenStatus(ticket.status)) score += 8
  const age = ticketAgeHours(ticket)
  if (ticket.priority === 'Emergency' && age >= 2) score += 30
  else if (age >= 48 && isOpenStatus(ticket.status)) score += 15
  return score
}

export function resolveUserName(id: string | null | undefined, users: AppUser[]): string | null {
  if (!id) return null
  return users.find((u) => u.id === id)?.name ?? null
}

export function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 24) return `${Math.round(hours)}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function boardColumnForStatus(
  status: MaintenanceTicket['status'],
): 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' {
  if (status === 'Completed' || status === 'Cancelled') return 'RESOLVED'
  if (status === 'In Progress' || status === 'Awaiting Parts') return 'IN_PROGRESS'
  return 'OPEN'
}
