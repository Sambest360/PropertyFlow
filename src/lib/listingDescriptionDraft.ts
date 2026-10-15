export type ListingDescriptionContext = {
  propertyType: string
  listingMode: 'rent' | 'sale' | 'both'
  suburb: string
  city: string
  beds: number
  baths: number
  parking: number
  garages?: number
  areaSqm?: number
  rent?: number | null
  price?: number | null
  amenities: string[]
  unfurnished?: boolean
  title?: string
}

function formatZar(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA')}`
}

function bedLabel(beds: number, unfurnished?: boolean): string {
  if (beds === 0) return unfurnished ? 'unfurnished open-plan layout' : 'studio / open-plan layout'
  return `${beds} bedroom${beds === 1 ? '' : 's'}`
}

/** Factual plain-text block agents can refine — not AI-generated. */
export function buildListingSummaryBlock(ctx: ListingDescriptionContext): string {
  const place = [ctx.suburb.trim(), ctx.city.trim()].filter(Boolean).join(', ') || 'this area'
  const type = ctx.propertyType.trim() || 'Property'
  const layout = `${bedLabel(ctx.beds, ctx.unfurnished)}, ${ctx.baths} bathroom${ctx.baths === 1 ? '' : 's'}`
  const parking =
    ctx.parking > 0 || (ctx.garages ?? 0) > 0
      ? `, ${ctx.parking} open parking${ctx.parking === 1 ? '' : ' bays'}${(ctx.garages ?? 0) > 0 ? ` and ${ctx.garages} garage${ctx.garages === 1 ? '' : 's'}` : ''}`
      : ''
  const size = ctx.areaSqm && ctx.areaSqm > 0 ? `, approximately ${ctx.areaSqm} m²` : ''

  const lines: string[] = []
  if (ctx.title?.trim()) {
    lines.push(ctx.title.trim())
    lines.push('')
  }

  const mode =
    ctx.listingMode === 'sale'
      ? 'for sale'
      : ctx.listingMode === 'both'
        ? 'to rent or buy'
        : 'to rent'

  lines.push(
    `${type} ${mode} in ${place}. This home offers ${layout}${parking}${size}.`,
  )

  if (ctx.listingMode === 'rent' || ctx.listingMode === 'both') {
    if (ctx.rent != null && ctx.rent > 0) {
      lines.push(`Monthly rental: ${formatZar(ctx.rent)}.`)
    }
  }
  if (ctx.listingMode === 'sale' || ctx.listingMode === 'both') {
    if (ctx.price != null && ctx.price > 0) {
      lines.push(`Asking price: ${formatZar(ctx.price)}.`)
    }
  }

  const amenityPick = ctx.amenities.filter((a) => a.trim()).slice(0, 12)
  if (amenityPick.length) {
    lines.push('')
    lines.push('Features:')
    for (const a of amenityPick) {
      lines.push(`• ${a}`)
    }
  }

  lines.push('')
  lines.push('Ideal for: (describe your ideal tenant or buyer here)')

  return lines.join('\n').trimEnd()
}
