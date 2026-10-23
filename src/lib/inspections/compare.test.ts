import { describe, expect, it } from 'vitest'
import { formatCents, toneClasses, withRunningTotal, type CompareRow } from './compare'

function row(over: Partial<CompareRow>): CompareRow {
  return {
    itemId: 'i',
    itemName: 'E2E TEST item',
    moveInCondition: 'GOOD',
    moveInPhotos: [],
    moveOutCondition: 'GOOD',
    moveOutPhotos: [],
    outcome: null,
    tone: 'neutral',
    amountCents: 0,
    ...over,
  }
}

describe('inspection comparison helpers', () => {
  it('red Missing, amber Damaged, grey wear and tear', () => {
    expect(toneClasses('red')).toContain('bg-red-50')
    expect(toneClasses('amber')).toContain('bg-amber-50')
    expect(toneClasses('grey')).toContain('bg-stone-100')
  })

  it('running total skips wear and tear and stops at the deposit + interest', () => {
    const rows = withRunningTotal(
      [
        row({ itemId: 'a', outcome: 'MISSING', amountCents: 600_00 }),
        row({ itemId: 'b', outcome: 'WEAR_AND_TEAR', amountCents: 900_00 }),
        row({ itemId: 'c', outcome: 'DAMAGED', amountCents: 600_00 }),
      ],
      1000_00,
    )
    expect(rows.map((r) => r.runningCents)).toEqual([600_00, 600_00, 1000_00])
  })

  it('formats rand amounts', () => {
    expect(formatCents(123456)).toMatch(/^R 1.?234[.,]56$/)
  })
})
