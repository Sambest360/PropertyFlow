import { describe, expect, it } from 'vitest'
import { passwordStrength } from './passwordStrength'
import { formatAuthError } from './authMessages'

describe('passwordStrength', () => {
  it('returns score 0 with empty label for empty input', () => {
    const s = passwordStrength('')
    expect(s.score).toBe(0)
    expect(s.label).toBe('')
    expect(s.hint).toBeNull()
  })

  it('floors common patterns at weak', () => {
    expect(passwordStrength('password123!').label).toBe('Weak')
    expect(passwordStrength('Qwerty123456').label).toBe('Weak')
  })

  it('penalises repeated characters', () => {
    expect(passwordStrength('aaaaaaaaaaaa').score).toBeLessThanOrEqual(2)
  })

  it('caps short but varied passwords below max', () => {
    // 9 chars, 4 classes but no length band beyond 8
    const s = passwordStrength('Abcdef1!x')
    expect(s.score).toBeLessThanOrEqual(3)
  })

  it('rewards 12+ chars with mixed classes as strong with no hint', () => {
    const s = passwordStrength('Corr3ct-Horse-Battery')
    expect(s.score).toBe(4)
    expect(s.label).toBe('Strong')
    expect(s.hint).toBeNull()
  })

  it('gives actionable hints below strong', () => {
    expect(passwordStrength('abcdefgh').hint).toMatch(/12\+ characters/i)
    expect(passwordStrength('abcdefghijkl').hint).toMatch(/mix|symbol/i)
  })
})

describe('formatAuthError rate-limit copy with Retry-After', () => {
  it('includes minutes when the server sent Retry-After', () => {
    const err = Object.assign(new Error('Too many attempts — please wait.'), {
      retryAfterSec: 600,
    })
    const r = formatAuthError(err.message, err)
    expect(r.title).toBe('Too many attempts')
    expect(r.text).toMatch(/about 10 minutes/)
  })

  it('falls back to generic copy without Retry-After', () => {
    const r = formatAuthError('Too many requests')
    expect(r.title).toBe('Too many attempts')
    expect(r.text).toMatch(/wait a few minutes/i)
  })
})
