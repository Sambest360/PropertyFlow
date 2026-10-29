import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useAuth } from '../context/AuthContext'
import { isApiEnabled } from '../lib/api/config'
import { fetchNotificationPrefs, saveNotificationPrefs } from '../lib/api/accountEmailApi'
import { DEFAULT_NOTIFICATION_PREFS, normalizeNotificationPrefs, type NotificationPrefs } from '../lib/notificationCategories'

/** One copy per tab, loaded once per signed-in user and shared by the bell, pop-ups and Settings. */
let current: { userId: string; prefs: NotificationPrefs } | null = null
let loading: string | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useNotificationPrefs(): {
  prefs: NotificationPrefs
  loaded: boolean
  save: (next: NotificationPrefs) => Promise<void>
} {
  const { user, isAuthenticated } = useAuth()
  const snap = useSyncExternalStore(subscribe, () => current)
  const userId = isAuthenticated ? user.id : ''

  useEffect(() => {
    if (!userId || !isApiEnabled) return
    if (current?.userId === userId || loading === userId) return
    loading = userId
    fetchNotificationPrefs()
      .then((r) => {
        current = { userId, prefs: normalizeNotificationPrefs(r.prefs) }
        emit()
      })
      .catch(() => {
        /* keep defaults */
      })
      .finally(() => {
        if (loading === userId) loading = null
      })
  }, [userId])

  const save = useCallback(
    async (next: NotificationPrefs) => {
      const clean = normalizeNotificationPrefs(next)
      const prev = current
      current = { userId, prefs: clean }
      emit()
      try {
        const r = await saveNotificationPrefs(clean)
        current = { userId, prefs: normalizeNotificationPrefs(r.prefs) }
        emit()
      } catch (err) {
        current = prev
        emit()
        throw err
      }
    },
    [userId],
  )

  const mine = snap && snap.userId === userId ? snap.prefs : DEFAULT_NOTIFICATION_PREFS
  return { prefs: mine, loaded: Boolean(snap && snap.userId === userId), save }
}
