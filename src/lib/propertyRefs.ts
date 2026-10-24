import { canonicalListingId } from './listingIds'

type PropertyLike = { id: string; backendId?: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True for a raw database UUID — never something to show a person. */
export function isRawUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

/** Shown when a referenced property is not in the store (never the raw id). */
export const UNKNOWN_PROPERTY_LABEL = 'Property unavailable'

/**
 * Display fallback for a property reference whose title could not be found:
 * readable listing codes pass through, raw UUIDs become a neutral label.
 */
export function propertyRefLabel(propertyId: string | null | undefined): string {
  if (!propertyId) return '—'
  return isRawUuid(propertyId) ? UNKNOWN_PROPERTY_LABEL : propertyId
}

/**
 * Rewrite `propertyId` on every collection row that points at a property by
 * its database UUID (units.id) or a non-canonical listing id, so the app's
 * `p.id === row.propertyId` lookups find the property and show its title.
 * Rows that already match, or match nothing, are returned untouched; arrays
 * without a change keep their identity.
 */
export function normalizePropertyRefs<S extends { properties: PropertyLike[] }>(state: S): S {
  const ids = new Set(state.properties.map((p) => p.id))
  const alias = new Map<string, string>()
  for (const p of state.properties) {
    if (p.backendId && !ids.has(p.backendId)) alias.set(p.backendId, p.id)
    const canon = canonicalListingId(p.id)
    if (canon && !ids.has(canon)) alias.set(canon, p.id)
  }
  if (alias.size === 0) return state

  const resolve = (ref: string): string | null => {
    if (ids.has(ref)) return null
    return alias.get(ref) ?? alias.get(canonicalListingId(ref)) ?? null
  }

  let next: S | null = null
  for (const [key, value] of Object.entries(state)) {
    if (key === 'properties' || !Array.isArray(value)) continue
    let changed: unknown[] | null = null
    value.forEach((row, i) => {
      if (!row || typeof row !== 'object') return
      const ref = (row as { propertyId?: unknown }).propertyId
      if (typeof ref !== 'string' || !ref) return
      const fixed = resolve(ref)
      if (!fixed) return
      changed ??= value.slice()
      changed[i] = { ...row, propertyId: fixed }
    })
    if (changed) {
      next ??= { ...state }
      ;(next as Record<string, unknown>)[key] = changed
    }
  }
  return next ?? state
}

/** Shown when a referenced person is not in the store (never the raw id). */
export const UNKNOWN_PERSON_LABEL = 'Unknown user'

/** Display fallback for a user reference whose name could not be found. */
export function personRefLabel(userId: string | null | undefined): string {
  if (!userId) return '—'
  return isRawUuid(userId) ? UNKNOWN_PERSON_LABEL : userId
}
