/**
 * Canonical listing projection + completeness for syndication / export readiness.
 * Mandate incomplete → soft-warn only (Mode A — no invented mandate hard-gate).
 */

import type { PropertyAsset } from '../../types/domain'
import { canonicalListingId } from '../listingIds'
import type {
  CanonicalListing,
  CompletenessIssue,
  CompletenessResult,
  PortalCode,
} from './types'

const CONTACT_IN_DESC_RE =
  /(\+?\d[\d\s()-]{6,}\d)|([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(whatsapp|call me|phone:|cell:)/i

const ALL_CAPS_WORDY_RE = /^[A-Z0-9\s,.!?'-]{40,}$/

export const SYNDICATION_MODE_A_COPY =
  'Non-production syndication. Own-site marketplace publish plus manual Property24 / Private Property export packs and lead CSV into CRM — not live P24/PP push, not portal parity, and not a live partner feed.'

export function isMandateActiveSoft(
  property: Pick<PropertyAsset, 'mandateActive'> | { mandateActive?: boolean | null },
): boolean {
  return property.mandateActive === true
}

export function mandateSoftWarnMessage(
  property: Pick<PropertyAsset, 'mandateActive'> | { mandateActive?: boolean | null },
): string | null {
  if (isMandateActiveSoft(property)) return null
  return 'No signed mandate recorded yet. You can still download the listing pack.'
}

export function buildCanonicalListing(
  property: PropertyAsset,
  portalCode: PortalCode,
  opts: { province?: string; availableOn?: string | null } = {},
): CanonicalListing {
  const listingId = canonicalListingId(property.id)
  return {
    listingId,
    propertyId: property.id,
    unitId: property.unitId ?? null,
    agencyId: property.agencyId,
    portalCode,
    headline: (property.title ?? '').trim().slice(0, 100),
    description: (property.description ?? '').trim(),
    listingMode: property.listingMode,
    priceZar: property.price,
    rentPcmZar: property.rent,
    beds: property.beds ?? 0,
    baths: property.baths ?? 0,
    parking: property.parking ?? 0,
    floorSizeSqm: property.area > 0 ? property.area : null,
    suburb: (property.suburb ?? '').trim(),
    city: (property.city ?? '').trim(),
    province: (opts.province ?? '').trim(),
    address: (property.address ?? '').trim(),
    lat: Number.isFinite(property.lat) && property.lat !== 0 ? property.lat : null,
    lng: Number.isFinite(property.lng) && property.lng !== 0 ? property.lng : null,
    images: Array.isArray(property.images) ? property.images.filter(Boolean) : [],
    amenities: property.amenities ?? [],
    mandateActive: isMandateActiveSoft(property),
    availableOn: opts.availableOn ?? null,
    features: property.amenities ?? [],
  }
}

export function assessSyndicationCompleteness(
  listing: CanonicalListing,
): CompletenessResult {
  const issues: CompletenessIssue[] = []
  let score = 0
  const maxScore = 12

  const check = (ok: boolean, pts: number, code: string, severity: 'error' | 'warn', message: string) => {
    if (ok) score += pts
    else issues.push({ code, severity, message })
  }

  check(listing.headline.length > 0, 1, 'headline', 'error', 'Add a listing headline / title.')
  check(
    listing.headline.length <= 100,
    0,
    'headline_length',
    'warn',
    'Keep the title under 100 characters.',
  )
  // headline length failure shouldn't remove the headline point — only warn
  if (listing.headline.length > 100) {
    /* already warned */
  }

  check(listing.description.length >= 40, 1, 'description', 'error', 'Add a unique description (40+ characters).')
  if (listing.description && CONTACT_IN_DESC_RE.test(listing.description)) {
    issues.push({
      code: 'description_contact',
      severity: 'warn',
      message: 'Description appears to contain contact details — portals often reject this.',
    })
  }
  if (listing.description && ALL_CAPS_WORDY_RE.test(listing.description)) {
    issues.push({
      code: 'description_caps',
      severity: 'warn',
      message: 'Description looks ALL CAPS — portals may moderate this.',
    })
  }

  const hasPrice =
    listing.listingMode === 'sale' || listing.listingMode === 'both'
      ? listing.priceZar != null && listing.priceZar > 0
      : true
  const hasRent =
    listing.listingMode === 'rent' || listing.listingMode === 'both'
      ? listing.rentPcmZar != null && listing.rentPcmZar > 0
      : true
  check(hasPrice && hasRent, 1, 'price', 'error', 'Set sale price and/or rent (pcm) for the listing mode.')

  check(listing.beds >= 0 && listing.baths >= 0, 1, 'beds_baths', 'error', 'Set beds and baths.')
  check(listing.parking >= 0, 1, 'parking', 'warn', 'Set parking count when known.')
  check(listing.floorSizeSqm != null && listing.floorSizeSqm > 0, 1, 'size', 'warn', 'Add floor / erf size (sqm).')
  check(Boolean(listing.suburb), 1, 'suburb', 'error', 'Add suburb.')
  check(Boolean(listing.city), 1, 'city', 'error', 'Add city.')
  check(listing.lat != null && listing.lng != null, 1, 'geo', 'warn', 'Pin the property on the map so portals can show its location.')
  check(listing.images.length >= 1, 1, 'images_min', 'error', 'Add at least one listing photo.')
  if (listing.images.length > 0 && listing.images.length < 8) {
    issues.push({
      code: 'images_count',
      severity: 'warn',
      message: `Only ${listing.images.length} photo(s). Portals show listings with 8 or more photos higher.`,
    })
  } else if (listing.images.length >= 8) {
    score += 1
  }

  check(listing.listingId.length > 0, 1, 'listing_id', 'error', 'The listing needs a reference number.')

  const mandateSoftWarn = listing.mandateActive
    ? null
    : 'No signed mandate recorded yet. You can still download the listing pack.'
  if (mandateSoftWarn) {
    issues.push({ code: 'mandate', severity: 'warn', message: mandateSoftWarn })
  } else {
    score += 1
  }

  const hardErrors = issues.filter((i) => i.severity === 'error')
  return {
    ready: hardErrors.length === 0,
    score: Math.min(score, maxScore),
    maxScore,
    issues,
    mandateSoftWarn,
  }
}

export function assessPropertySyndicationReadiness(
  property: PropertyAsset,
  portalCode: PortalCode = 'property24',
): CompletenessResult {
  return assessSyndicationCompleteness(buildCanonicalListing(property, portalCode))
}
