import { describe, expect, it } from 'vitest'
import { calendarEventAction, countsByDateFromEvents } from './calendarEvents'

describe('calendarEvents', () => {
  it('builds deep links for calendar rows', () => {
    expect(
      calendarEventAction({
        kind: 'viewing',
        id: 'VW-1',
        propertyId: 'P-1',
        title: 'Viewing',
        meta: '',
        status: 'Scheduled',
        date: '2026-08-01',
      })?.to,
    ).toContain('booking=VW-1')

    expect(
      calendarEventAction({
        kind: 'ticket',
        id: 'MT-1',
        title: 'Leak',
        meta: '',
        status: 'Requested',
        date: '2026-08-01',
      })?.to,
    ).toBe('/workspace/operations/maintenance/MT-1')
  })

  it('counts events per day', () => {
    const counts = countsByDateFromEvents([
      {
        kind: 'viewing',
        id: 'a',
        title: 'A',
        meta: '',
        status: 'Scheduled',
        date: '2026-08-01',
      },
      {
        kind: 'viewing_slot',
        id: 'b',
        title: 'B',
        meta: '',
        status: 'Open',
        date: '2026-08-01',
      },
    ])
    expect(counts['2026-08-01']).toBe(2)
  })
})
