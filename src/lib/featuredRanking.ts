import { haversineKm, propertyMatchesAreas, type Place } from './placeCatalog'

/**
 * Featured listings (units.featured): an agency marks a listing Featured and
 * it shows at the top of marketplace results for people looking in that
 * listing's area. Free and toggle-based — the site takes no payments.
 */

/** Agency staff may feature their own agency's listings (scope is enforced by the write gate). */
export const FEATURE_LISTING_ROLES: ReadonlySet<string> = new Set([
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
])

export function canFeatureListing(role: string | null | undefined): boolean {
  return Boolean(role && FEATURE_LISTING_ROLES.has(role))
}

/** At most this many featured listings go above the normal results. */
export const FEATURED_TOP_SLOTS = 3

/** Where the visitor is looking. Featured listings outside it are not lifted. */
export type FeaturedSearchArea =
  | { kind: 'places'; places: readonly Place[] }
  | { kind: 'place-text'; text: string }
  | { kind: 'near'; lat: number; lng: number; radiusKm: number }
  | { kind: 'anywhere' }

export type FeaturedRankable = {
  id: string
  featured: boolean
  suburb?: string | null
  city?: string | null
  lat?: number | null
  lng?: number | null
}

export function listingInSearchArea(item: FeaturedRankable, area: FeaturedSearchArea): boolean {
  if (area.kind === 'anywhere') return true
  if (area.kind === 'near') {
    if (item.lat == null || item.lng == null) return false
    return haversineKm(area, { lat: item.lat, lng: item.lng }) <= area.radiusKm
  }
  const suburb = (item.suburb ?? '').trim().toLowerCase()
  const city = (item.city ?? '').trim().toLowerCase()
  if (area.kind === 'places') {
    return propertyMatchesAreas({ suburb, city }, area.places)
  }
  const text = area.text.trim().toLowerCase()
  if (!text) return true
  return suburb === text || city === text || suburb.includes(text) || city.includes(text)
}

/** Small stable string hash (FNV-1a) — same input, same order. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Lift up to `slots` featured listings in the search area to the top; the rest
 * keep their order. When an area has more featured listings than slots, the
 * pick rotates daily (seeded by the day), so each gets its turn at the top.
 * Featured listings that are not lifted stay where the normal order put them.
 */
export function rankFeaturedInArea<T>(
  items: readonly T[],
  toRankable: (item: T) => FeaturedRankable,
  area: FeaturedSearchArea,
  opts: { slots?: number; seed?: string } = {},
): T[] {
  const slots = opts.slots ?? FEATURED_TOP_SLOTS
  const seed = opts.seed ?? new Date().toISOString().slice(0, 10)
  const eligible = items
    .map((item) => ({ item, r: toRankable(item) }))
    .filter(({ r }) => r.featured && listingInSearchArea(r, area))
  if (!eligible.length || slots <= 0) return [...items]
  const lifted = eligible
    .sort((a, b) => hash(`${seed}|${a.r.id}`) - hash(`${seed}|${b.r.id}`))
    .slice(0, slots)
    .map(({ item }) => item)
  const liftedSet = new Set(lifted)
  return [...lifted, ...items.filter((item) => !liftedSet.has(item))]
}
