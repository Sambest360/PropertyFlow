/**
 * Cursor-paginated units feed — uses idx_units_feed_cursor.
 */
import { query } from './db.js'

export type UnitsFeedRow = {
  id: string
  building_id: string
  client_id: string
  unit_number: string
  title: string | null
  listing_type: string
  status_config_key: string
  bedrooms: number | null
  bathrooms: string | null
  parking: number | null
  square_meters: string | null
  price: string | null
  rent: string | null
  featured: boolean
  amenities: unknown
  images: unknown
  lat: string | null
  lng: string | null
  created_at: Date
}

export type UnitsFeedResult = {
  items: UnitsFeedRow[]
  nextCursor: string | null
  hasMore: boolean
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url')
}

function decodeCursor(cursor: string | null | undefined): { createdAt: string; id: string } | null {
  if (!cursor) return null
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8')
    const [createdAt, id] = raw.split('|')
    if (!createdAt || !id) return null
    return { createdAt, id }
  } catch {
    return null
  }
}

export async function fetchUnitsPage(opts: {
  clientId?: string | null
  cursor?: string | null
  limit?: number
}): Promise<UnitsFeedResult> {
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 100)
  const decoded = decodeCursor(opts.cursor)
  const params: unknown[] = []
  let where = 'WHERE 1=1'

  if (opts.clientId) {
    params.push(opts.clientId)
    where += ` AND u.client_id = $${params.length}::uuid`
  }

  if (decoded) {
    params.push(decoded.createdAt, decoded.id)
    where += ` AND (u.created_at, u.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`
  }

  params.push(limit + 1)
  const limitParam = params.length

  const rows = await query<UnitsFeedRow>(
    `SELECT u.id::text, u.building_id::text, u.client_id::text, u.unit_number, u.title,
            u.listing_type, u.status_config_key, u.bedrooms, u.bathrooms, u.parking,
            u.square_meters, u.price, u.rent, u.featured, u.amenities, u.images,
            u.lat, u.lng, u.created_at
     FROM units u
     ${where}
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT $${limitParam}`,
    params,
  )

  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items[items.length - 1]
  const nextCursor =
    hasMore && last ? encodeCursor(last.created_at, last.id) : null

  return { items, nextCursor, hasMore }
}
