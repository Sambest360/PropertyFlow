/**
 * When a lease needs an inspection reminder. Pure (no DB) so the daily cron in
 * server/leaseReminders.ts can use it without loading the inspection module.
 */

export function calendarDaysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/** Reminders beside the 80/45-day lease-end bands. */
export function reminderNeeded(input: {
  today: string
  startDate: string | null
  endDate: string | null
  signedMoveIn: boolean
  moveOutScheduled: boolean
}): Array<'move_in' | 'move_out'> {
  const out: Array<'move_in' | 'move_out'> = []
  if (input.startDate && !input.signedMoveIn) {
    const days = calendarDaysBetween(input.today, input.startDate)
    if (days >= 0 && days <= 7) out.push('move_in')
  }
  if (input.endDate && !input.moveOutScheduled) {
    const days = calendarDaysBetween(input.today, input.endDate)
    if (days >= 0 && days <= 3) out.push('move_out')
  }
  return out
}
