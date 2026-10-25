import { useEffect, useMemo, useState } from 'react'
import {
  Bath,
  BedDouble,
  Car,
  ChevronLeft,
  ChevronRight,
  Droplets,
  MapPin,
  Sun,
  Zap,
} from 'lucide-react'
import { cn } from '../ui'
import { formatZAR } from '../../data/seed'
import { ExpandableDescription } from '../listing/ExpandableDescription'
import { featureByLabel } from '../../lib/propertyFeatures'
import type { BuildingGrading } from '../../data/infrastructure'
import { isLoadSheddingFreeListing } from '../../lib/loadShedding'

export type LiveListingPreviewProps = {
  title?: string
  type?: string
  buildingName?: string
  address?: string
  city?: string
  suburb?: string
  beds?: number
  baths?: number
  parking?: number
  garages?: number
  area?: number
  rent?: number | null
  price?: number | null
  listingMode?: 'rent' | 'sale' | 'both'
  images?: string[]
  amenities?: string[]
  description?: string
  grading?: BuildingGrading
  solarCapacityKw?: number
  hasBorehole?: boolean
  instantBook?: boolean
  minStayDays?: number | null
  depositHint?: string
  status?: string
  className?: string
}

function listingBadge(mode?: 'rent' | 'sale' | 'both') {
  if (mode === 'both') return 'Sale or Rent'
  if (mode === 'sale') return 'For Sale'
  return 'To Rent'
}

function resolvePriceLine(
  listingMode: LiveListingPreviewProps['listingMode'],
  rent?: number | null,
  price?: number | null,
): string {
  if (listingMode === 'sale' && price) return formatZAR(price)
  if (listingMode === 'rent' && rent) return `${formatZAR(rent)} / month`
  if (listingMode === 'both') {
    const parts = [
      rent ? `${formatZAR(rent)} / month` : null,
      price ? formatZAR(price) : null,
    ].filter(Boolean)
    if (parts.length) return parts.join(' · ')
  }
  return 'Set pricing'
}

function resolveEntryFees(
  listingMode: LiveListingPreviewProps['listingMode'],
  rent?: number | null,
  price?: number | null,
): number | null {
  if (listingMode === 'sale') {
    return price != null ? Math.round(price * 0.1) : null
  }
  if (rent != null) {
    return rent + rent * 2
  }
  return null
}

