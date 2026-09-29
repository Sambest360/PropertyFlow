import { describe, expect, it } from 'vitest'
import { centsToZarInput, formatCentsAsZar, parseZarToCents, randsFromCents } from './zarToCents'

describe('parseZarToCents', () => {
  it('stores R12 345,67 as 1234567 cents', () => {
    const parsed = parseZarToCents('R12 345,67')
    expect(parsed).toEqual({ ok: true, cents: 1234567 })
    if (parsed.ok) expect(Number.isInteger(parsed.cents)).toBe(true)
  })

  it('accepts a point as the decimal separator', () => {
    expect(parseZarToCents('12345.67')).toEqual({ ok: true, cents: 1234567 })
    expect(parseZarToCents('12 345.67')).toEqual({ ok: true, cents: 1234567 })
  })

  it('accepts a comma as the decimal separator', () => {
    expect(parseZarToCents('12345,67')).toEqual({ ok: true, cents: 1234567 })
    expect(parseZarToCents('12,3')).toEqual({ ok: true, cents: 1230 })
  })

  it('treats spaces as thousands separators', () => {
    expect(parseZarToCents('1 234 567')).toEqual({ ok: true, cents: 123456700 })
    expect(parseZarToCents('R 12 345,67')).toEqual({ ok: true, cents: 1234567 })
  })

  it('keeps a single decimal digit and whole rands exact', () => {
    expect(parseZarToCents('0,1')).toEqual({ ok: true, cents: 10 })
    expect(parseZarToCents('1,01')).toEqual({ ok: true, cents: 101 })
    expect(parseZarToCents('0,29')).toEqual({ ok: true, cents: 29 })
    expect(parseZarToCents('10')).toEqual({ ok: true, cents: 1000 })
  })

  it('accepts a real zero without coercing bad input', () => {
    expect(parseZarToCents('0')).toEqual({ ok: true, cents: 0 })
    expect(parseZarToCents('0,00')).toEqual({ ok: true, cents: 0 })
    expect(parseZarToCents('R0')).toEqual({ ok: true, cents: 0 })
  })

  it('rejects blank input', () => {
    for (const raw of ['', '   ', 'R', 'R ']) {
      const parsed = parseZarToCents(raw)
      expect(parsed.ok).toBe(false)
      if (!parsed.ok) {
        expect(parsed.message).toMatch(/income/i)
        expect(parsed).not.toHaveProperty('cents', 0)
      }
    }
  })

  it('rejects negative input', () => {
    for (const raw of ['-1', '-12,50', 'R-5', ' - 20']) {
      const parsed = parseZarToCents(raw)
      expect(parsed.ok).toBe(false)
      if (!parsed.ok) expect(parsed.message).toMatch(/negative/i)
    }
  })

  it('rejects non-numeric input', () => {
    for (const raw of ['abc', '12a', '1,234.56', '12.345,67', 'R12 345,67x', '--']) {
      const parsed = parseZarToCents(raw)
      expect(parsed.ok).toBe(false)
      if (!parsed.ok) expect(parsed.message.length).toBeGreaterThan(0)
    }
  })

  it('rejects more than two decimal places', () => {
    const parsed = parseZarToCents('12,345')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toMatch(/two decimal/i)
    expect(parseZarToCents('10.999').ok).toBe(false)
  })

  it('round-trips the example through the input formatter', () => {
    const parsed = parseZarToCents('R12 345,67')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(centsToZarInput(parsed.cents)).toBe('12 345,67')
    expect(parseZarToCents(centsToZarInput(parsed.cents))).toEqual({ ok: true, cents: 1234567 })
    expect(formatCentsAsZar(parsed.cents)).toBe('R12 345,67')
    expect(randsFromCents(parsed.cents)).toBe(12345)
  })
})
