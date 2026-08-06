import { useCallback, useEffect, useState } from 'react'

const STORAGE_PREFIX = 'pf-ops-seen-v1'

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId || 'guest'}`
}

function readSeen(userId: string): Set<string> {
  if (typeof localStorage === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as string[]
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function writeSeen(userId: string, seen: Set<string>) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify([...seen]))
  } catch {
    /* ignore quota */
  }
}

export function useSeenOpsItems(userId: string) {
  const [seen, setSeen] = useState<Set<string>>(() => readSeen(userId))

  useEffect(() => {
    setSeen(readSeen(userId))
  }, [userId])

  const isSeen = useCallback((compositeId: string) => seen.has(compositeId), [seen])

  const markSeen = useCallback(
    (compositeId: string) => {
      setSeen((prev) => {
        if (prev.has(compositeId)) return prev
        const next = new Set(prev)
        next.add(compositeId)
        writeSeen(userId, next)
        return next
      })
    },
    [userId],
  )

  return { isSeen, markSeen }
}
