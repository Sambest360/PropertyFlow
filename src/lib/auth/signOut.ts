/**
 * Shared, fully-reliable sign-out used by every Sign out surface
 * (avatar RoleSwitcher, marketplace header, mobile bottom nav).
 *
 * QA GO #5 (P0-2): SPA-navigate-after-logout left stale bootstrap state,
 * stale role badges, and occasional hung navigations (`about:blank` /
 * ERR_TIMED_OUT on the next `/login`). A full-page navigation after the
 * logout round-trip guarantees a clean session for the next user — same
 * mechanism the register flow already uses (`redirectToLogin`).
 */
import { clearPendingRegistrationDocs } from './registrationDocs'
import { APP_STATE_STORAGE_KEY, AUTH_USER_STORAGE_KEY, PG_SOURCE_STORAGE_KEY } from '../clientCache'

/** Session-scoped keys that must not leak across users. */
export const STALE_KEYS = [
  'pf-register-email',
  'propertyflow-auth-token',
  AUTH_USER_STORAGE_KEY,
  'propertyflow-auth-real-user',
  // spec-portal-first-load: the previous user's AppState mirror must not
  // survive sign-out on a shared browser.
  APP_STATE_STORAGE_KEY,
  PG_SOURCE_STORAGE_KEY,
]

function clearStaleSessionKeys() {
  try {
    for (const k of STALE_KEYS) localStorage.removeItem(k)
    sessionStorage.removeItem('pf-register-email')
    const storages = [localStorage, sessionStorage]
    for (const store of storages) {
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
    /* storage unavailable — best effort */
  }
  clearPendingRegistrationDocs()
}

/**
 * Await logout, clear every client-side session artifact, then hard-navigate
 * to /login (keeping `next` so the new user returns where they left off).
 * The page load wipes React state — no stale role badge or sidebar.
 */
export async function signOutAndRedirect(
  logout: () => Promise<void>,
  next?: string | null,
): Promise<void> {
  try {
    await Promise.race([
      logout(),
      // Never hang the UI on a wedged network call — local clearing still runs.
      new Promise((r) => setTimeout(r, 4000)),
    ])
  } catch {
    /* network failures must not block sign-out */
  }
  clearStaleSessionKeys()
  const qs = new URLSearchParams()
  if (next) qs.set('next', next)
  const suffix = qs.toString()
  window.location.assign(suffix ? `/login?${suffix}` : '/login')
}
