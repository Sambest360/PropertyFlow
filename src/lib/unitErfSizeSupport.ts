import { useSyncExternalStore } from 'react'
import { isApiEnabled } from './api/config'

/**
 * Whether the erf / stand size is persisted (bootstrap unitErfSizeSupported,
 * migration 037). Same pattern as ticketAccessNotes.ts: local / demo mode
 * stores listings in the browser (true); API mode is false until a Postgres
 * bootstrap says otherwise, so the wizard never pretends to save it.
 */
export function initialUnitErfSizeSupported(m: { apiEnabled: boolean }): boolean {
  return !m.apiEnabled
}

let supported = initialUnitErfSizeSupported({ apiEnabled: isApiEnabled })
const listeners = new Set<() => void>()

export function setUnitErfSizeSupported(v: boolean): void {
  if (v === supported) return
  supported = v
  for (const l of listeners) l()
}

export function getUnitErfSizeSupported(): boolean {
  return supported
}

export function useUnitErfSizeSupported(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => supported,
    () => supported,
  )
}

/** Postgres bootstrap: anything but an explicit true (older server) counts as unsupported. */
export function unitErfSizeSupportedFromBootstrap(boot: { unitErfSizeSupported?: unknown }): boolean {
  return boot.unitErfSizeSupported === true
}

/** UI state for the erf input: disabled with a "Not saved yet" hint when unsupported. */
export function erfSizeFieldState(isSupported: boolean): { disabled: boolean; hint: string | null } {
  return isSupported
    ? { disabled: false, hint: null }
    : { disabled: true, hint: "Not saved yet: erf size can't be saved on this system yet." }
}

/**
 * The erf part of the unit save payload (AppStore createProperty): the
 * draft's erfSizeSqm when it has one (a number, or null to clear it), else
 * nothing, so the server keeps the stored value (absent key = no change).
 */
export function erfSizeForUnitPersist(p: { erfSizeSqm?: number | null }): { erfSizeSqm?: number | null } {
  return p.erfSizeSqm !== undefined ? { erfSizeSqm: p.erfSizeSqm } : {}
}
