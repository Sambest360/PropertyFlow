import type { AppUser, PropertyAsset, Viewing, ViewingSlot } from '../../types/domain'

export type ViewingsViewMode = 'list' | 'cards'

export type ViewingKindFilter = 'all' | 'bookings' | 'slots'
export type ViewingStatusFilter =
  | 'all'
  | 'Scheduled'
  | 'Completed'
  | 'No-show'
  | 'Cancelled'
  | 'Open'
  | 'Full'
export type ViewingSortKey = 'when' | 'property' | 'status' | 'agent'

/** Unified row: either a booking or an open/full slot, always tied to a property. */
export type PortfolioViewing =
  | {
      kind: 'booking'
      id: string
      viewing: Viewing
      property: PropertyAsset
      agentName: string | null
      slot: ViewingSlot | null
    }
  | {
      kind: 'slot'
      id: string
      slot: ViewingSlot
      property: PropertyAsset
      agentName: string | null
      bookings: Viewing[]
    }

export const VIEWING_VIEW_STORAGE_KEY = 'propertyflow-viewings-view'

export const VIEWING_BOOKING_STATUSES = [
  'Scheduled',
  'Completed',
  'No-show',
  'Cancelled',
] as const

export function viewingRowKey(item: PortfolioViewing) {
  return item.id
}

export function viewingWhenLabel(item: PortfolioViewing) {
  if (item.kind === 'booking') {
    return `${item.viewing.date} · ${item.viewing.time}`
  }
  return `${item.slot.date} · ${item.slot.time}`
}

export function viewingPrimaryLabel(item: PortfolioViewing) {
  if (item.kind === 'booking') return item.viewing.applicantName
  const remaining = Math.max(0, item.slot.capacity - item.slot.booked)
  return item.slot.title?.trim() || `Open slot · ${remaining} left`
}

export function viewingStatus(item: PortfolioViewing) {
  return item.kind === 'booking' ? item.viewing.status : item.slot.status
}

export function resolveAgentName(
  agentId: string | null | undefined,
  users: AppUser[],
): string | null {
  if (!agentId) return null
  return users.find((u) => u.id === agentId)?.name ?? null
}
