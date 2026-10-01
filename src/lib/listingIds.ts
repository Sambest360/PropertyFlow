const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isListingUuid(id: string): boolean {
  return UUID_RE.test(id.trim())
}

/** Collapse doubled staff/public prefixes (`unt-unt-x`, `PR-PR-x`). */
export function collapseListingPrefix(id: string): string {
  let out = id.trim()
  while (/^unt-unt-/i.test(out)) out = out.slice(4)
  while (/^PR-PR-/i.test(out)) out = `PR-${out.slice(6)}`
  return out
}

/** Canonical public/staff listing id = property.id (never a doubled unit slug). */
export function canonicalListingId(id: string | null | undefined): string {
  if (!id) return ''
  return collapseListingPrefix(id)
}

/** Unit frontend id derived from a property id without stacking prefixes. */
export function unitIdForProperty(propertyId: string): string {
  const canon = canonicalListingId(propertyId)
  if (!canon) return canon
  if (isListingUuid(canon)) return canon
  if (/^unt-/i.test(canon)) return canon
  return `unt-${canon}`
}

export function listingIdAliases(id: string | null | undefined): string[] {
  const canon = canonicalListingId(id)
  if (!canon) return []
  const set = new Set<string>([canon, unitIdForProperty(canon)])
  if (/^unt-/i.test(canon)) set.add(canon.slice(4))
  if (/^PR-/i.test(canon)) {
    set.add(`unt-${canon}`)
    set.add(canon.slice(3))
  }
  return [...set]
}

export function listingIdsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const aliases = new Set(listingIdAliases(a).map((x) => x.toLowerCase()))
  return listingIdAliases(b).some((x) => aliases.has(x.toLowerCase()))
}

export function findByListingId<T extends { id: string; unitId?: string | null }>(
  items: readonly T[],
  param: string | undefined | null,
): T | undefined {
  if (!param) return undefined
  const aliases = new Set(listingIdAliases(param).map((x) => x.toLowerCase()))
  return items.find(
    (item) =>
      aliases.has(item.id.toLowerCase()) ||
      (item.unitId != null && aliases.has(item.unitId.toLowerCase())),
  )
}

/**
 * P0-collision (R10): mint a listing id that does not collide with any known
 * property. The wizard's leftover-draft bug made a sale listing overwrite a
 * rent listing's public route — both resolved to the same `unt-XXXX` id — so
 * create paths must verify uniqueness against the live set before minting.
 * Comparison is case-insensitive and alias-aware (unt-/PR- variants match).
 */
export function nextUniquePropertyId(existingIds: Iterable<string>, generate: () => string): string {
  const taken = new Set<string>()
  for (const id of existingIds) {
    if (!id) continue
    taken.add(id.toLowerCase())
    for (const alias of listingIdAliases(id)) taken.add(alias.toLowerCase())
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generate()
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  // Astronomically unlikely (5 straight 36^6 collisions) but never return a
  // taken id — force uniqueness with a numeric disambiguator.
  let suffix = 1
  let candidate = generate()
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${generate()}${suffix}`
    suffix += 1
  }
  return candidate
}
