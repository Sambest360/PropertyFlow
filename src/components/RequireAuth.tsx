import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'

/** Gates /workspace/* behind a real session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, authReady } = useAuth()
  const location = useLocation()

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-ink-500">
        Checking session…
      </div>
    )
  }

  if (!isAuthenticated) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace state={{ from: next }} />
  }

  return <>{children}</>
}
