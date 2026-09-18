/**
 * P0-1 (E2E #2): identity bleed on register failure.
 *
 * A failed or partially-failed signup must leave the browser anonymous —
 * never attached to a stale identity (e.g. a previous Super Admin session).
 * These helpers are the single source of truth for "clear everything".
 */

export type SessionArtifactSetters = {
  setSessionUser: (u: unknown) => void
  setUserId: (id: string) => void
  setRealUserId: (id: string | null) => void
}

export const AUTH_STORAGE_KEYS = [
  'propertyflow-auth-user',
  'propertyflow-auth-real-user',
] as const

/** Wipe in-memory identity + persisted artifacts. Storage failures are non-fatal. */
export function clearSessionArtifacts(setters: SessionArtifactSetters): void {
  setters.setSessionUser(null)
  setters.setUserId('')
  setters.setRealUserId(null)
  try {
    for (const key of AUTH_STORAGE_KEYS) localStorage.removeItem(key)
  } catch {
    /* storage unavailable — in-memory clear above already made identity unusable */
  }
}

/**
 * Run a signup attempt; on ANY rejection, clear session artifacts before the
 * error propagates so the UI stays anonymous (error copy is the caller's job).
 */
export async function registerWithSessionGuard<T>(
  attempt: () => Promise<T>,
  clear: () => void,
): Promise<T> {
  try {
    return await attempt()
  } catch (err) {
    clear()
    throw err
  }
}
