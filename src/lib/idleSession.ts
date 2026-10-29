/**
 * Inactivity sign-out. Activity in any tab counts (shared through
 * localStorage), so working in one tab keeps the others signed in.
 */
export const IDLE_STORAGE_KEY = 'pf-last-activity'

/** Minutes without activity before sign-out (VITE_IDLE_TIMEOUT_MINUTES, default 30, min 2). */
export function idleTimeoutMs(): number {
  const raw = Number(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES)
  const minutes = Number.isFinite(raw) && raw >= 2 ? raw : 30
  return minutes * 60_000
}

/** Warning shown this long before sign-out. */
export const IDLE_WARNING_MS = 60_000

export function readLastActivity(): number {
  try {
    const v = Number(localStorage.getItem(IDLE_STORAGE_KEY))
    return Number.isFinite(v) && v > 0 ? v : Date.now()
  } catch {
    return Date.now()
  }
}

export function writeLastActivity(at = Date.now()): void {
  try {
    localStorage.setItem(IDLE_STORAGE_KEY, String(at))
  } catch {
    /* storage blocked: this tab still tracks in memory */
  }
}

export type IdlePhase = 'active' | 'warning' | 'expired'

export function idlePhase(lastActivity: number, now: number, timeoutMs = idleTimeoutMs()): { phase: IdlePhase; msLeft: number } {
  const msLeft = lastActivity + timeoutMs - now
  if (msLeft <= 0) return { phase: 'expired', msLeft: 0 }
  if (msLeft <= IDLE_WARNING_MS) return { phase: 'warning', msLeft }
  return { phase: 'active', msLeft }
}
