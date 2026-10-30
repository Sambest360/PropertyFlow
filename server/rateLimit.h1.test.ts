import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as rl from './rateLimit'

/**
 * H1 (spec r5 :60-68) limiter numbers, and Jim C2: buckets with different
 * window lengths never share a map, so a 15-minute prune can not trim a
 * 1-hour bucket.
 */
const ENV_SNAPSHOT = { ...process.env }
const T0 = new Date('2026-10-30T10:00:00+02:00')

beforeEach(() => {
  for (const k of Object.keys(process.env)) if (k.startsWith('AUTH_RATE_LIMIT')) delete process.env[k]
  rl.resetRateLimitsForTests()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})
afterEach(() => {
  vi.useRealTimers()
  process.env = { ...ENV_SNAPSHOT }
})

const at = (min: number) => vi.setSystemTime(new Date(T0.getTime() + min * 60_000))

describe('H1 C2: per-window maps', () => {
  it('with more than 512 keys, a 1-hour bucket still refuses at +20 min', () => {
    const email = 'c2@example.com'
    for (let i = 0; i < 3; i++) expect(rl.listingEnquiryContactRateLimit(email, 'PR-1').ok).toBe(true)
    expect(rl.listingEnquiryContactRateLimit(email, 'PR-1').ok).toBe(false)
    at(20)
    // > 512 distinct 15-minute keys force a prune with the 15-minute window.
    for (let i = 0; i < 600; i++) rl.authIpRateLimit(`10.${Math.floor(i / 250)}.${i % 250}.1`)
    for (let i = 0; i < 600; i++) rl.listingEnquiryIpRateLimit(`10.50.${Math.floor(i / 250)}.${i % 250}`)
    const again = rl.listingEnquiryContactRateLimit(email, 'PR-1')
    expect(again.ok).toBe(false)
    expect(again.retryAfterSec).toBeGreaterThan(30 * 60)
    expect(again.retryAfterSec).toBeLessThanOrEqual(40 * 60)
  })

  it('the 10-minute notification bucket no longer shares a map with the 15-minute auth buckets', () => {
    process.env.NOTIFICATION_DISPATCH_MAX = '2'
    expect(rl.notificationDispatchRateLimit('actor-1', 2).ok).toBe(true)
    for (let i = 0; i < 600; i++) rl.authIpRateLimit(`10.60.${Math.floor(i / 250)}.${i % 250}`)
    expect(rl.notificationDispatchRateLimit('actor-1', 1).ok).toBe(false)
  })

  it('reviews: the 1-hour actor bucket survives a 15-minute prune too', () => {
    for (let i = 0; i < 5; i++) expect(rl.reviewRateLimit('u-1', '198.51.100.1').ok).toBe(true)
    at(20)
    for (let i = 0; i < 600; i++) rl.authIpRateLimit(`10.70.${Math.floor(i / 250)}.${i % 250}`)
    expect(rl.reviewRateLimit('u-1', '198.51.100.2').ok).toBe(false)
  })
})

describe('H1 numbers (code defaults)', () => {
  it('per-IP auth: 30 per 15 min (31st refused)', () => {
    for (let i = 0; i < 30; i++) expect(rl.authIpRateLimit('203.0.113.1').ok).toBe(true)
    const r = rl.authIpRateLimit('203.0.113.1')
    expect(r.ok).toBe(false)
    expect(r.retryAfterSec).toBeLessThanOrEqual(900)
  })

  it('lockout: 8 failures per (ip+email), sliding 15 min', () => {
    for (let i = 0; i < 8; i++) rl.recordAuthFailure('203.0.113.2', 'v@example.com')
    expect(rl.authFailureBlocked('203.0.113.2', 'v@example.com').ok).toBe(false)
    at(15)
    expect(rl.authFailureBlocked('203.0.113.2', 'v@example.com').ok).toBe(true)
  })

  it('forgot/set-password bucket pw:<ip> is separate from the login per-IP bucket (30 / 15 min)', () => {
    for (let i = 0; i < 31; i++) rl.authIpRateLimit('203.0.113.3')
    expect(rl.authIpRateLimit('203.0.113.3').ok).toBe(false)
    for (let i = 0; i < 30; i++) expect(rl.passwordFlowIpRateLimit('203.0.113.3').ok).toBe(true)
    expect(rl.passwordFlowIpRateLimit('203.0.113.3').ok).toBe(false)
  })

  it('clearAuthFailuresForEmail removes the lockout for that email from every IP, and only that email', () => {
    for (let i = 0; i < 8; i++) {
      rl.recordAuthFailure('203.0.113.4', 'Locked@Example.com')
      rl.recordAuthFailure('203.0.113.5', 'locked@example.com')
      rl.recordAuthFailure('203.0.113.4', 'other@example.com')
    }
    rl.clearAuthFailuresForEmail('LOCKED@example.com')
    expect(rl.authFailureBlocked('203.0.113.4', 'locked@example.com').ok).toBe(true)
    expect(rl.authFailureBlocked('203.0.113.5', 'locked@example.com').ok).toBe(true)
    expect(rl.authFailureBlocked('203.0.113.4', 'other@example.com').ok).toBe(false)
  })

  it('listing-enquiry: 20 per IP per 15 min; 3 per (email+unit) per hour', () => {
    for (let i = 0; i < 20; i++) expect(rl.listingEnquiryIpRateLimit('203.0.113.6').ok).toBe(true)
    expect(rl.listingEnquiryIpRateLimit('203.0.113.6').ok).toBe(false)
    for (let i = 0; i < 3; i++) expect(rl.listingEnquiryContactRateLimit('a@example.com', 'PR-9').ok).toBe(true)
    expect(rl.listingEnquiryContactRateLimit('A@Example.com ', 'pr-9').ok).toBe(false)
    expect(rl.listingEnquiryContactRateLimit('a@example.com', 'PR-10').ok).toBe(true)
  })

  it('verify-email: 10 per IP per 15 min', () => {
    for (let i = 0; i < 10; i++) expect(rl.verifyEmailIpRateLimit('203.0.113.7').ok).toBe(true)
    expect(rl.verifyEmailIpRateLimit('203.0.113.7').ok).toBe(false)
  })

  it('reviews: 5 per actor per hour, 20 per IP per hour', () => {
    for (let i = 0; i < 5; i++) expect(rl.reviewRateLimit('u-2', `198.51.100.${i}`).ok).toBe(true)
    expect(rl.reviewRateLimit('u-2', '198.51.100.99').ok).toBe(false)
    for (let i = 0; i < 20; i++) expect(rl.reviewRateLimit(`u-ip-${i}`, '198.51.100.50').ok).toBe(true)
    expect(rl.reviewRateLimit('u-ip-x', '198.51.100.50').ok).toBe(false)
  })

  it('login 429 copy says "Try again in N min or reset your password"', () => {
    expect(rl.loginTooManyRequests(840).body.message).toBe('Too many attempts. Try again in 14 min or reset your password.')
    expect(rl.loginTooManyRequests(30).body.message).toBe('Too many attempts. Try again in 1 min or reset your password.')
    expect(rl.loginTooManyRequests(840).headers['Retry-After']).toBe('840')
  })
})
