import { SESSION_PROBE_MAX_MS } from '../api/authClient'

/** Brief hold before /login when local identity remains after authReady. */
export const STORED_IDENTITY_GRACE_MS = 6_000

/** While a JWT-backed /me probe may still succeed, do not bounce to /login. */
export function authGateGraceMs(hasAuthToken: boolean): number {
  return hasAuthToken ? SESSION_PROBE_MAX_MS : STORED_IDENTITY_GRACE_MS
}

export function shouldDeferAuthRedirect(input: {
  loginInFlight: boolean
  storedAuthUserId: string | null
  hasAuthToken: boolean
  storedGraceDone: boolean
}): boolean {
  if (input.loginInFlight) return true
  const pending = Boolean(input.storedAuthUserId || input.hasAuthToken)
  return pending && !input.storedGraceDone
}
