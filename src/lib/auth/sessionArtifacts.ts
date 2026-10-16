/**
 * P0-1 (E2E #2): identity bleed on register failure.
 *
 * A failed or partially-failed signup must leave the browser anonymous —
 * never attached to a stale identity (e.g. a previous Super Admin session).
 * These helpers are the single source of truth for "clear everything".
 */

import { APP_STATE_STORAGE_KEY, AUTH_USER_STORAGE_KEY, PG_SOURCE_STORAGE_KEY } from '../clientCache'
import { clearPortfolioSnapshot } from '../portfolioSnapshot'

export type SessionArtifactSetters = {
  setSessionUser: (u: unknown) => void
  setUserId: (id: string) => void
  setRealUserId: (id: string | null) => void
}

export const AUTH_STORAGE_KEYS = [
  AUTH_USER_STORAGE_KEY,
  'propertyflow-auth-real-user',
  // P0-session (R11): AuthContext.logout alone used to miss this API-mode
  // token; leftover token + sb-*auth* keys resurrected Super Admin on /workspace.
  'propertyflow-auth-token',
  // spec-portal-first-load: previous user's AppState mirror + pg-source flag.
  APP_STATE_STORAGE_KEY,
  PG_SOURCE_STORAGE_KEY,
] as const

/** Wipe in-memory identity + persisted artifacts. Storage failures are non-fatal. */
export function clearSessionArtifacts(setters: SessionArtifactSetters): void {
  setters.setSessionUser(null)
  setters.setUserId('')
  setters.setRealUserId(null)
  try {
    clearPortfolioSnapshot()
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

// P0 empty-DB SA: LoginPage mount purge must not race a concurrent sign-in.
// Same pattern as registerInFlight — login owns the shell for its duration.
let loginInFlight = false

export function setLoginInFlight(inFlight: boolean): void {
  loginInFlight = inFlight
}

export function isLoginInFlight(): boolean {
  return loginInFlight
}

// remint58 grace2: a bare-/login guest purge can already be awaiting signOut
// when login() starts. Bump the generation so that purge cannot clearSession
// after the navigation hold drops, and ignore the matching late signed-out
// auth callback (GoTrue emits it when the pre-login signOut settles).
let purgeGeneration = 0
let purgesInFlight = 0
let staleSignOutIgnores = 0
let onGuestPurgesDrained: (() => void) | null = null
// remint59 grace3: once login() invalidates an in-flight guest purge, that
// signOut must not reach GoTrue _removeSession (it would delete the JWT just
// written by signInWithPassword). Generation-skip only avoids the later
// clearSessionArtifacts.
let suppressGuestSignOutRemove = false

export function guestPurgesInFlight(): number {
  return purgesInFlight
}

/** Capture the generation for a purge that passed the in-flight entry guard. */
export function beginGuestPurge(): number {
  purgesInFlight += 1
  return purgeGeneration
}

export function endGuestPurge(): void {
  purgesInFlight = Math.max(0, purgesInFlight - 1)
  if (purgesInFlight === 0) {
    // Sign-out has returned (remove either ran or was suppressed). Further
    // nulls come from the deferred auth decision, not this flag.
    suppressGuestSignOutRemove = false
    onGuestPurgesDrained?.()
  }
}

export function guestPurgeGenerationCurrent(generation: number): boolean {
  return generation === purgeGeneration
}

export function guestSignOutRemoveSuppressed(): boolean {
  return suppressGuestSignOutRemove
}

export function shieldGuestPurgeForLogin(): void {
  purgeGeneration += 1
  if (purgesInFlight > 0) {
    staleSignOutIgnores += purgesInFlight
    suppressGuestSignOutRemove = true
  }
}

/** True once: a signed-out event belongs to a guest purge login() invalidated. */
export function consumeStaleSignOutIgnore(): boolean {
  if (staleSignOutIgnores <= 0) return false
  staleSignOutIgnores -= 1
  return true
}

/**
 * Deferred onAuthStateChange decisions (setTimeout + getUser). The login hold
 * must stay up until these settle — a sign-out's SIGNED_OUT / a follow-up
 * SIGNED_IN can still cb(null) after the purge promise resolves.
 */
let deferredAuthDecisions = 0

export function deferredAuthDecisionsInFlight(): number {
  return deferredAuthDecisions
}

export function beginDeferredAuthDecision(): void {
  deferredAuthDecisions += 1
}

export function endDeferredAuthDecision(): void {
  deferredAuthDecisions = Math.max(0, deferredAuthDecisions - 1)
  if (deferredAuthDecisions === 0) onGuestPurgesDrained?.()
}

/** AuthProvider registers this so the post-navigate hold can drop when the purge settles. */
export function setGuestPurgeDrainHook(fn: (() => void) | null): void {
  onGuestPurgesDrained = fn
}
