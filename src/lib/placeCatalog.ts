import { PE_AREAS } from '../data/peAreas'
import type { ListingArea } from './listingAreas'

export type PlaceKind = 'suburb' | 'city'

export type Place = {
  id: string
  label: string
  kind: PlaceKind
  aliases: string[]
  lat: number
  lng: number
}

/** Extra PE suburbs referenced in marketing / seed that are not in PE_AREAS. */
const EXTRA_SUBURBS: readonly { suburb: string; lat: number; lng: number }[] = [
  { suburb: 'Mill Park', lat: -33.9608, lng: 25.6022 },
  { suburb: 'Bluewater Bay', lat: -33.845, lng: 25.635 },
  { suburb: 'Mount Pleasant', lat: -33.972, lng: 25.545 },
  { suburb: 'Richmond Hill', lat: -33.962, lng: 25.608 },
  { suburb: 'Framesby', lat: -33.9451, lng: 25.5702 },
]

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildCatalog(): Place[] {
  const suburbs = [...PE_AREAS, ...EXTRA_SUBURBS].map((a) => ({
    id: slugify(a.suburb),
    label: a.suburb,
    kind: 'suburb' as const,
    aliases: [] as string[],
    lat: a.lat,
    lng: a.lng,
  }))

  const city: Place = {
    id: 'gqeberha',
    label: 'Gqeberha',
    kind: 'city',
    aliases: ['Port Elizabeth', 'PE', 'Nelson Mandela Bay', 'NMB'],
    lat: -33.96,
    lng: 25.6,
  }

  return [city, ...suburbs]
}

export const PLACE_CATALOG: readonly Place[] = buildCatalog()

const PE_SUBURB_LABELS = new Set(
  PLACE_CATALOG.filter((p) => p.kind === 'suburb').map((p) => p.label.toLowerCase()),
)

export function getPlaceById(id: string): Place | undefined {
  const key = id.trim().toLowerCase()
  return PLACE_CATALOG.find((p) => p.id === key || p.label.toLowerCase() === key)
}

/**
 * A suburb or city from listing data that the curated catalog doesn't know
 * (e.g. a listing outside Gqeberha). Matched by name against suburb or city.
 */
export function listingPlace(label: string, kind: PlaceKind = 'suburb', lat?: number | null, lng?: number | null): Place {
  const clean = label.trim().replace(/\s+/g, ' ')
  return { id: slugify(clean), label: clean, kind, aliases: [], lat: lat ?? 0, lng: lng ?? 0 }
}

/** Typeahead / chip place for a listing area: the catalog entry when there is one. */
export function areaToPlace(area: Pick<ListingArea, 'label' | 'kind' | 'lat' | 'lng'>): Place {
  const known = resolvePlaces([area.label])[0]
  return known && getPlaceById(known.id) ? known : listingPlace(area.label, area.kind, area.lat, area.lng)
}

export function resolvePlaces(idsOrLabels: readonly string[]): Place[] {
  const out: Place[] = []
  const seen = new Set<string>()
  for (const raw of idsOrLabels) {
    const q = raw.trim().toLowerCase()
    const place =
      getPlaceById(raw) ??
      PLACE_CATALOG.find((p) => p.aliases.some((a) => a.toLowerCase() === q)) ??
      (q ? listingPlace(raw) : undefined)
    if (!place || seen.has(place.id)) continue
    seen.add(place.id)
    out.push(place)
  }
  return out
}

function scorePlace(place: Place, q: string): number {
  const label = place.label.toLowerCase()
  if (label === q) return 100
  if (place.aliases.some((a) => a.toLowerCase() === q)) return 95
  if (label.startsWith(q)) return 80
  if (place.aliases.some((a) => a.toLowerCase().startsWith(q))) return 75
  if (label.includes(q)) return 50
  if (place.aliases.some((a) => a.toLowerCase().includes(q))) return 40
  return 0
}

/** Ranked typeahead over the curated PE place catalog, or the given places (e.g. listing areas). */
export function searchPlaces(query: string, limit = 8, catalog: readonly Place[] = PLACE_CATALOG): Place[] {
  const q = query.trim().toLowerCase()
  if (!q) {
    return catalog.slice(0, limit)
  }
  return catalog.map((p) => ({ place: p, score: scorePlace(p, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.place.label.localeCompare(b.place.label))
    .slice(0, limit)
    .map((x) => x.place)
}

/** Haversine distance in kilometres. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Nearest suburbs to a point. City entries are excluded from the default near-me set
 * unless nothing else is within maxKm (then the city is returned alone).
 */
export function nearestPlaces(
  lat: number,
  lng: number,
  opts: { limit?: number; maxKm?: number } = {},
): Place[] {
  const limit = opts.limit ?? 4
  const maxKm = opts.maxKm ?? 25
  const origin = { lat, lng }

  const suburbs = PLACE_CATALOG.filter((p) => p.kind === 'suburb')
    .map((p) => ({ place: p, km: haversineKm(origin, p) }))
    .filter((x) => x.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, limit)
    .map((x) => x.place)

  if (suburbs.length > 0) return suburbs

  const city = PLACE_CATALOG.find((p) => p.kind === 'city')
  if (city && haversineKm(origin, city) <= maxKm * 2) return [city]
  return []
}

/** Whether a listing belongs to any of the selected places. */
export function propertyMatchesAreas(
  property: { suburb: string; city: string },
  selected: readonly Place[],
): boolean {
  if (!selected.length) return true
  const suburb = property.suburb.trim().toLowerCase()
  const city = property.city.trim().toLowerCase()

  for (const place of selected) {
    if (place.id === 'gqeberha') {
      // City selection = whole PE metro (any known suburb or PE city name)
      if (PE_SUBURB_LABELS.has(suburb)) return true
      if (
        city.includes('port elizabeth') ||
        city.includes('gqeberha') ||
        city === 'pe'
      ) {
        return true
      }
      continue
    }
    const label = place.label.toLowerCase()
    if (suburb === label) return true
    // Listing-derived cities (and suburbs named after their city) match on city.
    if (place.kind === 'city' || !getPlaceById(place.id)) {
      if (city === label) return true
    }
  }
  return false
}

export function encodeAreasParam(places: readonly Place[]): string {
  return places.map((p) => p.label).join(',')
}

export function parseAreasParam(raw: string | null | undefined): Place[] {
  if (!raw?.trim()) return []
  return resolvePlaces(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

export function buildBrowseSearchUrl(opts: {
  mode?: string
  areas?: readonly Place[]
  q?: string
}): string {
  const params = new URLSearchParams()
  if (opts.mode && opts.mode !== 'all') params.set('mode', opts.mode)
  if (opts.areas?.length) params.set('areas', encodeAreasParam(opts.areas))
  if (opts.q?.trim()) params.set('q', opts.q.trim())
  const qs = params.toString()
  return qs ? `/browse?${qs}` : '/browse'
}
