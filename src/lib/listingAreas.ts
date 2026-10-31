/**
 * Suburbs and cities that published listings are actually in, with counts per
 * marketplace section. Powers the home hero (Popular areas, the suburb / city
 * typeahead and Near me). Shared by GET /api/public/marketplace/areas and the
 * client fallback, so both count the same way.
 */
import { matchesBrowseMode } from './browseMode.js'

export type ListingAreaRow = {
  suburb?: string | null
  city?: string | null
  type?: string | null
  listingMode?: string | null
  price?: number | null
  rent?: number | null
  lat?: number | null
  lng?: number | null
}

export type ListingArea = {
  label: string
  kind: 'suburb' | 'city'
  /** Suburbs: the city most of its listings are in. */
  city: string | null
  /** All published listings in the area. */
  total: number
  buy: number
  rent: number
  /** Average listing position (guest coordinates are rounded to ~1 km); null when none have one. */
  lat: number | null
  lng: number | null
}

export type HeroMode = 'buy' | 'rent'

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''
}

function validCoord(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  )
}

type Acc = ListingArea & { latSum: number; lngSum: number; coords: number; cities: Map<string, number> }

export function aggregateListingAreas(rows: readonly ListingAreaRow[]): ListingArea[] {
  const byKey = new Map<string, Acc>()
  const bump = (kind: 'suburb' | 'city', label: string, row: ListingAreaRow, city: string) => {
    const key = `${kind}:${label.toLowerCase()}`
    let a = byKey.get(key)
    if (!a) {
      a = { label, kind, city: null, total: 0, buy: 0, rent: 0, lat: null, lng: null, latSum: 0, lngSum: 0, coords: 0, cities: new Map() }
      byKey.set(key, a)
    }
    const p = {
      type: clean(row.type),
      listingMode: (row.listingMode ?? 'rent') as 'sale' | 'rent' | 'both',
      price: row.price ?? null,
      rent: row.rent ?? null,
    }
    a.total += 1
    if (matchesBrowseMode(p, 'buy')) a.buy += 1
    if (matchesBrowseMode(p, 'rent')) a.rent += 1
    if (validCoord(row.lat, row.lng)) {
      a.latSum += row.lat as number
      a.lngSum += row.lng as number
      a.coords += 1
    }
    if (city) a.cities.set(city, (a.cities.get(city) ?? 0) + 1)
  }
  for (const row of rows) {
    const suburb = clean(row.suburb)
    const city = clean(row.city)
    if (suburb) bump('suburb', suburb, row, city)
    if (city && city.toLowerCase() !== suburb.toLowerCase()) bump('city', city, row, '')
  }
  return [...byKey.values()].map(({ latSum, lngSum, coords, cities, ...a }) => ({
    ...a,
    city: a.kind === 'suburb' ? ([...cities.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null) : null,
    lat: coords ? Math.round((latSum / coords) * 1000) / 1000 : null,
    lng: coords ? Math.round((lngSum / coords) * 1000) / 1000 : null,
  }))
}

export function areaCount(area: ListingArea, mode: HeroMode): number {
  return mode === 'buy' ? area.buy : area.rent
}

/** Busiest suburbs for the section (cities when no suburbs are set), most listings first. */
export function popularAreasForMode(areas: readonly ListingArea[], mode: HeroMode, limit = 7): ListingArea[] {
  const ranked = (kind: ListingArea['kind']) =>
    areas
      .filter((a) => a.kind === kind && areaCount(a, mode) > 0)
      .sort((a, b) => areaCount(b, mode) - areaCount(a, mode) || a.label.localeCompare(b.label))
  const suburbs = ranked('suburb')
  return (suburbs.length ? suburbs : ranked('city')).slice(0, limit)
}

/** The listing area closest to a point, within maxKm. */
export function nearestListingArea(
  areas: readonly ListingArea[],
  origin: { lat: number; lng: number },
  mode: HeroMode,
  maxKm: number,
  distanceKm: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number,
): { area: ListingArea; km: number } | null {
  let best: { area: ListingArea; km: number } | null = null
  for (const area of areas) {
    if (area.lat == null || area.lng == null || areaCount(area, mode) === 0) continue
    const km = distanceKm(origin, { lat: area.lat, lng: area.lng })
    if (km <= maxKm && (!best || km < best.km)) best = { area, km }
  }
  return best
}
