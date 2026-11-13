import { describe, expect, it } from 'vitest'
import { parseStay, quoteStay, refundPercent, guestBookingEmail, today } from './guesthouses.js'

describe('guest house pricing', () => {
  const room = { nightlyRate: 800, weekendRate: 1000, cleaningFee: 150 }

  it('charges the weekend rate on Fri and Sat nights only', () => {
    // 2026-11-12 is a Thursday: Thu, Fri, Sat nights
    const q = quoteStay(room, 1, '2026-11-12', 3)
    expect(q.nightly.map((n) => n.rate)).toEqual([800, 1000, 1000])
    expect(q.accommodation).toBe(2800)
    expect(q.tourismLevy).toBe(28)
    expect(q.total).toBe(2800 + 150 + 28)
  })

  it('uses the nightly rate when no weekend rate is set', () => {
    const q = quoteStay({ ...room, weekendRate: null }, 0, '2026-11-13', 2)
    expect(q.accommodation).toBe(1600)
    expect(q.tourismLevy).toBe(0)
  })

  it('validates stays as [checkIn, checkOut)', () => {
    expect(parseStay('2026-12-01', '2026-12-04')).toEqual({ checkIn: '2026-12-01', checkOut: '2026-12-04', nights: 3 })
    expect(parseStay(undefined, undefined)).toBeNull()
    expect(() => parseStay('2026-12-04', '2026-12-04')).toThrow(/after check-in/)
    expect(() => parseStay('2026-12-04', 'x')).toThrow()
  })

  it('applies cancellation policies by notice given', () => {
    const now = new Date('2026-11-01T12:00:00Z')
    expect(refundPercent('flexible', '2026-11-03', now)).toBe(100)
    expect(refundPercent('flexible', '2026-11-01', now)).toBe(0)
    expect(refundPercent('moderate', '2026-11-10', now)).toBe(100)
    expect(refundPercent('moderate', '2026-11-04', now)).toBe(50)
    expect(refundPercent('strict', '2026-11-20', now)).toBe(100)
    expect(refundPercent('strict', '2026-11-10', now)).toBe(50)
    expect(refundPercent('strict', '2026-11-05', now)).toBe(0)
  })
})

describe('guest booking emails and dates', () => {
  const booking = {
    reference: 'GH-ABCD2345',
    guesthouseName: 'Sea Breeze',
    roomName: 'Garden room',
    checkIn: '2027-03-05',
    checkOut: '2027-03-07',
    nights: 2,
    guests: 2,
    total: 12345.5,
    checkInTime: '14:00',
    checkOutTime: '10:00',
  }

  it('a request tells the guest the reference, the stay, the total and what happens next', () => {
    const m = guestBookingEmail('requested', booking)
    expect(m.title).toBe('Booking request received: Sea Breeze')
    expect(m.body).toContain('Reference GH-ABCD2345.')
    expect(m.body).toContain('Garden room, 2027-03-05 to 2027-03-07 (2 nights, 2 guests)')
    expect(m.body).toContain('Total R 12 345.50')
    expect(m.body).toContain('24 hours')
  })

  it('a confirmation gives check-in and check-out times and the host note', () => {
    const m = guestBookingEmail('confirmed', booking, { note: 'Gate code 4411' })
    expect(m.title).toBe('Your stay at Sea Breeze is confirmed')
    expect(m.body).toContain('Check-in from 14:00, check-out by 10:00')
    expect(m.body).toContain('Note from the host: Gate code 4411')
  })

  it('a guest cancellation states the refund percentage; a host cancellation says full refund', () => {
    expect(guestBookingEmail('cancelled_by_guest', booking, { refundPercent: 50 }).body).toContain('50% of what you have paid')
    expect(guestBookingEmail('cancelled_by_host', booking).body).toContain('in full')
    expect(guestBookingEmail('declined', booking).title).toContain('declined')
  })

  it('one night and one guest are singular', () => {
    expect(guestBookingEmail('requested', { ...booking, nights: 1, guests: 1 }).body).toContain('(1 night, 1 guest)')
  })

  it('today is the South African date: 23:30 UTC is already tomorrow there', () => {
    expect(today(new Date('2027-03-04T23:30:00Z'))).toBe('2027-03-05')
    expect(today(new Date('2027-03-04T21:59:00Z'))).toBe('2027-03-04')
  })

  it('refund windows count from 14:00 South African time on the check-in day', () => {
    // 24h before 14:00 SAST on 5 March is 12:00 UTC on 4 March.
    expect(refundPercent('flexible', '2027-03-05', new Date('2027-03-04T12:00:00Z'))).toBe(100)
    expect(refundPercent('flexible', '2027-03-05', new Date('2027-03-04T12:01:00Z'))).toBe(0)
  })
})
