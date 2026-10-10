/**
 * Michael #96: hand a server-generated temp password to the app-level one-time
 * modal (TempPasswordHost), so it survives navigation after a create. Memory
 * only: nothing is stored, and listeners get it once.
 */
type Shown = { tempPassword: string; title: string }
type Listener = (shown: Shown) => void

const listeners = new Set<Listener>()

export function showTempPasswordOnce(tempPassword: string, title = 'Temporary password'): void {
  if (!tempPassword) return
  for (const l of listeners) l({ tempPassword, title })
}

export function onTempPasswordShown(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
