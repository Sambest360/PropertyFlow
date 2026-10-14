import type { ViewingSlot } from '../types/domain'

/** True when the slot end (or start if no duration) is still in the future. */
export function isFutureViewingSlot(slot: Pick<ViewingSlot, 'date' | 'time' | 'durationMinutes'>, now = new Date()): boolean {
  const time = slot.time.length === 5 ? `${slot.time}:00` : slot.time
  const start = new Date(`${slot.date}T${time}`)
  if (Number.isNaN(start.getTime())) return false
  const durationMs = (slot.durationMinutes ?? 0) > 0 ? slot.durationMinutes! * 60_000 : 0
  const endMs = start.getTime() + durationMs
  const cutoff = durationMs > 0 ? endMs : start.getTime()
  return cutoff > now.getTime()
}
