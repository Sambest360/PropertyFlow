/**
 * Mirrors src/lib/viewingSlotTime.ts — keep in sync (server cannot import client bundle).
 * Server side the slot is read as Africa/Johannesburg wall-clock time (027),
 * since the API host runs UTC; the browser copy uses the viewer's local zone.
 */
import { slotStartSast } from './slotInstant.js'

export type ViewingSlotTiming = {
  date: string
  time: string
  durationMinutes?: number
}

/** True when the slot end (or start if no duration) is still in the future. */
export function isFutureViewingSlot(slot: ViewingSlotTiming, now = new Date()): boolean {
  const start = slotStartSast(slot.date, slot.time)
  if (Number.isNaN(start.getTime())) return false
  const durationMs = (slot.durationMinutes ?? 0) > 0 ? slot.durationMinutes! * 60_000 : 0
  const endMs = start.getTime() + durationMs
  const cutoff = durationMs > 0 ? endMs : start.getTime()
  return cutoff > now.getTime()
}
