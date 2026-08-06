/** How long optimistic local writes win over stale bootstrap data. */
export const LOCAL_WRITE_TTL_MS = 3500

const localWriteTimestamps = new Map<string, number>()

const RESOURCE_COLLECTION: Record<string, string> = {
  agency: 'agencies',
  user: 'users',
  property: 'properties',
  building: 'buildings',
  unit: 'units',
  room: 'infraRooms',
  lead: 'leads',
  application: 'applications',
  payment: 'payments',
  ticket: 'tickets',
  notification: 'notifications',
  message: 'messages',
  document: 'propertyDocuments',
  viewing: 'viewings',
  viewing_slot: 'viewingSlots',
  tenancy: 'tenancies',
  suite_alert: 'suiteAlerts',
  activity: 'activities',
  property_event: 'propertyEvents',
  lookup: 'lookups',
  invoice: 'invoices',
}

export function collectionKeyForResource(resource: string): string | null {
  return RESOURCE_COLLECTION[resource] ?? null
}

/** Record a local persist so bootstrap refresh keeps the optimistic row briefly. */
export function markLocalPersistWrite(resource: string, id: string): void {
  const col = collectionKeyForResource(resource)
  if (!col) return
  localWriteTimestamps.set(`${col}:${id}`, Date.now())
}

export function pruneStaleLocalWrites(now = Date.now(), ttlMs = LOCAL_WRITE_TTL_MS): void {
  const maxAge = ttlMs * 3
  for (const [key, ts] of localWriteTimestamps) {
    if (now - ts > maxAge) localWriteTimestamps.delete(key)
  }
}

/** Clear timestamps — for tests only. */
export function resetLocalPersistWrites(): void {
  localWriteTimestamps.clear()
}

export type MergeEntityListsOptions = {
  /** When remote list is absent, return [] instead of local (scoped bootstrap). */
  replaceWhenMissing?: boolean
  ttlMs?: number
  now?: number
}

/**
 * Merge server bootstrap rows with in-memory state.
 * Recently persisted local rows win over stale server snapshots.
 */
export function mergeEntityLists<T extends { id: string }>(
  local: T[],
  remote: T[] | undefined,
  collectionKey: string,
  opts: MergeEntityListsOptions = {},
): T[] {
  const { replaceWhenMissing = false, ttlMs = LOCAL_WRITE_TTL_MS, now = Date.now() } = opts
  pruneStaleLocalWrites(now, ttlMs)

  if (remote === undefined) {
    return replaceWhenMissing ? [] : local
  }

  const merged = new Map<string, T>()
  for (const item of remote) {
    merged.set(item.id, item)
  }

  for (const item of local) {
    const writeKey = `${collectionKey}:${item.id}`
    const writeTs = localWriteTimestamps.get(writeKey)
    const recentlyWritten = writeTs != null && now - writeTs < ttlMs

    if (recentlyWritten) {
      merged.set(item.id, item)
    } else if (!merged.has(item.id) && !replaceWhenMissing) {
      merged.set(item.id, item)
    }
  }

  return Array.from(merged.values())
}
