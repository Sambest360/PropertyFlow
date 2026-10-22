import type { ViewingGuest } from '../components/viewings/GuestListEditor'
import type { Lead, Viewing, ViewingSlot } from '../types/domain'
import { leadContactMatches } from './leadContext'
import { isFutureViewingSlot } from './viewingSlotTime'

export function leadToViewingGuest(lead: Pick<Lead, 'name' | 'email'>): ViewingGuest {
  const email = lead.email?.trim()
  return {
    name: lead.name.trim(),
    email: email || undefined,
  }
}

export function bookableSlotsForProperty(
  slots: readonly ViewingSlot[],
  propertyId: string,
  now = new Date(),
): ViewingSlot[] {
  return slots
    .filter(
      (s) =>
        s.propertyId === propertyId &&
        s.status === 'Open' &&
        s.booked < s.capacity &&
        isFutureViewingSlot(s, now),
    )
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
}

export function leadViewingDeskHref(viewing: Pick<Viewing, 'propertyId' | 'id' | 'slotId'>): string {
  const base = `/workspace/sales/viewings/property/${encodeURIComponent(viewing.propertyId)}`
  if (viewing.slotId) {
    return `${base}?slot=${encodeURIComponent(viewing.slotId)}`
  }
  return `${base}?booking=${encodeURIComponent(viewing.id)}`
}

export function leadAlreadyOnSlot(
  lead: Pick<Lead, 'email' | 'name'>,
  slotId: string,
  viewings: readonly Viewing[],
): boolean {
  return viewings.some(
    (v) =>
      v.slotId === slotId &&
      v.status !== 'Cancelled' &&
      leadContactMatches(lead, { email: v.applicantEmail, name: v.applicantName }),
  )
}

export function remainingSlotPlaces(slot: ViewingSlot): number {
  return Math.max(0, slot.capacity - slot.booked)
}
