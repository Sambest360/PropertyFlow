import { Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ACCOUNT_WISHLIST_PATH } from '../../lib/accountRoutes'
import BrowsePage from './BrowsePage'

/**
 * Public saved list for guests; signed-in users go to their account wishlist.
 * P1-4: never stick on a blank "checking session" — if auth hasn't resolved
 * within a short window (e.g. a wedged network probe), fall back to the
 * guest browse view instead of hanging.
 */
export default function SavedPage() {
  const { isAuthenticated, authReady } = useAuth()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (authReady) return
    const t = setTimeout(() => setTimedOut(true), 3000)
    return () => clearTimeout(t)
  }, [authReady])

  if (!authReady && !timedOut) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-ink-500">Checking your session…</p>
      </div>
    )
  }
  if (isAuthenticated) return <Navigate to={ACCOUNT_WISHLIST_PATH} replace />
  return <BrowsePage />
}
