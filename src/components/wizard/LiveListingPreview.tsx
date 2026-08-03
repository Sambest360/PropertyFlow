import { Bath, BedDouble, Car, MapPin } from 'lucide-react'
import { Badge, cn } from '../ui'
import { formatZAR } from '../../data/seed'

export function LiveListingPreview({
  title,
  type,
  address,
  city,
  suburb,
  beds,
  baths,
  parking,
  rent,
  price,
  listingMode,
  coverImage,
  status = 'Draft',
  className,
}: {
  title?: string
  type?: string
  address?: string
  city?: string
  suburb?: string
  beds?: number
  baths?: number
  parking?: number
  rent?: number | null
  price?: number | null
  listingMode?: 'rent' | 'sale' | 'both'
  coverImage?: string | null
  status?: string
  className?: string
}) {
  const displayTitle = title?.trim() || 'Property title'
  const location = [address, suburb, city].filter(Boolean).join(', ') || 'Address not set'
  const priceLine =
    listingMode === 'sale' && price
      ? formatZAR(price)
      : listingMode === 'rent' && rent
        ? `${formatZAR(rent)}/mo`
        : listingMode === 'both' && (rent || price)
          ? [rent ? `${formatZAR(rent)}/mo` : null, price ? formatZAR(price) : null].filter(Boolean).join(' · ')
          : 'Set pricing'

  return (
    <div className={cn('overflow-hidden rounded-xl border border-primary-100 bg-white shadow-sm', className)}>
      <div className="relative aspect-[4/3] bg-primary-50">
        {coverImage ? (
          <img src={coverImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-400">Photo preview</div>
        )}
        <Badge className="absolute left-3 top-3 bg-white/95 text-ink-700">{status}</Badge>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{type || 'Type'}</p>
          <h3 className="font-display text-lg font-semibold text-ink">{displayTitle}</h3>
        </div>
        <p className="flex items-start gap-1.5 text-sm text-ink-500">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.6} aria-hidden />
          <span>{location}</span>
        </p>
        <div className="flex flex-wrap gap-3 text-sm text-ink-600">
          <span className="inline-flex items-center gap-1">
            <BedDouble className="h-4 w-4 text-primary" strokeWidth={1.6} aria-hidden />
            {beds ?? 0} beds
          </span>
          <span className="inline-flex items-center gap-1">
            <Bath className="h-4 w-4 text-primary" strokeWidth={1.6} aria-hidden />
            {baths ?? 0} baths
          </span>
          <span className="inline-flex items-center gap-1">
            <Car className="h-4 w-4 text-primary" strokeWidth={1.6} aria-hidden />
            {parking ?? 0} parking
          </span>
        </div>
        <p className="text-base font-semibold text-primary">{priceLine}</p>
        <p className="rounded-lg border border-primary-100 bg-primary-50/50 px-3 py-2 text-xs text-ink-500">
          Live preview — how this listing may appear when published.
        </p>
      </div>
    </div>
  )
}
