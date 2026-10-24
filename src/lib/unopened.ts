/**
 * "Unopened" indicators: which leads, applications, viewings, payments and
 * maintenance tickets a user has not opened yet. Stored per user in this
 * browser. The first time a kind is tracked, everything already in the store
 * is marked opened (no wall of dots on day one); anything that arrives after
 * that stays unopened until the user opens it.
 */

export const UNOPENED_KINDS = ['lead', 'application', 'viewing', 'payment', 'ticket'] as const
export type UnopenedKind = (typeof UNOPENED_KINDS)[number]

export type OpenedStore = {
  v: 1
  /** Kinds whose existing rows were seeded as opened. */
  init: Partial<Record<UnopenedKind, true>>
  /** `${kind}:${id}` → 1 once opened (or seeded). */
  seen: Record<string, 1>
}

export function emptyOpenedStore(): OpenedStore {
  return { v: 1, init: {}, seen: {} }
}

export function openedStorageKey(userId: string): string {
  return `pf:opened:${userId}`
}

export function parseOpenedStore(raw: string | null): OpenedStore {
  if (!raw) return emptyOpenedStore()
  try {
    const parsed = JSON.parse(raw) as Partial<OpenedStore>
    if (parsed?.v !== 1 || typeof parsed.seen !== 'object' || !parsed.seen) return emptyOpenedStore()
    return { v: 1, init: parsed.init ?? {}, seen: parsed.seen }
  } catch {
    return emptyOpenedStore()
  }
}

/** Mark every current id of each not-yet-tracked kind as opened. Returns the same store when nothing changes. */
export function seedOpened(store: OpenedStore, idsByKind: Record<UnopenedKind, string[]>): OpenedStore {
  let next: OpenedStore | null = null
  for (const kind of UNOPENED_KINDS) {
    if (store.init[kind]) continue
    next ??= { v: 1, init: { ...store.init }, seen: { ...store.seen } }
    for (const id of idsByKind[kind]) next.seen[`${kind}:${id}`] = 1
    next.init[kind] = true
  }
  return next ?? store
}

export function markOpenedIn(store: OpenedStore, kind: UnopenedKind, id: string): OpenedStore {
  const key = `${kind}:${id}`
  if (!id || store.seen[key]) return store
  return { ...store, seen: { ...store.seen, [key]: 1 } }
}

/** False until the kind has been seeded, so nothing lights up before data loads. */
export function isUnopenedIn(store: OpenedStore, kind: UnopenedKind, id: string): boolean {
  return Boolean(store.init[kind]) && Boolean(id) && !store.seen[`${kind}:${id}`]
}

export function countUnopened(store: OpenedStore, kind: UnopenedKind, ids: string[]): number {
  let n = 0
  for (const id of ids) if (isUnopenedIn(store, kind, id)) n++
  return n
}
