import { describe, expect, it } from 'vitest'
import { formatAuthError } from './authMessages'

describe('formatAuthError', () => {
  it('does not surface empty JSON as the only copy', () => {
    const empty = formatAuthError('{}')
    expect(empty.title).toBe('Sign-in failed')
    expect(empty.text).toMatch(/did not explain/i)
  })

  it('maps credentials vs server 500 vs rate limit', () => {
    expect(formatAuthError('Invalid login credentials').title).toBe('Sign-in failed')
    expect(formatAuthError('Server error (500): unexpected_failure').title).toBe('Auth service error')
    expect(formatAuthError('Too many requests').title).toBe('Too many attempts')
  })

  it('does not blame demo users or surface repair-auth on auth 500s', () => {
    const r = formatAuthError('Server error (500): unexpected_failure')
    expect(r.title).toBe('Auth service error')
    expect(r.text).toMatch(/auth service failed/i)
    expect(r.text).toMatch(/contact support/i)
    expect(r.text?.toLowerCase()).not.toMatch(/demo/)
    expect(r.text?.toLowerCase()).not.toMatch(/repair-auth/)
    expect(r.text?.toLowerCase()).not.toMatch(/npm run/)
  })

  it('rejects unusable demo domains with a next action', () => {
    const r = formatAuthError('Unable to validate email address: invalid')
    expect(r.title).toMatch(/real email/i)
    expect(r.text).toMatch(/propertyflow\.demo/i)
  })
})
