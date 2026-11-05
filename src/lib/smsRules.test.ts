import { describe, expect, it } from 'vitest'
import { normalizeSmsNumber, smsRuleFor, smsText } from './smsRules'

describe('smsRules', () => {
  it('texts only urgent steps', () => {
    expect(smsRuleFor({ title: 'Viewing confirmed' })?.id).toBe('viewing')
    expect(smsRuleFor({ title: 'Application approved' })?.id).toBe('application')
    expect(smsRuleFor({ title: 'Rent overdue for 12 Main St' })?.id).toBe('rent')
    expect(smsRuleFor({ title: 'New review posted' })).toBeNull()
  })
  it('normalises SA numbers', () => {
    expect(normalizeSmsNumber('082 123 4567')).toBe('27821234567')
    expect(normalizeSmsNumber('+27 82 123 4567')).toBe('27821234567')
    expect(normalizeSmsNumber('abc')).toBeNull()
  })
  it('keeps texts short', () => {
    expect(smsText('Hi', 'x'.repeat(1000), 'https://a.b/c').length).toBeLessThanOrEqual(300)
  })
})
