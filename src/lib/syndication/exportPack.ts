/**
 * Manual Property24 / Private Property export pack (Mode A).
 * Downloadable JSON + CSV of canonical fields — not a live portal feed.
 */

import type { CanonicalListing, ExportPack, PortalCode } from './types'

export const EXPORT_PACK_HONESTY =
  'Manual export pack — own-site / manual pack workflow, not live Property24 or Private Property push.'

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

const CSV_HEADER = [
  'listing_id',
  'portal_code',
  'headline',
  'description',
  'listing_mode',
  'price_zar',
  'rent_pcm_zar',
  'beds',
  'baths',
  'parking',
  'floor_size_sqm',
  'suburb',
  'city',
  'province',
  'address',
  'lat',
  'lng',
  'images',
  'amenities',
  'mandate_active',
  'available_on',
].join(',')

export function portalLabel(code: PortalCode): string {
  switch (code) {
    case 'property24':
      return 'Property24'
    case 'private_property':
      return 'Private Property'
    case 'propertyflow_marketplace':
      return 'PropertyFlow marketplace'
    default:
      return 'Other portal'
  }
}

export function buildManualExportPack(listing: CanonicalListing, at = new Date().toISOString()): ExportPack {
  const json = JSON.stringify(
    {
      honesty: EXPORT_PACK_HONESTY,
      generatedAt: at,
      listing,
    },
    null,
    2,
  )
  const cells = [
    listing.listingId,
    listing.portalCode,
    csvEscape(listing.headline),
    csvEscape(listing.description),
    listing.listingMode,
    listing.priceZar ?? '',
    listing.rentPcmZar ?? '',
    listing.beds,
    listing.baths,
    listing.parking,
    listing.floorSizeSqm ?? '',
    csvEscape(listing.suburb),
    csvEscape(listing.city),
    csvEscape(listing.province),
    csvEscape(listing.address),
    listing.lat ?? '',
    listing.lng ?? '',
    csvEscape(listing.images.join('|')),
    csvEscape(listing.amenities.join('|')),
    listing.mandateActive ? 'true' : 'false',
    listing.availableOn ?? '',
  ]
  const csv = [CSV_HEADER, cells.join(',')].join('\n')
  const safeId = listing.listingId.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40)
  return {
    portalCode: listing.portalCode,
    format: 'json_csv',
    filenameBase: `pf-export-${listing.portalCode}-${safeId}`,
    json,
    csv,
    generatedAt: at,
    honestyLabel: EXPORT_PACK_HONESTY,
  }
}

/** Simple payload hash for idempotency / change detection (Mode A local). */
export function hashCanonicalPayload(listing: CanonicalListing): string {
  const raw = JSON.stringify({
    headline: listing.headline,
    description: listing.description,
    priceZar: listing.priceZar,
    rentPcmZar: listing.rentPcmZar,
    beds: listing.beds,
    baths: listing.baths,
    parking: listing.parking,
    images: listing.images,
    suburb: listing.suburb,
    city: listing.city,
    lat: listing.lat,
    lng: listing.lng,
  })
  let h = 0
  for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0
  return `h${(h >>> 0).toString(16)}`
}
