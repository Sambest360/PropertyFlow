import { describe, expect, it } from 'vitest'
import { dateOnly } from './bootstrap'

describe('dateOnly', () => {
  it('reads a DATE column (local midnight) as its own day, whatever the server time zone', () => {
    expect(dateOnly(new Date(2026, 10, 5))).toBe('2026-11-05')
  })
  it('keeps strings and timestamps as before', () => {
    expect(dateOnly('2026-11-05')).toBe('2026-11-05')
    expect(dateOnly(new Date('2026-11-05T13:45:00Z'))).toBe('2026-11-05')
    expect(dateOnly(null)).toBe('')
  })
})
