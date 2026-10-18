import { describe, expect, it } from 'vitest'
import { countDayCalendarEvents, isoDateKey } from './dashboardDayLinks'
import type { CalendarEvent } from './calendarEvents'

describe('dashboardDayLinks', () => {
  it('isoDateKey normalizes date-only and ISO datetime', () => {
    expect(isoDateKey('2026-10-19')).toBe('2026-10-19')
    expect(isoDateKey('2026-10-19T14:30:00.000Z')).toBe('2026-10-19')
    expect(isoDateKey('')).toBe('')
  })

  it('countDayCalendarEvents counts by kind', () => {
    const events: CalendarEvent[] = [
      {
        kind: 'viewing',
        id: 'v1',
        title: 'A',
        meta: '',
        status: 'Scheduled',
        date: '2026-10-19',
      },
      {
        kind: 'viewing_slot',
        id: 's1',
        title: 'B',
        meta: '',
        status: 'Open',
        date: '2026-10-19',
      },
      {
        kind: 'ticket',
        id: 't1',
        title: 'C',
        meta: '',
        status: 'Open',
        date: '2026-10-19',
      },
    ]
    expect(countDayCalendarEvents(events, ['viewing', 'viewing_slot'])).toBe(2)
    expect(countDayCalendarEvents(events, 'ticket')).toBe(1)
  })
})
