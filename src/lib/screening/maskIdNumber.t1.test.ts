import { describe, expect, it } from 'vitest'
import { maskIdNumber } from './consentTerms'

/** T1 advisory (Angela round 3): a short ID never reveals most of itself. */
describe('maskIdNumber', () => {
  it('keeps the last 4 of a normal SA ID or passport', () => {
    expect(maskIdNumber('8001015009087')).toBe('•••••••••9087')
    expect(maskIdNumber('A1234567')).toBe('••••4567')
    expect(maskIdNumber('')).toBe('')
    expect(maskIdNumber(null)).toBe('')
  })

  it('reveals at most a quarter of an ID shorter than 8 characters', () => {
    for (const id of ['A12', '1234', 'AB123', '123456', 'X123456']) {
      const m = maskIdNumber(id)
      const shown = m.replace(/\u2022/g, '')
      expect(m).toContain('\u2022')
      expect(shown.length * 4).toBeLessThanOrEqual(id.length)
      expect(id.endsWith(shown)).toBe(true)
    }
    expect(maskIdNumber('AB123')).toBe('••••3')
    expect(maskIdNumber('A12')).toBe('••••')
  })

  it('is stable when applied to an already masked value', () => {
    for (const id of ['8001015009087', 'AB123', 'A12']) {
      expect(maskIdNumber(maskIdNumber(id))).toBe(maskIdNumber(id))
    }
  })
})
