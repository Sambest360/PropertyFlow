import { useCallback, useEffect, useState } from 'react'

export const NAV_COLLAPSE_KEY = 'propertyflow-nav-collapsed'
export const NAV_COLLAPSE_EVENT = 'propertyflow-nav-collapse'

function readCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(NAV_COLLAPSE_KEY)
    if (stored == null) return true
    return stored === '1'
  } catch {
    return true
  }
}

export function useNavCollapsed() {
  const [collapsed, setCollapsedState] = useState(readCollapsed)

  useEffect(() => {
    const sync = () => setCollapsedState(readCollapsed())
    window.addEventListener(NAV_COLLAPSE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(NAV_COLLAPSE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const setCollapsed = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setCollapsedState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      try {
        localStorage.setItem(NAV_COLLAPSE_KEY, value ? '1' : '0')
      } catch {
        /* ignore */
      }
      queueMicrotask(() => window.dispatchEvent(new Event(NAV_COLLAPSE_EVENT)))
      return value
    })
  }, [])

  return [collapsed, setCollapsed] as const
}
