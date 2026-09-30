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
    // P0-register (R7): a stale Supabase GoTrue cache (sb-*auth* entries from a
    // previous staff session) must not survive a failed register — otherwise
    // the next session probe re-hydrates the old identity ("Super Admin
    // bleed"). Wipe it like signOut does.
    for (const store of [localStorage, sessionStorage]) {
      const keys: string[] = []
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i)
        if (key) keys.push(key)
      }
      for (const k of keys) {
        if (k.startsWith('sb-') && k.includes('auth')) store.removeItem(k)
      }
    }
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

// P0-register (R8): while a registration is in flight, a PREVIOUS user's live
// Supabase session can fire onAuthStateChange (token refresh, INITIAL_SESSION
// on a late subscribe) and hydrate that old identity into the shell — the
// "Ayanda attempt → Samuel Bampo" symptom. The register flow owns the shell
// for its duration.
let registerInFlight = false

export function setRegisterInFlight(inFlight: boolean): void {
  registerInFlight = inFlight
}

export function isRegisterInFlight(): boolean {
  return registerInFlight
}
