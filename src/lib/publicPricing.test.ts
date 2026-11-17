import { describe, expect, it } from 'vitest'
import { quote, rand } from './publicPricing'

// The price sheet's test table: properties, per property, maintenance, monthly total, effective per property, onboarding.
const TABLE: Array<[number, string, string, string, string, string]> = [
  [5, 'R125', 'R250', 'R375', 'R75.00', 'R2 950'],
  [10, 'R250', 'R250', 'R500', 'R50.00', 'R2 950'],
  [11, 'R275', 'R750', 'R1 025', 'R93.18', 'R2 950'],
  [30, 'R750', 'R750', 'R1 500', 'R50.00', 'R2 950'],
  [150, 'R3 750', 'R1 500', 'R5 250', 'R35.00', 'R2 950'],
  [200, 'R5 000', 'R1 500', 'R6 500', 'R32.50', 'R2 950'],
  [201, 'R5 018', 'R2 950', 'R7 968', 'R39.64', 'R4 950'],
  [350, 'R7 700', 'R2 950', 'R10 650', 'R30.43', 'R4 950'],
  [800, 'R15 800', 'R4 950', 'R20 750', 'R25.94', 'R4 950'],
  [1000, 'R19 400', 'R4 950', 'R24 350', 'R24.35', 'R4 950'],
  [1001, 'R19 412', 'R7 950', 'R27 362', 'R27.33', 'R9 950'],
  [1500, 'R25 400', 'R7 950', 'R33 350', 'R22.23', 'R9 950'],
]

describe('public price calculator', () => {
  it.each(TABLE)('%i properties', (n, per, maint, total, eff, onb) => {
    const q = quote(n)!
    expect([rand(q.perProperty), rand(q.maintenance), rand(q.monthlyTotal), rand(q.effectivePerProperty, true), rand(q.onboarding)]).toEqual([
      per,
      maint,
      total,
      eff,
      onb,
    ])
    expect(q.annual).toBe(q.monthlyTotal * 10)
  })

  it('quotes nothing above 2 000 or for non-whole or zero counts', () => {
    expect(quote(2000)?.maintenance).toBe(7950)
    expect(quote(2001)).toBeNull()
    expect(quote(0)).toBeNull()
    expect(quote(2.5)).toBeNull()
  })
})
