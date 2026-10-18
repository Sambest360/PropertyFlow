import type { CalendarEvent, CalendarEventKind } from './calendarEvents'

/** Normalize ISO or date-only strings to YYYY-MM-DD for day comparisons. */
export function isoDateKey(value: string | null | undefined): string {
  if (!value) return ''
  const trimmed = value.trim()
  return trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed
}

export function countDayCalendarEvents(
  dayEvents: readonly CalendarEvent[],
  kinds: CalendarEventKind | readonly CalendarEventKind[],
): number {
  const set = Array.isArray(kinds) ? kinds : [kinds]
  return dayEvents.filter((e) => set.includes(e.kind)).length
}

export function formatQuickLinksDayLabel(selectedDay: Date): string {
  return selectedDay.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
