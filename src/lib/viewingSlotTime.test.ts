import { describe, expect, it } from 'vitest'
import { isFutureViewingSlot } from './viewingSlotTime'

describe('isFutureViewingSlot', () => {
  it('rejects a slot that ended in the past', () => {
    const now = new Date('2026-10-14T18:00:00+02:00')
    expect(
      isFutureViewingSlot({ date: '2026-07-12', time: '09:30', durationMinutes: 60 }, now),
    ).toBe(false)
  })

  it('accepts a slot later today', () => {
    const now = new Date('2026-10-14T10:00:00+02:00')
    expect(
      isFutureViewingSlot({ date: '2026-10-14', time: '14:00', durationMinutes: 30 }, now),
    ).toBe(true)
  })
})
