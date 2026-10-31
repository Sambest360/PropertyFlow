import { hasMappedCoordinates } from './mapCoords'
import { haversineKm, type Place } from './placeCatalog'

/**
 * Nearest-first marketplace order: closest listing to the visitor first, by
 * straight-line (haversine) distance. The visitor's position is held in memory
 * only — never stored, logged or sent anywhere.
 */

export type GeoPoint = { lat: number; lng: number }

/** Where distance is measured from. Several points = a multi-area search (closest centre counts). */
export type NearestOrigin = {
  points: readonly GeoPoint[]
  /** device = browser location; address = ?near / typed address; area = searched suburb or city centre. */
  source: 'device' | 'address' | 'area'
  /** Suburb / city names for ordering listings that have no coordinates. */
  suburbs?: readonly string[]
  cities?: readonly string[]
}

export type NearestRankable = {
  lat?: number | null
  lng?: number | null
  suburb?: string | null
  city?: string | null
  createdAt?: string | null
}

/** Featured listings within this distance of a device / area origin may be lifted above the nearest. */
export const NEAREST_FEATURED_RADIUS_KM = 5

export function distanceFromOrigin(origin: NearestOrigin, item: NearestRankable): number | null {
  if (!origin.points.length || !hasMappedCoordinates(item)) return null
  let best = Number.POSITIVE_INFINITY
  for (const p of origin.points) best = Math.min(best, haversineKm(p, { lat: item.lat!, lng: item.lng! }))
  return best
}

function norm(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase()
}

/** 0 = same suburb, 1 = same city, 2 = elsewhere. */
function areaMatchRank(origin: NearestOrigin, item: NearestRankable): number {
  const suburb = norm(item.suburb)
  const city = norm(item.city)
  if (suburb && origin.suburbs?.some((s) => norm(s) === suburb)) return 0
  if (city && origin.cities?.some((c) => norm(c) === city)) return 1
  return 2
}

/**
 * Closest first. Listings without coordinates go after every mapped one,
 * ordered by suburb / city match with the origin, then newest.
 */
export function sortByNearest<T>(
  items: readonly T[],
  toRankable: (item: T) => NearestRankable,
  origin: NearestOrigin,
): T[] {
  const rows = items.map((item, i) => {
    const r = toRankable(item)
    return { item, i, r, km: distanceFromOrigin(origin, r) }
  })
  rows.sort((a, b) => {
    if (a.km != null && b.km != null) return a.km - b.km || newestFirst(a.r, b.r) || a.i - b.i
    if (a.km != null) return -1
    if (b.km != null) return 1
    return areaMatchRank(origin, a.r) - areaMatchRank(origin, b.r) || newestFirst(a.r, b.r) || a.i - b.i
  })
  return rows.map((x) => x.item)
}

function newestFirst(a: NearestRankable, b: NearestRankable): number {
  return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
}

/**
 * "850 m away", "1.2 km away", "14 km away". Guest coordinates are rounded to
 * about 1 km, so metres are rounded to the nearest 50 and never shown below 100.
 */
export function formatDistanceAway(km: number): string {
  if (!Number.isFinite(km) || km < 0) return ''
  if (km < 0.95) return `${Math.max(100, Math.round((km * 1000) / 50) * 50)} m away`
  if (km < 9.95) return `${km.toFixed(1)} km away`
  return `${Math.round(km)} km away`
}

/**
 * Centre points for searched areas. Catalog places carry a centre; a
 * listing-derived place with no centre (0,0) uses the average position of the
 * listings in it, when any are mapped.
 */
export function areaOriginPoints(places: readonly Place[], listings: readonly NearestRankable[]): GeoPoint[] {
  const out: GeoPoint[] = []
  for (const place of places) {
    if (hasMappedCoordinates(place)) {
      out.push({ lat: place.lat, lng: place.lng })
      continue
    }
    const label = norm(place.label)
    const inside = listings.filter(
      (l) => hasMappedCoordinates(l) && (norm(l.suburb) === label || norm(l.city) === label),
    )
    if (!inside.length) continue
    out.push({
      lat: inside.reduce((s, l) => s + l.lat!, 0) / inside.length,
      lng: inside.reduce((s, l) => s + l.lng!, 0) / inside.length,
    })
  }
  return out
}

/** The visitor picked "Nearest" this visit (the choice only — never the position). */
const NEAREST_CHOICE_KEY = 'lekaya.browse.nearest'

export function readNearestChoice(): boolean {
  try {
    return window.sessionStorage.getItem(NEAREST_CHOICE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeNearestChoice(on: boolean): void {
  try {
    if (on) window.sessionStorage.setItem(NEAREST_CHOICE_KEY, '1')
    else window.sessionStorage.removeItem(NEAREST_CHOICE_KEY)
  } catch {
    // Private mode / blocked storage: the choice just lasts until reload.
  }
}
