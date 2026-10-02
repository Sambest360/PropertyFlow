import { Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'

const AUTH_KEY = 'propertyflow-auth-user'
/** Brief hold before /login when local identity remains after authReady. */
const STORED_IDENTITY_GRACE_MS = 6_000

function readStoredAuthUserId(): string | null {
  try {
    return localStorage.getItem(AUTH_KEY)
  } catch {
    return null
  }
}

/** Gates /workspace/* behind a real session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, authReady } = useAuth()
  const location = useLocation()
  const [storedGraceDone, setStoredGraceDone] = useState(false)

  useEffect(() => {
    if (!authReady || isAuthenticated) {
      setStoredGraceDone(false)
      return
    }
    if (!readStoredAuthUserId()) {
      setStoredGraceDone(true)
      return
    }
    setStoredGraceDone(false)
    const t = window.setTimeout(() => setStoredGraceDone(true), STORED_IDENTITY_GRACE_MS)
    return () => window.clearTimeout(t)
  }, [authReady, isAuthenticated])

  if (!authReady) {
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
    if (readStoredAuthUserId() && !storedGraceDone) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-white text-sm text-ink-500">
          Checking session…
        </div>
      )
    }
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace state={{ from: next }} />
  }

  return <>{children}</>
}
