import { useCallback, useEffect, useState } from 'react'

/**
 * Dashboard items this person has opened, per browser. Each entry keeps the
 * item's "signature" (status, date…) at the time it was opened: when the item
 * changes again it counts as new, so it comes back to the overview.
 */
const STORAGE_PREFIX = 'pf-ops-seen-v2'
const LEGACY_PREFIX = 'pf-ops-seen-v1'
/** Opened before signatures were kept: seen whatever it looks like now. */
const ANY = '*'

type SeenMap = Record<string, string>

function storageKey(prefix: string, userId: string) {
  return `${prefix}:${userId || 'guest'}`
}

function readSeen(userId: string): SeenMap {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(storageKey(STORAGE_PREFIX, userId))
    if (raw) {
      const parsed = JSON.parse(raw) as SeenMap
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    }
    const legacy = localStorage.getItem(storageKey(LEGACY_PREFIX, userId))
    if (legacy) {
      const ids = JSON.parse(legacy) as string[]
      return Array.isArray(ids) ? Object.fromEntries(ids.map((id) => [id, ANY])) : {}
    }
  } catch {
    /* ignore */
  }
  return {}
}

function writeSeen(userId: string, seen: SeenMap) {
  if (typeof localStorage === 'undefined') return
  try {
    const entries = Object.entries(seen)
    // Keep the newest 2 000 entries so the store stays small.
    const trimmed = entries.length > 2000 ? Object.fromEntries(entries.slice(-2000)) : seen
    localStorage.setItem(storageKey(STORAGE_PREFIX, userId), JSON.stringify(trimmed))
  } catch {
    /* ignore quota */
  }
}

export function useSeenOpsItems(userId: string) {
  const [seen, setSeen] = useState<SeenMap>(() => readSeen(userId))

  useEffect(() => {
    setSeen(readSeen(userId))
  }, [userId])

  /** True when the item was opened and has not changed since (signature omitted = opened at all). */
  const isSeen = useCallback(
    (compositeId: string, signature?: string) => {
      const stored = seen[compositeId]
      if (stored === undefined) return false
      return signature === undefined || stored === ANY || stored === signature
    },
    [seen],
  )

  const markSeen = useCallback(
    (compositeId: string, signature?: string) => {
      setSeen((prev) => {
        const value = signature ?? ANY
        if (prev[compositeId] === value) return prev
        const next = { ...prev, [compositeId]: value }
        writeSeen(userId, next)
        return next
      })
    },
    [userId],
  )

  return { isSeen, markSeen }
}

/** Signature of a dashboard item: when any of these change it is new again. */
export function opsSignature(item: { status?: string; date?: string; priority?: string; meta?: string }): string {
  return [item.status ?? '', item.date ?? '', item.priority ?? '', item.meta ?? ''].join('|')
}
