import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/AppStore'
import { shouldSkipAuthBootstrapRefresh } from '../lib/bootstrapCoord'

const DEBOUNCE_MS = 250

/** Non-forced session refresh opts for workspace navigation (respects bootstrap cooldown). */
export const WORKSPACE_NAV_REFRESH_OPTS = { force: false as const }

export function workspaceNavRefreshAllowed(
  userId: string,
  hydratedForUserId: string | null,
): boolean {
  if (!userId || userId === 'guest') return false
  return !shouldSkipAuthBootstrapRefresh(userId, hydratedForUserId)
}

function shouldRefreshWorkspaceRoute(pathname: string): boolean {
  return pathname.startsWith('/workspace')
}

/** Lite bootstrap refresh when navigating workspace — keeps lists in sync with DB. */
export function useWorkspaceDataRefresh() {
  const { pathname } = useLocation()
  const { isAuthenticated, user } = useAuth()
  const { refreshSessionData, hydratedForUserId } = useStore()
  const timerRef = useRef<number | null>(null)
  const prevPathRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated || user.id === 'guest') return
    if (!shouldRefreshWorkspaceRoute(pathname)) return
    if (prevPathRef.current === pathname) return
    prevPathRef.current = pathname

    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (!workspaceNavRefreshAllowed(user.id, hydratedForUserId)) return
      void refreshSessionData(WORKSPACE_NAV_REFRESH_OPTS)
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    }
  }, [pathname, isAuthenticated, user.id, hydratedForUserId, refreshSessionData])
}
