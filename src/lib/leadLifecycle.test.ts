import { describe, expect, it } from 'vitest'
import { formatLeadTime, isClosedLeadStage, isOpenLeadStage } from './leadLifecycle'

describe('leadLifecycle', () => {
  it('classifies closed stages', () => {
    expect(isClosedLeadStage('Lease Signed')).toBe(true)
    expect(isClosedLeadStage('Sale Completed')).toBe(true)
    expect(isClosedLeadStage('Rejected')).toBe(true)
    expect(isOpenLeadStage('New Lead')).toBe(true)
    expect(isOpenLeadStage('Viewing Scheduled')).toBe(true)
  })

  it('formats date-only lead timestamps', () => {
    expect(formatLeadTime('2026-07-20')).toMatch(/Jul/)
  })
})
