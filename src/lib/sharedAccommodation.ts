/**
 * Shared accommodation: a property let room by room, bed by bed. Each bedroom
 * on the floor plan has a number of beds; every bed is one place to let (a
 * room with three beds takes three people). Places let = current leases on
 * the property (the server sends it as roomsLet). Applicants apply for "a
 * room"; the agency assigns the bed during the application. A whole property
 * (not shared) has one tenant.
 */
import type { PropertyAsset } from '../types/domain'

export const SHARED_ACCOMMODATION_TYPE = 'Shared Accommodation'

export function isSharedAccommodation(type: string | null | undefined): boolean {
  return /\bshared\b/i.test(String(type ?? ''))
}

export function sharedRoomsTotal(p: Pick<PropertyAsset, 'beds'>): number {
  return Math.max(0, Number(p.beds) || 0)
}

/** Places to let: one per bed when the floor plan has rooms, else one per bedroom. */
function placesTotal(p: Pick<PropertyAsset, 'beds'> & { rooms?: PropertyAsset['rooms'] }): number {
  const bedrooms = (p.rooms ?? []).filter((r) => (r.kind ?? 'bedroom') === 'bedroom')
  if (!bedrooms.length) return sharedRoomsTotal(p)
  return bedrooms.reduce((n, r) => n + Math.max(1, Math.floor(Number(r.beds) || 1)), 0)
}

export function sharedRoomsAvailable(p: Pick<PropertyAsset, 'beds'> & { roomsLet?: number; rooms?: PropertyAsset['rooms'] }): number {
  return Math.max(0, placesTotal(p) - (Number(p.roomsLet) || 0))
}

export function sharedRoomsLabel(p: Pick<PropertyAsset, 'beds' | 'type'> & { roomsLet?: number; rooms?: PropertyAsset['rooms'] }): string | null {
  if (!isSharedAccommodation(p.type)) return null
  const total = placesTotal(p)
  if (!total) return 'Rooms available'
  const free = sharedRoomsAvailable(p)
  const bedrooms = (p.rooms ?? []).filter((r) => (r.kind ?? 'bedroom') === 'bedroom')
  const unit = bedrooms.some((r) => (Number(r.beds) || 1) > 1) ? 'bed' : 'room'
  return free === 0 ? `All ${unit}s taken` : `${free} of ${total} ${unit}${total === 1 ? '' : 's'} available`
}

/** One bed in a shared property: who can be placed where. */
export type BedSlot = { roomId: string; roomName: string; bed: number; bedsInRoom: number; label: string }

type RoomsLike = Pick<PropertyAsset, 'beds'> & { rooms?: Array<{ id: string; name: string; beds: number; kind?: string }> }

/**
 * Every bed, room by room, from the floor plan. A room with two beds gives
 * two places ("Room 2 · Bed 1", "Room 2 · Bed 2"); a single-bed room gives one
 * ("Room 3"). With no floor plan, one place per bedroom.
 */
export function sharedBedSlots(p: RoomsLike): BedSlot[] {
  const bedrooms = (p.rooms ?? []).filter((r) => (r.kind ?? 'bedroom') === 'bedroom')
  if (!bedrooms.length) {
    return Array.from({ length: sharedRoomsTotal(p) }, (_, i) => ({
      roomId: `room-${i + 1}`,
      roomName: `Room ${i + 1}`,
      bed: 1,
      bedsInRoom: 1,
      label: `Room ${i + 1}`,
    }))
  }
  return bedrooms.flatMap((r, i) => {
    const name = r.name?.trim() || `Room ${i + 1}`
    const beds = Math.max(1, Math.floor(Number(r.beds) || 1))
    return Array.from({ length: beds }, (_, b) => ({
      roomId: r.id,
      roomName: name,
      bed: b + 1,
      bedsInRoom: beds,
      label: beds > 1 ? `${name} · Bed ${b + 1}` : name,
    }))
  })
}

/** How many people a shared property takes (one per bed). */
export function sharedCapacity(p: RoomsLike): number {
  return sharedBedSlots(p).length
}

/** Beds already given to someone: current leases and assigned applicants. */
export function takenBedLabels(
  propertyId: string,
  tenancies: Array<{ id: string; propertyId: string; status: string; roomSlot?: string; directAdd?: { roomLabel?: string } }>,
  applications: Array<{ id: string; propertyId: string; stage?: string; workflowStatus?: string; assignedRoom?: { label: string } }>,
  except?: { tenancyId?: string; applicationId?: string },
): Set<string> {
  const taken = new Set<string>()
  for (const t of tenancies) {
    if (t.propertyId !== propertyId || t.status === 'Ended' || t.id === except?.tenancyId) continue
    const label = t.roomSlot || t.directAdd?.roomLabel
    if (label) taken.add(label)
  }
  for (const a of applications) {
    if (a.propertyId !== propertyId || a.id === except?.applicationId || !a.assignedRoom) continue
    if (a.stage === 'Rejected' || a.workflowStatus === 'rejected' || a.workflowStatus === 'withdrawn' || a.workflowStatus === 'cancelled') continue
    taken.add(a.assignedRoom.label)
  }
  return taken
}
