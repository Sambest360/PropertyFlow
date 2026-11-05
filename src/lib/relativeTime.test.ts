import { describe, expect, it } from 'vitest'
import { relativeAge } from './relativeTime'

const now = new Date('2026-11-05T12:00:00')
describe('relativeAge', () => {
  it('counts days past the first day', () => {
    expect(relativeAge('2026-11-05T11:58:00', now)).toBe('2 min ago')
    expect(relativeAge('2026-11-05T07:00:00', now)).toBe('5 h ago')
    expect(relativeAge('2026-11-04T20:00:00', now)).toBe('yesterday')
    expect(relativeAge('2026-11-03T09:00:00', now)).toBe('2 days ago')
    expect(relativeAge('2026-11-02', now)).toBe('3 days ago')
    expect(relativeAge(null, now)).toBe('—')
  })
})
