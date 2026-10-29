import { useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Create forms keep their progress in sessionStorage so a refresh does not
 * lose it. A NEW visit to the form (a different history entry: clicking
 * "Add …" again, after a save or a draft) must start empty, so this clears
 * `<key>:draft` and `<key>:step` before the form reads them. Call it at the
 * very top of the component, before any state that reads the stored draft.
 */
export function useFreshCreateDraft(storageKey: string, enabled = true): void {
  const { key: entryKey } = useLocation()
  const checked = useRef(false)
  if (!enabled || checked.current) return
  checked.current = true
  clearCreateDraftIfNewVisit(storageKey, entryKey)
}

export function clearCreateDraftIfNewVisit(storageKey: string, entryKey: string): boolean {
  try {
    const entryStorageKey = `${storageKey}:entry`
    const last = sessionStorage.getItem(entryStorageKey)
    sessionStorage.setItem(entryStorageKey, entryKey)
    if (last === entryKey) return false
    sessionStorage.removeItem(`${storageKey}:draft`)
    sessionStorage.removeItem(`${storageKey}:step`)
    return true
  } catch {
    return false
  }
}
