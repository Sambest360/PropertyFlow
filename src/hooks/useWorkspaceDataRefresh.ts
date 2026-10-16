import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/AppStore'

const DEBOUNCE_MS = 250

function shouldRefreshWorkspaceRoute(pathname: string): boolean {
  return pathname.startsWith('/workspace')
}

/** Lite bootstrap refresh when navigating workspace — keeps lists in sync with DB. */
export function useWorkspaceDataRefresh() {
  const { pathname } = useLocation()
  const { isAuthenticated, user } = useAuth()
  const { refreshSessionData } = useStore()
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
      void refreshSessionData({ force: true })
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    }
  }, [pathname, isAuthenticated, user.id, refreshSessionData])
}
