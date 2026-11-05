/**
 * Shared accommodation: a property let room by room. The number of rooms is
 * the bedroom count; rooms let = current leases on the property (the server
 * sends it as roomsLet). Applicants apply for "a room"; the agency assigns
 * which room during the application (after the deposit).
 */
import type { PropertyAsset } from '../types/domain'

export const SHARED_ACCOMMODATION_TYPE = 'Shared Accommodation'

export function isSharedAccommodation(type: string | null | undefined): boolean {
  return /\bshared\b/i.test(String(type ?? ''))
}

export function sharedRoomsTotal(p: Pick<PropertyAsset, 'beds'>): number {
  return Math.max(0, Number(p.beds) || 0)
}

export function sharedRoomsAvailable(p: Pick<PropertyAsset, 'beds'> & { roomsLet?: number }): number {
  return Math.max(0, sharedRoomsTotal(p) - (Number(p.roomsLet) || 0))
}

export function sharedRoomsLabel(p: Pick<PropertyAsset, 'beds' | 'type'> & { roomsLet?: number }): string | null {
  if (!isSharedAccommodation(p.type)) return null
  const total = sharedRoomsTotal(p)
  if (!total) return 'Rooms available'
  const free = sharedRoomsAvailable(p)
  return free === 0 ? 'All rooms taken' : `${free} of ${total} room${total === 1 ? '' : 's'} available`
}
