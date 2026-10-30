/**
 * T2 (spec r4, C7): a listing has two separate sizes, never merged or summed.
 *  - floor size m²  → units.square_meters (an explicit entry wins over the room sum)
 *  - erf / stand m² → units.erf_size_sqm (migration 037), optional, blank for
 *    sectional-title units; never derived from the floor size.
 */

export const FLOOR_SIZE_LABEL = 'Floor size (m²)'
export const ERF_SIZE_LABEL = 'Erf / stand size (m²)'
export const ERF_SIZE_HINT = '1 ha = 10 000 m². Optional: leave blank for sectional-title units (flats and townhouses in a scheme).'
export const BACHELOR_STUDIO = 'Bachelor/Studio'

/** Largest value NUMERIC(12,2) holds. */
export const MAX_SIZE_SQM = 9_999_999_999.99

/** '' / null → null (not set); a finite number ≥ 0 → that number; anything else → 'invalid'. */
export function parseSizeSqm(raw: string | number | null | undefined): number | null | 'invalid' {
  if (raw == null) return null
  if (typeof raw === 'string' && raw.trim() === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw.trim())
  if (!Number.isFinite(n) || n < 0 || n > MAX_SIZE_SQM) return 'invalid'
  return n
}

/** Floor size to store: an explicit entry > 0 wins, otherwise the sum of the room sizes. */
export function effectiveFloorSizeSqm(
  explicit: string | number | null | undefined,
  rooms: Array<{ areaSqm?: string | number | null }>,
): number {
  const e = parseSizeSqm(explicit ?? null)
  if (typeof e === 'number' && e > 0) return e
  return rooms.reduce((sum, r) => sum + (Number(r.areaSqm) || 0), 0)
}

const RESIDENTIAL = new Set(['house', 'apartment', 'townhouse', 'flat', 'penthouse', 'cluster', 'duplex', 'simplex'])

/** Residential dwelling types (student accommodation is let per room, so not here). */
export function isResidentialType(type: string | null | undefined): boolean {
  return RESIDENTIAL.has((type ?? '').trim().toLowerCase().replace(/\s+/g, '_'))
}

/** Card bed fact: "N bed", "Bachelor/Studio" for a residential type with 0 bedrooms, else nothing. */
export function bedsLabel(type: string | null | undefined, beds: number | null | undefined): string | null {
  const n = Number(beds) || 0
  if (n > 0) return `${n} bed`
  return isResidentialType(type) ? BACHELOR_STUDIO : null
}

export function formatSqm(n: number): string {
  return `${n.toLocaleString('en-ZA', { maximumFractionDigits: 2 })} m²`
}

const isSet = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/** Card / detail size facts; a size that is not set is hidden (no "0 m²"). */
export function listingSizeFacts(p: { floorSqm: number | null | undefined; erfSqm: number | null | undefined }): {
  floor: string | null
  erf: string | null
} {
  return {
    floor: isSet(p.floorSqm) ? formatSqm(p.floorSqm) : null,
    erf: isSet(p.erfSqm) ? `Erf ${formatSqm(p.erfSqm)}` : null,
  }
}

/** Listing detail: the summary line and the Bedrooms stat value. */
export function listingDetailFacts(p: {
  type: string
  beds: number
  baths: number
  parking: number
  area: number
  erfSizeSqm?: number | null
  rooms: unknown[]
}): { summary: string[]; bedroomsValue: number | string } {
  const sizes = listingSizeFacts({ floorSqm: p.area, erfSqm: p.erfSizeSqm })
  const studio = p.beds > 0 ? null : bedsLabel(p.type, 0)
  const summary = [
    p.beds > 0 ? `${p.beds} bedrooms` : studio,
    p.baths > 0 ? `${p.baths} bathrooms` : null,
    `${p.parking} parking`,
    sizes.floor ? `${sizes.floor} floor` : null,
    sizes.erf,
    `${p.rooms.length} configured rooms`,
  ].filter((x): x is string => Boolean(x))
  return { summary, bedroomsValue: p.beds || studio || '—' }
}

/** Words in a title that name a type family, and the type labels that fit them. */
const TITLE_WORDS: Array<{ re: RegExp; word: string; fits: string[] }> = [
  { re: /\bhouse\b/i, word: 'house', fits: ['house'] },
  { re: /\b(industrial|warehouse|factory)\b/i, word: 'industrial', fits: ['industrial', 'commercial'] },
  { re: /\bfarm\b/i, word: 'farm', fits: ['farm'] },
  { re: /\b(apartment|flat)\b/i, word: 'apartment', fits: ['apartment', 'student_accommodation'] },
]

/**
 * A title that names another type than the one chosen ("Family house" on an
 * Apartment). Returns a warning to show; it never blocks the save.
 */
export function titleTypeWarning(title: string | null | undefined, type: string | null | undefined): string | null {
  const t = (type ?? '').trim()
  if (!t || !title) return null
  const slug = t.toLowerCase().replace(/\s+/g, '_')
  for (const w of TITLE_WORDS) {
    const m = w.re.exec(title)
    if (m && !w.fits.includes(slug)) {
      return `The title says "${m[0].toLowerCase()}" but the property type is ${t}. Check the type before you save (this will not stop the save).`
    }
  }
  return null
}
