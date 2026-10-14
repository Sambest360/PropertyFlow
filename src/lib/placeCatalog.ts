import { PE_AREAS } from '../data/peAreas'

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

export function resolvePlaces(idsOrLabels: readonly string[]): Place[] {
  const out: Place[] = []
  const seen = new Set<string>()
  for (const raw of idsOrLabels) {
    const place = getPlaceById(raw) ?? PLACE_CATALOG.find((p) => matchesQuery(p, raw.trim().toLowerCase()))
    if (!place || seen.has(place.id)) continue
    seen.add(place.id)
    out.push(place)
  }
  return out
}

function matchesQuery(place: Place, q: string): boolean {
  if (!q) return true
  if (place.label.toLowerCase().includes(q)) return true
  if (place.id.includes(q)) return true
  return place.aliases.some((a) => a.toLowerCase().includes(q))
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

/** Ranked typeahead over the curated PE place catalog. */
export function searchPlaces(query: string, limit = 8): Place[] {
  const q = query.trim().toLowerCase()
  if (!q) {
    return PLACE_CATALOG.slice(0, limit)
  }
  return PLACE_CATALOG.map((p) => ({ place: p, score: scorePlace(p, q) }))
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
    if (place.kind === 'city') {
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
    if (suburb === place.label.toLowerCase()) return true
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
