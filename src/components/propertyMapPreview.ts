import { formatZAR } from '../data/seed'
import { canonicalListingId, listingIdAliases, unitIdForProperty } from '../lib/listingIds'
import type { UnitCardPayload } from '../lib/api/unitsApi'
import type { PropertyAsset } from '../types/domain'

export type MapPreviewFields = {
  title: string
  priceLabel: string
  image: string | undefined
  beds: number
  baths: number
  parking: number
  area: number
  suburb: string
  city: string
}

/** Resolve browse unit card when property id is an alias (unt-* / PR-* / uuid). */
export function resolveCardForProperty(
  property: PropertyAsset,
  cards?: Record<string, UnitCardPayload>,
): UnitCardPayload | undefined {
  if (!cards) return undefined
  const keys = new Set<string>([
    property.id,
    canonicalListingId(property.id),
    unitIdForProperty(property.id),
    ...listingIdAliases(property.id),
  ])
  for (const key of keys) {
    if (key && cards[key]) return cards[key]
  }
  return undefined
}

function zarAmountFromDisplayLabel(label: string): number | null {
  const match = label.match(/R\s*([\d\s]+)/i)
  if (!match) return null
  const n = Number(match[1].replace(/\s/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

function primaryAmountForPin(
  property: PropertyAsset,
  mode: string,
  card?: UnitCardPayload,
): { amount: number; isRent: boolean } | null {
  const fromLabel = card?.display_metadata.primary_amount_label
    ? zarAmountFromDisplayLabel(card.display_metadata.primary_amount_label)
    : null

  const isSale = property.listingMode === 'sale'
  if (fromLabel != null) {
    const rentish =
      !isSale &&
      (mode === 'rent' ||
        property.listingMode === 'rent' ||
        /\/\s*month/i.test(card?.display_metadata.primary_amount_label ?? ''))
    return { amount: fromLabel, isRent: rentish && !isSale }
  }

  if (mode === 'rent' && property.rent != null) return { amount: property.rent, isRent: true }
  if (mode === 'buy' && property.price != null) return { amount: property.price, isRent: false }
  if (property.price != null) return { amount: property.price, isRent: false }
  if (property.rent != null) return { amount: property.rent, isRent: true }
  return null
}

/** Compact pin label aligned with browse card amounts (e.g. R14.5k/mo not R15k for R14 500). */
export function formatMapPinLabel(
  property: PropertyAsset,
  mode: string,
  card?: UnitCardPayload,
): string {
  const primary = primaryAmountForPin(property, mode, card)
  if (!primary) return 'View'

  const { amount, isRent } = primary
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000
    const s =
      m >= 10
        ? m.toFixed(1)
        : m.toFixed(2).replace(/0$/, '').replace(/\.$/, '')
    return isRent ? `R${s}m/mo` : `R${s}m`
  }

  if (amount >= 1_000) {
    const k = Math.round((amount / 1_000) * 10) / 10
    const s = k % 1 === 0 ? String(k) : k.toFixed(1)
    return isRent ? `R${s}k/mo` : `R${s}k`
  }

  const compact = formatZAR(amount)
  return isRent ? `${compact}/mo` : compact
}

/** Align map popup copy with browse grid cards when unit card data is available. */
export function resolveMapPreviewFields(
  property: PropertyAsset,
  mode: string,
  card?: UnitCardPayload,
): MapPreviewFields {
  const isSaleListing = property.listingMode === 'sale'
  const priceLabel = isSaleListing
    ? property.price != null
      ? formatZAR(property.price)
      : (card?.display_metadata.primary_amount_label ?? '')
    : card?.display_metadata.primary_amount_label
      ? card.display_metadata.primary_amount_label
      : mode === 'rent' && property.rent != null
        ? `${formatZAR(property.rent)} / month`
        : property.price != null
          ? formatZAR(property.price)
          : property.rent != null
            ? `${formatZAR(property.rent)} / month`
            : '—'

  const title = (card?.title ?? property.title).trim()
  const image = card?.primary_image ?? property.images[0]

  return {
    title,
    priceLabel,
    image,
    beds: card?.bedrooms ?? property.beds,
    baths: card?.bathrooms ?? property.baths,
    parking: card?.parking ?? property.parking,
    area: card?.square_meters ?? property.area,
    suburb: card?.building.suburb ?? property.suburb,
    city: card?.building.city ?? property.city,
  }
}
