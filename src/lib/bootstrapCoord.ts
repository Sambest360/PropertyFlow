import type { PostgresBootstrap } from './api/postgresClient'

/** Coordinates lite/full bootstrap fetches so mount + auth don't duplicate network work. */
let inflightLite: Promise<PostgresBootstrap | null> | null = null
let inflightFull: Promise<PostgresBootstrap | null> | null = null
let lastLiteAt = 0
let lastFullAt = 0

const LITE_COOLDOWN_MS = 8_000
const FULL_COOLDOWN_MS = 45_000

export function markBootstrapFetched(lite: boolean): void {
  if (lite) lastLiteAt = Date.now()
  else lastFullAt = Date.now()
}

/** Skip auth-triggered refresh when mount/bootstrap just hydrated the store. */
export function shouldSkipAuthBootstrapRefresh(): boolean {
  return Date.now() - lastLiteAt < LITE_COOLDOWN_MS
}

export function dedupeBootstrapFetch(
  lite: boolean,
  fetcher: () => Promise<PostgresBootstrap | null>,
): Promise<PostgresBootstrap | null> {
  if (lite) {
    if (inflightLite) return inflightLite
    if (Date.now() - lastLiteAt < LITE_COOLDOWN_MS) {
      return Promise.resolve(null)
    }
    inflightLite = fetcher()
      .then((boot) => {
        if (boot) markBootstrapFetched(true)
        return boot
      })
      .finally(() => {
        inflightLite = null
      })
    return inflightLite
  }

  if (inflightFull) return inflightFull
  if (Date.now() - lastFullAt < FULL_COOLDOWN_MS) {
    return Promise.resolve(null)
  }
  inflightFull = fetcher()
    .then((boot) => {
      if (boot) markBootstrapFetched(false)
      return boot
    })
    .finally(() => {
      inflightFull = null
    })
  return inflightFull
}

export function scheduleDeferredFullBootstrap(run: () => void): void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => run(), { timeout: 6_000 })
    return
  }
  setTimeout(run, 2_000)
}
