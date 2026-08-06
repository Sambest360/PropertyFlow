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

export function viewingAgentId(item: PortfolioViewing): string | null {
  return item.kind === 'booking' ? item.viewing.agentId : item.slot.agentId
}

/** Bookings tied to a slot appear under that slot — not as separate agenda rows. */
export function isStandaloneAgendaBooking(item: PortfolioViewing): boolean {
  return item.kind === 'booking' && !item.viewing.slotId
}

export function agendaPortfolioItems(items: PortfolioViewing[]): PortfolioViewing[] {
  return items.filter((item) => item.kind === 'slot' || isStandaloneAgendaBooking(item))
}

export function viewingDeskPath(item: PortfolioViewing): string {
  const base = `/workspace/sales/viewings/property/${encodeURIComponent(item.property.id)}`
  if (item.kind === 'slot') {
    return `${base}?slot=${encodeURIComponent(item.slot.id)}`
  }
  if (item.viewing.slotId) {
    return `${base}?slot=${encodeURIComponent(item.viewing.slotId)}`
  }
  return `${base}?booking=${encodeURIComponent(item.viewing.id)}`
}

export function viewingDeskLinkLabel(item: PortfolioViewing): string {
  if (item.kind === 'slot') return 'Open slot'
  if (item.viewing.slotId) return 'Open slot'
  return 'View invite'
}
