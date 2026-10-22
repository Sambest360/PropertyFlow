import { Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { readAuthToken } from '../lib/api/authClient'
import { authGateGraceMs, shouldDeferAuthRedirect } from '../lib/auth/authGate'
import { AUTH_USER_STORAGE_KEY } from '../lib/clientCache'

const ForcedChangePasswordPage = lazy(() => import('../pages/account/ChangePasswordPage'))

const AUTH_KEY = AUTH_USER_STORAGE_KEY

function readStoredAuthUserId(): string | null {
  try {
    return localStorage.getItem(AUTH_KEY)
  } catch {
    return null
  }
}

/** Gates /workspace/* behind a real session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, authReady, loginInFlight, mustChangePassword } = useAuth()
  const location = useLocation()
  const [storedGraceDone, setStoredGraceDone] = useState(false)

  useEffect(() => {
    // Post-sign-in hold: do not start the grace countdown (or an immediate
    // bounce) while login() is still shielding the first portal commit.
    if (!authReady || isAuthenticated || loginInFlight) {
      setStoredGraceDone(false)
      return
    }
    const storedId = readStoredAuthUserId()
    const hasToken = Boolean(readAuthToken())
    if (!storedId && !hasToken) {
      setStoredGraceDone(true)
      return
    }
    setStoredGraceDone(false)
    const t = window.setTimeout(() => setStoredGraceDone(true), authGateGraceMs(hasToken))
    return () => window.clearTimeout(t)
  }, [authReady, isAuthenticated, loginInFlight])

  if (!authReady) {
    const hasPendingSession = Boolean(readAuthToken()) || Boolean(readStoredAuthUserId())
    if (hasPendingSession) {
      return (
        <div className="relative min-h-screen">
          {children}
          <div
            className="pointer-events-none absolute inset-0 z-[100] flex items-center justify-center bg-white/75"
            aria-live="polite"
          >
            <p className="text-sm font-medium text-ink-500">Verifying session…</p>
          </div>
        </div>
      )
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-ink-500">
        Checking session…
      </div>
    )
  }

  if (!isAuthenticated) {
    // Soft gate: authReady may have flipped guest while a JWT is still verifying
    // (AuthContext 5s/12s probe). Avoid immediate /login — LoginPage purge would
    // wipe the still-live Sipho session (My applications bounce).
    // remint58 grace2: same belt while loginInFlight is held through navigate,
    // even if AUTH_KEY was already cleared by a racing guest purge.
    if (
      shouldDeferAuthRedirect({
        loginInFlight,
        storedAuthUserId: readStoredAuthUserId(),
        hasAuthToken: Boolean(readAuthToken()),
        storedGraceDone,
      })
    ) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-white text-sm text-ink-500">
          Checking session…
        </div>
      )
    }
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace state={{ from: next }} />
  }

  // D3: a session on a temporary password sees only the change screen; the
  // server refuses everything else with 403 PASSWORD_CHANGE_REQUIRED.
  if (mustChangePassword) {
    return (
      <Suspense fallback={null}>
        <ForcedChangePasswordPage forced />
      </Suspense>
    )
  }

  return <>{children}</>
}
