import type { MaintenanceTicket, PropertyAsset, Viewing, ViewingSlot } from '../types/domain'
import type { CalendarMarker } from '../components/admin/MiniCalendar'

export type CalendarEventKind = 'viewing' | 'viewing_slot' | 'ticket' | 'application' | 'invoice'

export type CalendarEvent = {
  kind: CalendarEventKind
  id: string
  title: string
  meta: string
  status: string
  /** YYYY-MM-DD */
  date: string
  propertyId?: string
  time?: string
  priority?: string
}

export function calendarEventAction(
  event: CalendarEvent | null | undefined,
): { label: string; to: string } | undefined {
  if (!event?.propertyId && event?.kind !== 'ticket' && event?.kind !== 'application') {
    if (event?.kind === 'invoice') return undefined
    return undefined
  }
  if (!event) return undefined

  switch (event.kind) {
    case 'viewing':
      return {
        label: 'Open viewing',
        to: `/workspace/sales/viewings/property/${encodeURIComponent(event.propertyId!)}?booking=${encodeURIComponent(event.id)}`,
      }
    case 'viewing_slot':
      return {
        label: 'Open slot',
        to: `/workspace/sales/viewings/property/${encodeURIComponent(event.propertyId!)}?slot=${encodeURIComponent(event.id)}`,
      }
    case 'ticket':
      return {
        label: 'Open maintenance',
        to: `/workspace/operations/maintenance/${encodeURIComponent(event.id)}`,
      }
    case 'application':
      return {
        label: 'Review application',
        to: `/workspace/sales/applications/${encodeURIComponent(event.id)}`,
      }
    default:
      return event.propertyId
        ? { label: 'Open property', to: `/workspace/properties/${event.propertyId}` }
        : undefined
  }
}

export function buildViewingSlotCalendarEvents(
  slots: ViewingSlot[],
  properties: PropertyAsset[],
): CalendarEvent[] {
  return slots
    .filter((s) => s.status !== 'Cancelled')
    .map((slot) => {
      const prop = properties.find((p) => p.id === slot.propertyId)
      const remaining = Math.max(0, slot.capacity - slot.booked)
      return {
        kind: 'viewing_slot' as const,
        id: slot.id,
        title: `Open slot · ${slot.time}`,
        meta: `${slot.title?.trim() || 'Viewing'} · ${prop?.title ?? 'Property'} · ${remaining} left`,
        status: slot.status,
        date: slot.date,
        propertyId: slot.propertyId,
        time: slot.time,
      }
    })
}

export function buildViewingBookingCalendarEvents(
  viewings: Viewing[],
  properties: PropertyAsset[],
): CalendarEvent[] {
  return viewings
    .filter((v) => v.status !== 'Cancelled')
    .map((viewing) => {
      const prop = properties.find((p) => p.id === viewing.propertyId)
      return {
        kind: 'viewing' as const,
        id: viewing.id,
        title: `Viewing · ${viewing.time}`,
        meta: `${viewing.applicantName} · ${prop?.title ?? 'Property'}`,
        status: viewing.status,
        date: viewing.date,
        propertyId: viewing.propertyId,
        time: viewing.time,
      }
    })
}

export function buildMaintenanceCalendarEvents(
  tickets: MaintenanceTicket[],
  properties: PropertyAsset[],
): CalendarEvent[] {
  return tickets
    .filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled')
    .map((ticket) => {
      const prop = properties.find((p) => p.id === ticket.propertyId)
      return {
        kind: 'ticket' as const,
        id: ticket.id,
        title: ticket.title,
        meta: `${prop?.title ?? ticket.assetLabel} · ${ticket.reportedBy}`,
        status: ticket.status,
        date: ticket.openedAt,
        propertyId: ticket.propertyId,
        priority: ticket.priority,
      }
    })
}

export function mergeCalendarEvents(...groups: CalendarEvent[][]): CalendarEvent[] {
  return groups
    .flat()
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title))
}

export function buildCalendarMarkers(
  events: CalendarEvent[],
  toneFor: (event: CalendarEvent) => CalendarMarker['tone'],
): CalendarMarker[] {
  return events.map((event) => ({ date: event.date, tone: toneFor(event) }))
}

export function countsByDateFromEvents(events: CalendarEvent[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const event of events) {
    map[event.date] = (map[event.date] ?? 0) + 1
  }
  return map
}
