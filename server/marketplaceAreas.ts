/**
 * GET /api/public/marketplace/areas: suburbs and cities that published
 * listings are in, with counts for Buy and Rent (home hero Popular areas and
 * the area typeahead). Read-only, built from the same guest-visible rows as
 * /api/public/marketplace, so no address detail leaves the server — only the
 * suburb / city names and ~1 km rounded centres guests already see.
 */
import { aggregateListingAreas, type ListingArea, type ListingAreaRow } from '../src/lib/listingAreas.js'

export type MarketplaceAreasBody = { areas: ListingArea[]; listings: number; fetchedAt: string }

export function marketplaceAreasFromGuestPayload(payload: Record<string, unknown>, now = new Date()): MarketplaceAreasBody {
  const rows = Array.isArray(payload.properties) ? (payload.properties as ListingAreaRow[]) : []
  return { areas: aggregateListingAreas(rows), listings: rows.length, fetchedAt: now.toISOString() }
}

const TTL_MS = 5 * 60_000
let cached: { at: number; body: MarketplaceAreasBody } | null = null
let inflight: Promise<MarketplaceAreasBody> | null = null

/** Five-minute cache: the home page hits this on every visit. */
export async function cachedMarketplaceAreas(
  load: () => Promise<Record<string, unknown>>,
  nowMs = Date.now(),
): Promise<MarketplaceAreasBody> {
  if (cached && nowMs - cached.at < TTL_MS) return cached.body
  inflight ??= load()
    .then((payload) => {
      const body = marketplaceAreasFromGuestPayload(payload)
      cached = { at: nowMs, body }
      return body
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** Tests only. */
export function resetMarketplaceAreasCache() {
  cached = null
  inflight = null
}
