import { formatZAR } from '../data/seed'
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
