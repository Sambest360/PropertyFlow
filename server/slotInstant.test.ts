import { describe, expect, it } from 'vitest'
import { slotStartSast, slotStoredStart } from './slotInstant.js'
import { noticeHoursMet } from './occupiedListing.js'
import { bookingWallClock } from './bootstrap.js'

describe('slotStoredStart (Michael ruling 2: SAST wall time labelled Z, the app convention)', () => {
  it('stores the slot wall time as-is, labelled Z, whatever the server time zone', () => {
    expect(slotStoredStart('2027-01-11', '10:00').toISOString()).toBe('2027-01-11T10:00:00.000Z')
    expect(slotStoredStart('2027-01-11', '00:45:00').toISOString()).toBe('2027-01-11T00:45:00.000Z')
    expect(slotStoredStart('2027-07-01', '14:00').toISOString()).toBe('2027-07-01T14:00:00.000Z')
  })

  it('reads back through the bootstrap viewings mapping as the same date and time (10:00, 00:45, 14:00)', () => {
    for (const [d, t] of [['2027-01-11', '10:00'], ['2027-01-11', '00:45'], ['2027-07-01', '14:00']] as const) {
      expect(bookingWallClock(slotStoredStart(d, t))).toEqual({ date: d, time: t })
      // pg hands timestamptz back as a Date; a string read (Supabase JS) maps the same.
      expect(bookingWallClock(slotStoredStart(d, t).toISOString())).toEqual({ date: d, time: t })
    }
  })

  it('a guest booking and a staff booking for the same slot store the identical value', () => {
    // publicEnquiry.ts (guest) and writes.ts upsertViewing (staff) both store slotStoredStart(...).toISOString().
    const guest = slotStoredStart('2027-03-02', '09:30:00').toISOString()
    const staff = slotStoredStart('2027-03-02', '09:30').toISOString()
    expect(guest).toBe(staff)
  })

  it('yields an invalid date for garbage input (caller refuses it)', () => {
    expect(Number.isNaN(slotStoredStart('not-a-date', 'xx').getTime())).toBe(true)
  })
})

describe('slotStartSast (notice check only: Africa/Johannesburg wall clock to a real instant)', () => {
  it('is UTC+2 whatever the server time zone', () => {
    expect(slotStartSast('2027-01-11', '00:00').toISOString()).toBe('2027-01-10T22:00:00.000Z')
    expect(slotStartSast('2027-01-11', '00:45:00').toISOString()).toBe('2027-01-10T22:45:00.000Z')
    expect(slotStartSast('2027-07-01', '14:30').toISOString()).toBe('2027-07-01T12:30:00.000Z')
  })

  it('24h boundary: 23h59 is refused, 24h01 is allowed', () => {
    const now = new Date('2027-01-09T08:00:00Z') // 10:00 SAST, 9 Jan
    expect(noticeHoursMet(slotStartSast('2027-01-10', '09:59'), now, 24)).toBe(false) // 23h59
    expect(noticeHoursMet(slotStartSast('2027-01-10', '10:01'), now, 24)).toBe(true) // 24h01
  })

  it('24h notice is measured on the real instant across midnight and the 2h boundary', () => {
    const now = new Date('2027-01-09T22:30:00Z') // 00:30 SAST, 10 Jan
    expect(noticeHoursMet(slotStartSast('2027-01-11', '00:29'), now, 24)).toBe(false) // 23h59, next SAST day
    expect(noticeHoursMet(slotStartSast('2027-01-11', '00:31'), now, 24)).toBe(true) // 24h01
    // Reading the stored (Z-labelled) value as a real instant would be 2h off: 00:29 looks 25h59 away.
    expect(noticeHoursMet(slotStoredStart('2027-01-11', '00:29'), now, 24)).toBe(true)
  })

  it('yields an invalid date for garbage input (caller refuses it)', () => {
    expect(Number.isNaN(slotStartSast('not-a-date', 'xx').getTime())).toBe(true)
  })
})
