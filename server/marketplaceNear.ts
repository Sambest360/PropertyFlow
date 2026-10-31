/**
 * Near-aware guest marketplace (GET /api/public/marketplace with an
 * X-Browse-Near header): the nearest published units to a point instead of the
 * newest 60, so nearest-first browse holds past the first batch.
 *
 * The point arrives in a header (not the URL, so it stays out of access logs),
 * is rounded to 2 decimals (~1 km) before use, and is never logged or stored.
 */
import { query } from './db.js'
import { PUBLIC_UNITS_WHERE } from './unitsFeed.js'

/** Header carrying "lat,lng" or "lat,lng,mode" (mode = rent | buy). */
export const BROWSE_NEAR_HEADER = 'X-Browse-Near'

/** Units returned for a near request: room for many "Show more" sets on /browse. */
export const NEAR_UNIT_LIMIT = 250

/** Bounding-box half-widths tried in turn; past the last, no box. */
export const NEAR_BOX_STEPS_KM = [25, 100, 400] as const

export type NearPoint = { lat: number; lng: number; mode: 'rent' | 'buy' | null }

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** "lat,lng[,mode]" → a rounded point, or null when absent / malformed / out of range. */
export function parseNearHeader(raw: string | null | undefined): NearPoint | null {
  if (!raw) return null
  const [latRaw, lngRaw, modeRaw] = raw.split(',').map((s) => s.trim())
  const lat = Number(latRaw)
  const lng = Number(lngRaw)
  if (!latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null
  const mode = modeRaw === 'rent' || modeRaw === 'buy' ? modeRaw : null
  return { lat: round2(lat), lng: round2(lng), mode }
}

/** Box around a point, `km` each way (no antimeridian handling: the marketplace is South African). */
export function boundingBox(lat: number, lng: number, km: number) {
  const dLat = km / 111.32
  const dLng = km / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01))
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng }
}

function modeClause(mode: NearPoint['mode']): string {
  if (mode === 'rent') return ` AND lower(coalesce(u.listing_type, 'rent')) IN ('rent', 'both')`
  if (mode === 'buy') return ` AND lower(coalesce(u.listing_type, 'rent')) IN ('sale', 'both')`
  return ''
}

// Unit coordinates fall back to the building's; 0,0 is the missing sentinel.
const LAT = 'coalesce(u.lat, b.lat)'
const LNG = 'coalesce(u.lng, b.lng)'
const MAPPED = `${LAT} IS NOT NULL AND ${LNG} IS NOT NULL AND NOT (${LAT} = 0 AND ${LNG} = 0)`

/**
 * Nearest mapped public units, closest first (haversine km in SQL), newest
 * breaking ties. With `boxKm`, a cheap lat/lng range prefilter runs first.
 */
export function nearestMappedUnitsSql(point: NearPoint, limit: number, boxKm: number | null) {
  const params: unknown[] = [point.lat, point.lng]
  let box = ''
  if (boxKm != null) {
    const b = boundingBox(point.lat, point.lng, boxKm)
    params.push(b.minLat, b.maxLat, b.minLng, b.maxLng)
    box = ` AND ${LAT} BETWEEN $3 AND $4 AND ${LNG} BETWEEN $5 AND $6`
  }
  params.push(limit)
  const text = `SELECT id, km FROM (
       SELECT u.id::text AS id, u.created_at,
              2 * 6371 * asin(least(1, sqrt(
                power(sin(radians(${LAT} - $1) / 2), 2)
                + cos(radians($1)) * cos(radians(${LAT})) * power(sin(radians(${LNG} - $2) / 2), 2)
              ))) AS km
       FROM units u
       JOIN buildings b ON b.id = u.building_id
       LEFT JOIN users ll ON ll.id = b.landlord_id
       WHERE ${PUBLIC_UNITS_WHERE}${modeClause(point.mode)}
         AND ${MAPPED}${box}
     ) near
     ORDER BY km ASC, created_at DESC, id
     LIMIT $${params.length}`
  return { text, params }
}

/** Newest public units without coordinates (they go after every mapped one). */
export function unmappedUnitsSql(point: NearPoint, limit: number) {
  return {
    text: `SELECT u.id::text AS id
     FROM units u
     JOIN buildings b ON b.id = u.building_id
     LEFT JOIN users ll ON ll.id = b.landlord_id
     WHERE ${PUBLIC_UNITS_WHERE}${modeClause(point.mode)}
       AND NOT (${MAPPED})
     ORDER BY u.created_at DESC, u.id
     LIMIT $1`,
    params: [limit] as unknown[],
  }
}

type Query = <T extends Record<string, unknown>>(text: string, params: unknown[]) => Promise<T[]>

/**
 * Ids of the `limit` nearest public units: mapped ones closest first, then
 * the newest unmapped ones. The box widens until the result is provably the
 * true nearest set (the farthest kept unit lies inside the box's radius) or,
 * past the last step, no box is used.
 */
export async function nearestPublicUnitIds(
  point: NearPoint,
  opts: { limit?: number; run?: Query } = {},
): Promise<string[]> {
  const limit = opts.limit ?? NEAR_UNIT_LIMIT
  const run: Query = opts.run ?? ((text, params) => query(text, params) as never)
  let mapped: { id: string; km: number }[] = []
  for (const boxKm of [...NEAR_BOX_STEPS_KM, null]) {
    const sql = nearestMappedUnitsSql(point, limit, boxKm)
    const rows = await run<{ id: string; km: number | string }>(sql.text, sql.params)
    mapped = rows.map((r) => ({ id: String(r.id), km: Number(r.km) }))
    const full = mapped.length >= limit
    // Units in the box corners can be farther than units just outside it, so a
    // full page only counts when its farthest unit is within the box radius.
    if (boxKm == null || (full && mapped[mapped.length - 1].km <= boxKm)) break
  }
  const ids = mapped.map((r) => r.id)
  if (ids.length < limit) {
    const sql = unmappedUnitsSql(point, limit - ids.length)
    const rows = await run<{ id: string }>(sql.text, sql.params)
    ids.push(...rows.map((r) => String(r.id)))
  }
  return ids
}
