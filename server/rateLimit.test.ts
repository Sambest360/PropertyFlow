import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  authFailureBlocked,
  authIpRateLimit,
  clearAuthFailures,
  recordAuthFailure,
} from './rateLimit'

const ENV_SNAPSHOT = { ...process.env }

/**
 * In-memory sliding-window limiter for the auth endpoints
 * (SECURITY_FIXES.md backlog item). Limits are read from env on each call,
 * so each test shrinks the window and uses unique IP/email keys to stay
 * isolated from the module-level bucket maps.
 */
describe('auth rate limiter', () => {
  beforeEach(() => {
    process.env.AUTH_RATE_LIMIT_MAX = '2'
    process.env.AUTH_RATE_LIMIT_WINDOW_MIN = '15'
    process.env.AUTH_RATE_LIMIT_LOGIN_MAX = '2'
  })
  afterEach(() => {
    process.env = { ...ENV_SNAPSHOT }
  })

  it('blocks after the per-IP request cap and reports retry time', () => {
    expect(authIpRateLimit('203.0.113.10').ok).toBe(true)
    expect(authIpRateLimit('203.0.113.10').ok).toBe(true)
    const blocked = authIpRateLimit('203.0.113.10')
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })

  it('locks an (ip + email) account after repeated failures and clears on success', () => {
    recordAuthFailure('198.51.100.7', 'Victim@Example.com')
    expect(authFailureBlocked('198.51.100.7', 'victim@example.com').ok).toBe(true)
    recordAuthFailure('198.51.100.7', 'victim@example.com')
    expect(authFailureBlocked('198.51.100.7', 'victim@example.com').ok).toBe(false)
    clearAuthFailures('198.51.100.7', 'victim@example.com')
    expect(authFailureBlocked('198.51.100.7', 'victim@example.com').ok).toBe(true)
  })

  it('does not lock a different email from the same IP', () => {
    recordAuthFailure('198.51.100.9', 'a@x.com')
    recordAuthFailure('198.51.100.9', 'a@x.com')
    expect(authFailureBlocked('198.51.100.9', 'b@x.com').ok).toBe(true)
  })
})
