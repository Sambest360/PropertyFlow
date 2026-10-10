import { useSyncExternalStore } from 'react'
import { isApiEnabled, isSupabaseMode } from './api/config'

/**
 * Whether ticket access notes are persisted (bootstrap
 * ticketAccessNotesSupported). Local / demo mode stores tickets in the
 * browser, so it defaults to true; a Postgres bootstrap sets the real value.
 */
let supported = initialTicketAccessNotesSupported({ apiEnabled: isApiEnabled, supabaseMode: isSupabaseMode })

/**
 * Starting value: local/demo mode stores in the browser (true). API mode is
 * false until the bootstrap says otherwise; Supabase mode has no access_notes
 * column on its writer, so always false.
 */
export function initialTicketAccessNotesSupported(m: { apiEnabled: boolean; supabaseMode: boolean }): boolean {
  if (m.supabaseMode) return false
  return !m.apiEnabled
}
const listeners = new Set<() => void>()

export function setTicketAccessNotesSupported(v: boolean): void {
  if (isSupabaseMode) v = false
  if (v === supported) return
  supported = v
  for (const l of listeners) l()
}

export function getTicketAccessNotesSupported(): boolean {
  return supported
}

export function useTicketAccessNotesSupported(): boolean {
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
export function ticketAccessNotesSupportedFromBootstrap(boot: { ticketAccessNotesSupported?: unknown }): boolean {
  return boot.ticketAccessNotesSupported === true
}

/** UI state for the access-notes input: disabled with a "Not saved yet" hint when unsupported. */
export function accessNotesFieldState(isSupported: boolean): { disabled: boolean; hint: string | null } {
  return isSupported ? { disabled: false, hint: null } : { disabled: true, hint: 'Not saved yet' }
}