export function LiveListingPreview({
  title,
  type,
  buildingName,
  address,
  city,
  suburb,
  beds,
  baths,
  parking,
  garages = 0,
  area,
  rent,
  price,
  listingMode = 'rent',
  images = [],
  amenities = [],
  description,
  grading,
  solarCapacityKw = 0,
  hasBorehole = false,
  instantBook = false,
  minStayDays,
  depositHint,
  status = 'Draft',
  className,
}: LiveListingPreviewProps) {
  const [photoIndex, setPhotoIndex] = useState(0)

  useEffect(() => {
    setPhotoIndex(0)
  }, [images.length, images[0]])

  const displayTitle =
    title?.trim() ||
    (type && (suburb || city) ? `${type} in ${suburb || city}` : 'Property title')

  // Match the public listing: suburb and city only (street address is never shown to guests).
  const location = [suburb, city].filter(Boolean).join(', ') || 'Suburb and city not set'

  const priceLine = resolvePriceLine(listingMode, rent, price)
  const entryFees = resolveEntryFees(listingMode, rent, price)

  const loadFree = isLoadSheddingFreeListing(amenities)

  const premium = grading === 'P' || (solarCapacityKw >= 20 && hasBorehole)

  const highlightFeatures = useMemo(() => amenities.slice(0, 3), [amenities])
  const activeImage = images[photoIndex] ?? images[0]
  const hasMultiplePhotos = images.length > 1

  function showPrevPhoto() {
    setPhotoIndex((i) => (i === 0 ? images.length - 1 : i - 1))
  }

  function showNextPhoto() {
    setPhotoIndex((i) => (i === images.length - 1 ? 0 : i + 1))
  }

  return (
    <div className={cn('overflow-hidden rounded-xl border border-primary-100 bg-white shadow-sm', className)}>
      <div className="relative aspect-[4/3] bg-primary-50">
        {activeImage ? (
          <img src={activeImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-400">Photo preview</div>
        )}

        <div className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-sm">
          {listingBadge(listingMode)}
        </div>
        <div className="absolute right-3 top-3 rounded-full bg-ink-900/75 px-2.5 py-1 text-[11px] font-semibold text-white">
          {status}
        </div>

        {hasMultiplePhotos ? (
          <>
            <button
              type="button"
              onClick={showPrevPhoto}
              className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/90 text-ink shadow-sm transition hover:bg-white"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={showNextPhoto}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/90 text-ink shadow-sm transition hover:bg-white"
              aria-label="Next photo"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPhotoIndex(i)}
                  className={cn(
                    'h-1.5 w-1.5 rounded-full transition',
                    i === photoIndex ? 'bg-white' : 'bg-white/50',
                  )}
                  aria-label={`Photo ${i + 1}`}
                />
              ))}
            </div>
            <span className="absolute bottom-3 right-3 rounded-full bg-ink-900/70 px-2 py-0.5 text-[10px] font-medium text-white">
              {photoIndex + 1} / {images.length}
            </span>
          </>
        ) : null}
      </div>

      <div className="space-y-3 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{type || 'Type'}</p>
          <h3 className="line-clamp-2 font-display text-lg font-semibold text-ink">{displayTitle}</h3>
        </div>

        <p className="flex items-start gap-1.5 text-sm text-ink-500">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.6} aria-hidden />
          <span className="line-clamp-2">
            {location}
            {address || buildingName ? (
              <span className="block text-xs text-ink-400">Street address is not shown on the public listing</span>
            ) : null}
          </span>
        </p>

        {description?.trim() ? (
          <ExpandableDescription
            text={description}
            className="text-sm"
            collapsedMaxChars={180}
            fadeFromClassName="from-white"
          />
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {loadFree ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary">
              <Zap className="h-3 w-3" /> Load-shedding free
            </span>
          ) : null}
          {premium ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-semibold text-accent">
              Premium tier
            </span>
          ) : null}
          {grading ? (
            <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-semibold text-ink-600">
              Grade {grading}
            </span>
          ) : null}
          {solarCapacityKw > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-semibold text-ink-600">
              <Sun className="h-3 w-3" /> {solarCapacityKw} kW
            </span>
          ) : null}
          {hasBorehole ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-semibold text-ink-600">
              <Droplets className="h-3 w-3" /> Borehole
            </span>
          ) : null}
          {instantBook ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              Instant book
            </span>
          ) : null}
        </div>

        <p className="tabular text-lg font-bold text-ink">{priceLine}</p>
        {entryFees != null && listingMode !== 'sale' ? (
          <p className="tabular text-xs text-ink-500">
            {depositHint?.trim() || `${formatZAR(entryFees)} to move in (rent + deposit)`}
          </p>
        ) : null}
        {minStayDays != null && minStayDays > 0 && listingMode !== 'sale' ? (
          <p className="text-xs text-ink-500">Minimum stay: {minStayDays} days</p>
        ) : null}

        {highlightFeatures.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Key features">
            {highlightFeatures.map((label) => {
              const Icon = featureByLabel(label)?.icon
              return (
                <li
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full border border-primary-100 bg-white px-2 py-0.5 text-[10px] font-medium text-ink-600"
                >
                  {Icon ? <Icon className="h-3 w-3 text-primary" aria-hidden /> : null}
                  {label}
                </li>
              )
            })}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-primary-100 pt-3 text-xs text-ink-500">
          {(beds ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-1">
              <BedDouble className="h-3.5 w-3.5" /> {beds} bed{beds === 1 ? '' : 's'}
            </span>
          ) : null}
          {(baths ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Bath className="h-3.5 w-3.5" /> {baths} bath{baths === 1 ? '' : 's'}
            </span>
          ) : null}
          {garages > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Car className="h-3.5 w-3.5" /> {garages} garage{garages === 1 ? '' : 's'}
            </span>
          ) : null}
          {(parking ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Car className="h-3.5 w-3.5" /> {parking} parking
            </span>
          ) : null}
          {(area ?? 0) > 0 ? (
            <span className="ml-auto tabular">{area!.toLocaleString()} m²</span>
          ) : null}
        </div>

        <p className="rounded-lg border border-primary-100 bg-primary-50/50 px-3 py-2 text-xs text-ink-500">
          Live preview — how this listing may appear when published.
        </p>
      </div>
    </div>
  )
}
