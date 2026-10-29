import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/AppStore'
import { isApiEnabled } from '../lib/api/config'
import { LIVE_SYNC_DEBOUNCE_MS, LIVE_SYNC_POLL_MS } from '../lib/liveSync'

/**
 * Keeps workspace data fresh: refresh on focus and on a short poll.
 */
export function useLiveSync() {
  const { isAuthenticated, user } = useAuth()
  const { refreshSessionData } = useStore()
  const debounceRef = useRef<number | null>(null)
  const actorRef = useRef({ userId: user.id, role: user.role, agencyId: user.agencyId })
  actorRef.current = { userId: user.id, role: user.role, agencyId: user.agencyId }

  useEffect(() => {
    if (!isAuthenticated || user.id === 'guest') return
    if (!isApiEnabled) return

    const scheduleRefresh = () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null
        void refreshSessionData({ force: false, ingestNotifications: true })
      }, LIVE_SYNC_DEBOUNCE_MS)
    }

    const onFocus = () => scheduleRefresh()
    window.addEventListener('focus', onFocus)

    const poll = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      scheduleRefresh()
    }, LIVE_SYNC_POLL_MS)

    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(poll)
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
    }
  }, [isAuthenticated, user.id, user.role, user.agencyId, refreshSessionData])
}

export function LiveSyncBridge() {
  useLiveSync()
  return null
}
