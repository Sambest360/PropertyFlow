import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { getWishlistIds, isOnWishlist, toggleWishlist } from '../lib/wishlist'

const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(userId: string | null | undefined) {
  return getWishlistIds(userId).join('\0')
}

/**
 * Reactive wishlist for the signed-in (or guest) user. Persist in localStorage.
 */
export function useWishlist(userId: string | null | undefined) {
  const key = useSyncExternalStore(
    subscribe,
    () => getSnapshot(userId),
    () => '',
  )

  const ids = key ? key.split('\0') : []

  const saved = useCallback(
    (propertyId: string) => isOnWishlist(userId, propertyId),
    [userId, key],
  )

  const toggle = useCallback(
    (propertyId: string) => {
      const result = toggleWishlist(userId, propertyId)
      emit()
      return result
    },
    [userId],
  )

  return { ids, saved, toggle, count: ids.length }
}

/** Non-hook helper for one-off mounts (e.g. map popup). */
export function useWishlistSaved(userId: string | null | undefined, propertyId: string) {
  const { saved, toggle } = useWishlist(userId)
  const [on, setOn] = useState(() => saved(propertyId))
  useEffect(() => {
    setOn(saved(propertyId))
  }, [saved, propertyId])
  return {
    saved: on,
    toggle: () => {
      const next = toggle(propertyId)
      setOn(next.saved)
      return next
    },
  }
}
