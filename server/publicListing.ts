/**
 * P3a: GET /api/public/marketplace?id=<propertyId>. The listing is looked up
 * by id directly (no row window), then goes through the same guest filter
 * (isGuestVisibleProperty + id hiding) as the list. Unlisted or unknown: 404.
 */
import { filterBootstrapForGuest } from './guestMarketplace.js'

type Row = Record<string, unknown>

export type PublicListingDeps = {
  /** Unit uuid for a listing id, or null when unknown. */
  resolveUnitId: (listingId: string) => Promise<string | null>
  /** Bootstrap rows for exactly these unit uuids. */
  build: (unitIds: string[]) => Promise<Row>
}

export type PublicListingResult = { status: 200; body: Row } | { status: 404; body: Row }

const NOT_FOUND: PublicListingResult = {
  status: 404,
  body: { error: 'listing_not_found', message: 'This listing is not available.' },
}

export async function publicListingById(listingId: string, deps: PublicListingDeps): Promise<PublicListingResult> {
  const id = listingId.trim()
  if (!id) return NOT_FOUND
  const unitId = await deps.resolveUnitId(id).catch(() => null)
  if (!unitId) return NOT_FOUND
  const data = await deps.build([unitId])
  const props = Array.isArray(data.properties) ? (data.properties as Row[]) : []
  if (props.length !== 1) return NOT_FOUND
  const guest = filterBootstrapForGuest(data, { listingId: String(props[0].id) })
  if (!(Array.isArray(guest.properties) && guest.properties.length)) return NOT_FOUND
  return { status: 200, body: guest }
}
