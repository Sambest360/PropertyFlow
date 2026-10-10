/**
 * Owner-keyed client cache (spec-portal-first-load).
 *
 * The AppState mirror in localStorage used to be the raw state of whoever was
 * last signed in on this browser — readable by the next user on a shared
 * machine. It is now stored as `{ ownerUserId, state }` and only ever loaded
 * back for the same stored auth user. Sign-out wipes both keys.
 */

/** AppState mirror key. Re-exported by AppStore. */
export const APP_STATE_STORAGE_KEY = 'propertyflow-v18'
/** "Last hydrated from Postgres" marker. Re-exported by AppStore. */
export const PG_SOURCE_STORAGE_KEY = 'propertyflow-pg-source'

/** Keys sign-out (and session-artifact clearing) must remove. */
export const CLIENT_CACHE_KEYS = [APP_STATE_STORAGE_KEY, PG_SOURCE_STORAGE_KEY] as const

/**
 * Collections never written to localStorage in API mode (PII / money books).
 * They are always refetched from /api/bootstrap for the signed-in user.
 */
export const API_MODE_UNPERSISTED_KEYS = [
  'users',
  'tenancies',
  'payments',
  'applications',
  'trustTransactions',
  'trustAllocations',
  'payoutInstructions',
  'depositHoldings',
] as const

export type CacheEnvelope<S> = { ownerUserId: string | null; state: Partial<S> }

/** Build the persisted envelope. In API mode, PII/trust collections are dropped. */
export function serializeClientCache<S extends object>(
  state: S,
  ownerUserId: string | null,
  apiMode: boolean,
): string {
  let toStore: Partial<S> = state
  if (apiMode) {
    const copy = { ...state } as Record<string, unknown>
    for (const k of API_MODE_UNPERSISTED_KEYS) delete copy[k]
    toStore = copy as Partial<S>
  }
  const env: CacheEnvelope<S> = { ownerUserId: ownerUserId || null, state: toStore }
  return JSON.stringify(env)
}

/**
 * Parse the stored cache and return its state only when it belongs to
 * `currentUserId` (null = guest). Legacy un-tagged blobs are never trusted.
 */
export function readOwnedClientCache<S>(
  raw: string | null,
  currentUserId: string | null,
): Partial<S> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const env = parsed as Partial<CacheEnvelope<S>>
    if (!('ownerUserId' in env) || !env.state || typeof env.state !== 'object') return null
    if ((env.ownerUserId ?? null) !== (currentUserId || null)) return null
    return env.state
  } catch {
    return null
  }
}

/** Remove the AppState mirror + pg-source flag. Storage failures are non-fatal. */
export function clearClientCache(): void {
  try {
    for (const k of CLIENT_CACHE_KEYS) localStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}

/**
 * True when the signed-in session moved from one real user to another (A → B).
 * Guest → user and user → signed-out are not switches (loadState / sign-out cover those).
 */
export function sessionUserSwitched(prev: string | null, next: string | null): boolean {
  return Boolean(prev && next && prev !== next)
}

/**
 * Mount bootstrap may wait for idle only for a guest with a postgres-sourced
 * cache. With a stored session it always fires immediately.
 */
export function shouldDeferMountBootstrap(params: {
  storedAuthUserId: string | null
  pgSource: string | null
  cachedPropertyCount: number
}): boolean {
  if (params.storedAuthUserId) return false
  return params.pgSource === 'postgres' && params.cachedPropertyCount > 0
}

/**
 * Debounced cache writer. The owner is captured when a write is SCHEDULED, and
 * the write is dropped if the stored auth user changed before it fires, so A's
 * state can never be saved under B's owner tag. cancel() is called on user
 * switch / sign-out.
 */
export function createClientCacheWriter<S extends object>(opts: {
  delayMs: number
  getOwner: () => string | null
  write: (state: S, ownerUserId: string | null) => void
}) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const cancel = () => {
    if (timer != null) clearTimeout(timer)
    timer = null
  }
  const schedule = (state: S) => {
    cancel()
    const owner = opts.getOwner()
    timer = setTimeout(() => {
      timer = null
      if ((opts.getOwner() || null) !== (owner || null)) return
      opts.write(state, owner)
    }, opts.delayMs)
  }
  return { schedule, cancel }
}
