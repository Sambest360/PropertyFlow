import { describe, expect, it } from 'vitest'
import {
  API_ME_RETRY_TIMEOUT_MS,
  API_ME_TIMEOUT_MS,
  SESSION_PROBE_MAX_MS,
} from '../api/authClient'
import { authGateGraceMs, shouldDeferAuthRedirect, STORED_IDENTITY_GRACE_MS } from './authGate'

describe('authGate (L02 cold /workspace)', () => {
  it('SESSION_PROBE_MAX_MS covers initial /me + one retry', () => {
    expect(SESSION_PROBE_MAX_MS).toBeGreaterThanOrEqual(API_ME_TIMEOUT_MS + API_ME_RETRY_TIMEOUT_MS)
  })

  it('extends grace while a JWT-backed probe may still succeed', () => {
    expect(authGateGraceMs(true)).toBe(SESSION_PROBE_MAX_MS)
    expect(authGateGraceMs(false)).toBe(STORED_IDENTITY_GRACE_MS)
  })

  it('defers redirect while token or stored id remains before grace elapses', () => {
    expect(
      shouldDeferAuthRedirect({
        loginInFlight: false,
        storedAuthUserId: 'u-landlord',
        hasAuthToken: true,
        storedGraceDone: false,
      }),
    ).toBe(true)
    expect(
      shouldDeferAuthRedirect({
        loginInFlight: false,
        storedAuthUserId: null,
        hasAuthToken: true,
        storedGraceDone: false,
      }),
    ).toBe(true)
    expect(
      shouldDeferAuthRedirect({
        loginInFlight: false,
        storedAuthUserId: 'u-landlord',
        hasAuthToken: false,
        storedGraceDone: true,
      }),
    ).toBe(false)
  })
})
