import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/AppStore'
import { isApiEnabled, isSupabaseMode } from '../lib/api/config'
import { LIVE_SYNC_DEBOUNCE_MS, LIVE_SYNC_POLL_MS, LIVE_SYNC_TABLES } from '../lib/liveSync'
import { createClient } from '../utils/supabase/client'

/**
 * Keeps workspace data fresh: Supabase Realtime on operational tables,
 * plus focus/poll fallback for API mode or when Realtime is unavailable.
 */
export function useLiveSync() {
  const { isAuthenticated, user } = useAuth()
  const { refreshSessionData } = useStore()
  const debounceRef = useRef<number | null>(null)
  const realtimeOkRef = useRef(!isSupabaseMode)
  const actorRef = useRef({ userId: user.id, role: user.role, agencyId: user.agencyId })
  actorRef.current = { userId: user.id, role: user.role, agencyId: user.agencyId }

  useEffect(() => {
    if (!isAuthenticated || user.id === 'guest') return
    if (!isApiEnabled && !isSupabaseMode) return

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
      if (isSupabaseMode && realtimeOkRef.current) return
      scheduleRefresh()
    }, LIVE_SYNC_POLL_MS)

    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null
    if (isSupabaseMode) {
      realtimeOkRef.current = false
      const supabase = createClient()
      let ch = supabase.channel(`propertyflow-live-${user.id}`)
      for (const table of LIVE_SYNC_TABLES) {
        ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh)
      }
      channel = ch
      void ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          realtimeOkRef.current = true
        }
        if (status === 'CHANNEL_ERROR') {
          realtimeOkRef.current = false
          console.warn('[liveSync] Realtime channel error — using focus/poll/nav refresh')
        }
      })
    }

    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(poll)
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
      if (channel) void createClient().removeChannel(channel)
    }
  }, [isAuthenticated, user.id, user.role, user.agencyId, refreshSessionData])
}

export function LiveSyncBridge() {
  useLiveSync()
  return null
}
