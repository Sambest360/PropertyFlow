import type { PostgresBootstrap } from './api/postgresClient'

/** Coordinates lite/full bootstrap fetches so mount + auth don't duplicate network work. */

type InflightSlot = {
  key: string
  promise: Promise<PostgresBootstrap | null>
}

let inflightLite: InflightSlot | null = null
let inflightFull: InflightSlot | null = null
let lastLiteAt = 0
let lastFullAt = 0
let lastLiteKey = 'null'
let lastFullKey = 'null'

const LITE_COOLDOWN_MS = 8_000
const FULL_COOLDOWN_MS = 45_000

/** Stable dedupe key: role + userId so tenant never adopts a null-actor inflight. */
export function bootstrapActorKey(actor?: {
  userId?: string | null
  role?: string | null
} | null): string {
  const userId = actor?.userId?.trim() || ''
  const role = actor?.role?.trim() || ''
  if (!userId && !role) return 'null'
  return `${role || 'unknown'}:${userId || 'unknown'}`
}

export function markBootstrapFetched(lite: boolean, actorKey?: string | null): void {
  const key = (actorKey ?? 'null').trim() || 'null'
  if (lite) {
    lastLiteAt = Date.now()
    lastLiteKey = key
  } else {
    lastFullAt = Date.now()
    lastFullKey = key
  }
}

/** True when any lite/full bootstrap fetch is in flight (omit actorKey). */
export function isBootstrapFetchInFlight(actorKey?: string | null): boolean {
  if (actorKey != null && String(actorKey).trim() !== '') {
    const key = String(actorKey).trim()
    return inflightLite?.key === key || inflightFull?.key === key
  }
  return inflightLite !== null || inflightFull !== null
}

export function shouldSkipAuthBootstrapRefresh(
  sessionUserId?: string | null,
  hydratedForUserId?: string | null,
): boolean {
  if (sessionUserId && hydratedForUserId !== sessionUserId) return false
  return Date.now() - lastLiteAt < LITE_COOLDOWN_MS
}

/** Portal "Try again" and other forced refreshes must not no-op on cooldown. */
export function shouldIgnoreBootstrapMissAfterFetch(input: {
  force?: boolean
  sessionUserId?: string | null
  hydratedForUserId?: string | null
}): boolean {
  if (input.force) return false
  if (!input.sessionUserId) return false
  return shouldSkipAuthBootstrapRefresh(input.sessionUserId, input.hydratedForUserId)
}

export function dedupeBootstrapFetch(
  lite: boolean,
  fetcher: () => Promise<PostgresBootstrap | null>,
  opts?: { force?: boolean; actorKey?: string | null },
): Promise<PostgresBootstrap | null> {
  const key = (opts?.actorKey ?? 'null').trim() || 'null'

  if (lite) {
    if (!opts?.force) {
      // Same-actor only — refuse tenant adopting null-actor (or vice versa) inflight.
      if (inflightLite && inflightLite.key === key) return inflightLite.promise
      // Cooldown is per actor key so null-actor hydrate cannot suppress tenant refresh.
      if (key === lastLiteKey && Date.now() - lastLiteAt < LITE_COOLDOWN_MS) {
        return Promise.resolve(null)
      }
    }
    const promise = fetcher()
      .finally(() => {
        if (inflightLite?.promise === promise) inflightLite = null
      })
    inflightLite = { key, promise }
    return promise
  }

  if (!opts?.force) {
    if (inflightFull && inflightFull.key === key) return inflightFull.promise
    if (key === lastFullKey && Date.now() - lastFullAt < FULL_COOLDOWN_MS) {
      return Promise.resolve(null)
    }
  }
  const promise = fetcher()
    .then((boot) => {
      if (boot) markBootstrapFetched(false, key)
      return boot
    })
    .finally(() => {
      if (inflightFull?.promise === promise) inflightFull = null
    })
  inflightFull = { key, promise }
  return promise
}

export function scheduleDeferredFullBootstrap(run: () => void): void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => run(), { timeout: 6_000 })
    return
  }
  setTimeout(run, 2_000)
}

/**
 * Portal "Try again" / forced auth recovery: drop inflight + cooldown so the
 * next fetch is not a deduped null from a prior null-actor or soft-miss lite boot.
 */
export function resetBootstrapCoordForRetry(): void {
  inflightLite = null
  inflightFull = null
  lastLiteAt = 0
  lastFullAt = 0
  lastLiteKey = 'null'
  lastFullKey = 'null'
}

/** Test-only: clear inflight + cooldown clocks. */
export function resetBootstrapCoordForTests(): void {
  resetBootstrapCoordForRetry()
}
