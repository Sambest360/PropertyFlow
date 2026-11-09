import { describe, expect, it } from 'vitest'
import { parseStay, quoteStay, refundPercent } from './guesthouses.js'

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
