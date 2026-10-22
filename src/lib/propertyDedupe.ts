import type { Unit } from '../data/infrastructure'
import type { PropertyAsset } from '../types/domain'
import { canonicalListingId, listingIdsMatch } from './listingIds.js'

function isArchivedOrDeleted(p: PropertyAsset): boolean {
  return Boolean(p.deletedAt) || p.status === 'Archived'
}

/** Prefer PR-* property id over unt-* when both refer to the same listing. */
function propertyIdRank(id: string): number {
  const canon = canonicalListingId(id)
  if (/^PR-/i.test(canon)) return 3
  if (/^unt-/i.test(canon)) return 1
  return 2
}

export function propertyListingDedupeKey(p: PropertyAsset, _units?: Unit[]): string {
  if (p.unitId?.trim()) return canonicalListingId(p.unitId)
  return canonicalListingId(p.id)
}

/** When two rows share a listing identity, keep the better workspace row. */
export function pickPreferredProperty(a: PropertyAsset, b: PropertyAsset): PropertyAsset {
  const aDead = isArchivedOrDeleted(a)
  const bDead = isArchivedOrDeleted(b)
  if (aDead !== bDead) return aDead ? b : a

  const rankA = propertyIdRank(a.id)
  const rankB = propertyIdRank(b.id)
  if (rankA !== rankB) return rankA > rankB ? a : b

  const imgA = a.images?.length ?? 0
  const imgB = b.images?.length ?? 0
  if (imgA !== imgB) return imgA > imgB ? a : b

  const lenA = a.title?.length ?? 0
  const lenB = b.title?.length ?? 0
  if (lenA !== lenB) return lenA > lenB ? a : b

  return a
}

function backendIdMatchesPeer(backendId: string | undefined, peer: PropertyAsset): boolean {
  if (!backendId?.trim()) return false
  const id = backendId.trim()
  if (peer.backendId === id) return true
  if (peer.id === id || peer.unitId === id) return true
  return false
}

function sameListingGroup(a: PropertyAsset, b: PropertyAsset): boolean {
  if (propertyListingDedupeKey(a) === propertyListingDedupeKey(b)) return true
  if (listingIdsMatch(a.id, b.id)) return true
  if (a.unitId && b.unitId && listingIdsMatch(a.unitId, b.unitId)) return true
  if (a.unitId && listingIdsMatch(a.unitId, b.id)) return true
  if (b.unitId && listingIdsMatch(b.unitId, a.id)) return true
  if (backendIdMatchesPeer(a.backendId, b) || backendIdMatchesPeer(b.backendId, a)) return true
  if (a.backendId && b.backendId && a.backendId === b.backendId) return true
  return false
}

/**
 * Collapse alias duplicates (PR-* vs unt-PR-*, scoped + public merge) to one property per listing.
 */
export function dedupePropertyAssets(properties: PropertyAsset[], _units?: Unit[]): PropertyAsset[] {
  if (properties.length <= 1) return properties

  const groups: PropertyAsset[][] = []
  for (const p of properties) {
    let placed = false
    for (const group of groups) {
      if (sameListingGroup(p, group[0])) {
        group.push(p)
        placed = true
        break
      }
    }
    if (!placed) groups.push([p])
  }

  return groups.map((group) => {
    let best = group[0]
    for (let i = 1; i < group.length; i++) {
      best = pickPreferredProperty(best, group[i])
    }
    // If the chosen best has no agentId but any row in the group has one,
    // copy the agentId from the first row with an agentId (preserving group order)
    if (!best.agentId) {
      for (const p of group) {
        if (p.agentId) {
          return { ...best, agentId: p.agentId }
        }
      }
    }
    return best
  })
}

/** Collapse duplicate unit rows by canonical unit id. */
export function dedupeUnits(units: Unit[]): Unit[] {
  if (units.length <= 1) return units
  const byKey = new Map<string, Unit>()
  for (const u of units) {
    const key = canonicalListingId(u.id)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, u)
      continue
    }
    const pick =
      (existing.images?.length ?? 0) >= (u.images?.length ?? 0) ? existing : u
    byKey.set(key, pick)
  }
  return Array.from(byKey.values())
}
