import type { RoomKind } from '../data/infrastructure'

export type RoomSummaryInput = {
  kind: RoomKind
  beds: number
  baths: number
}

export type RoomSummary = {
  /** Bedroom rooms — drives “X bedrooms” on listings */
  bedrooms: number
  /** Sleeping capacity across bedroom rooms */
  beds: number
  /** Bathroom rooms — drives “X bathrooms” on listings */
  bathrooms: number
  /** Bath fixtures total (half baths supported) */
  baths: number
  /** Enclosed garage rooms */
  garages: number
}

export function summarizeRooms(rooms: RoomSummaryInput[]): RoomSummary {
  let bedrooms = 0
  let beds = 0
  let bathrooms = 0
  let baths = 0
  let garages = 0

  for (const room of rooms) {
    if (room.kind === 'bedroom') {
      bedrooms += 1
      beds += Math.max(room.beds, 1)
    } else if (room.kind === 'bathroom') {
      bathrooms += 1
      baths += Math.max(room.baths, 1)
    } else if (room.kind === 'garage') {
      garages += 1
    }
  }

  return { bedrooms, beds, bathrooms, baths, garages }
}

export function sanitizeRoomCounts<T extends RoomSummaryInput>(room: T): T {
  if (room.kind === 'bedroom') {
    return { ...room, beds: Math.max(room.beds, 1), baths: 0 }
  }
  if (room.kind === 'bathroom') {
    return { ...room, beds: 0, baths: Math.max(room.baths, 1) }
  }
  return { ...room, beds: 0, baths: 0 }
}
