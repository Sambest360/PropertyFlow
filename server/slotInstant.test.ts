import { describe, expect, it } from 'vitest'
import { slotStartSast } from './slotInstant.js'
import { noticeHoursMet } from './occupiedListing.js'

describe('slotStartSast (Africa/Johannesburg wall clock to a real instant)', () => {
  it('is UTC+2 whatever the server time zone', () => {
    expect(slotStartSast('2027-01-11', '00:00').toISOString()).toBe('2027-01-10T22:00:00.000Z')
    expect(slotStartSast('2027-01-11', '00:45:00').toISOString()).toBe('2027-01-10T22:45:00.000Z')
    expect(slotStartSast('2027-07-01', '14:30').toISOString()).toBe('2027-07-01T12:30:00.000Z')
  })

  it('24h notice is measured on the real instant across the 2h boundary', () => {
    const now = new Date('2027-01-09T22:30:00Z') // 00:30 SAST, 10 Jan
    expect(noticeHoursMet(slotStartSast('2027-01-11', '00:00'), now, 24)).toBe(false) // 23.5h
    expect(noticeHoursMet(slotStartSast('2027-01-11', '00:30'), now, 24)).toBe(true) // 24h exactly
    // The old naive parse (server on UTC) read 00:00 as 00:00Z: 25.5h, wrongly allowed.
    expect(noticeHoursMet(new Date('2027-01-11T00:00:00Z'), now, 24)).toBe(true)
  })

  it('yields an invalid date for garbage input (caller refuses it)', () => {
    expect(Number.isNaN(slotStartSast('not-a-date', 'xx').getTime())).toBe(true)
  })
})
