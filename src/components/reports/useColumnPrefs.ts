import { useEffect, useState } from 'react'

/** Visible-column preference for a report table, kept in localStorage (no writer). */
export function useColumnPrefs<K extends string>(
  storageKey: string,
  allKeys: ReadonlyArray<K>,
): [K[], (key: K) => void] {
  const [visible, setVisible] = useState<K[]>(() => {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          const keep = allKeys.filter((k) => parsed.includes(k))
          if (keep.length > 0) return keep
        }
      }
    } catch {
      /* fall back to all columns */
    }
    return [...allKeys]
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(visible))
    } catch {
      /* ignore */
    }
  }, [storageKey, visible])

  const toggle = (key: K) => {
    setVisible((prev) => {
      if (prev.includes(key)) {
        return prev.length > 1 ? prev.filter((k) => k !== key) : prev
      }
      return allKeys.filter((k) => prev.includes(k) || k === key)
    })
  }

  return [visible, toggle]
}

export function downloadCsvText(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
