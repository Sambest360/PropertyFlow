import type { PropertyEvent } from '../../types/domain'

/**
 * Drop repeats of the same change: same action and changes, recorded within
 * `windowMs` of each other (a save that wrote its history row twice). Keeps
 * the first occurrence in time order.
 */
export function dedupePropertyEvents(events: readonly PropertyEvent[], windowMs = 120_000): PropertyEvent[] {
  const sorted = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  const lastSeen = new Map<string, number>()
  const seenIds = new Set<string>()
  const out: PropertyEvent[] = []
  for (const e of sorted) {
    if (seenIds.has(e.id)) continue
    seenIds.add(e.id)
    const key = `${e.propertyId}|${e.action}|${JSON.stringify(e.changes ?? [])}`
    const t = Date.parse(e.at)
    const prev = lastSeen.get(key)
    if (prev != null && Number.isFinite(t) && Math.abs(t - prev) <= windowMs) continue
    lastSeen.set(key, Number.isFinite(t) ? t : 0)
    out.push(e)
  }
  return out
}
