import { useEffect, useState } from 'react'
import { Bath, BedDouble, Car, ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import type { PropertyAsset, AppUser } from '../../types/domain'
import { ExpandableDescription } from '../listing/ExpandableDescription'
import { PropertyFeaturesDisplay } from '../property-features/PropertyFeaturesDisplay'
import { Badge, cn } from '../ui'
import { formatZAR } from '../../data/seed'
import { useAgentDisplay } from '../../hooks/useAgentDisplay'
import { resolvePortfolioStatus } from '../../lib/propertyStatus'
import { ICON_STROKE } from './types'

export function PropertyOverviewPanel({
  property,
  occupancy,
  agent,
  landlord,
  roomCount,
  assetCount,
  appCount,
}: {
  property: PropertyAsset
  occupancy?: string | null
  agent?: AppUser
  landlord?: AppUser
  roomCount: number
  assetCount: number
  appCount: number
}) {
  const [photoIndex, setPhotoIndex] = useState(0)
  const { label: agentLabel } = useAgentDisplay()
  const resolved = resolvePortfolioStatus(property.status, occupancy)
  const photos = property.images.length ? property.images : []
  const current = photos[photoIndex] ?? null

  useEffect(() => {
    setPhotoIndex(0)
  }, [property.id])

  const prevPhoto = () => {
    if (photos.length < 2) return
    setPhotoIndex((i) => (i - 1 + photos.length) % photos.length)
  }
  const nextPhoto = () => {
    if (photos.length < 2) return
    setPhotoIndex((i) => (i + 1) % photos.length)
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="relative aspect-[16/9] w-full">
            {current ? (
              <img src={current} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-ink-400">
                No photos yet
              </div>
            )}
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prevPhoto}
                  aria-label="Previous photo"
                  className="absolute left-3 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center bg-white/90 text-ink transition-colors duration-200 hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={nextPhoto}
                  aria-label="Next photo"
                  className="absolute right-3 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center bg-white/90 text-ink transition-colors duration-200 hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ChevronRight className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
                </button>
                <p className="absolute bottom-3 right-3 bg-ink/70 px-2.5 py-1 text-[11px] tabular text-white">
                  {photoIndex + 1} / {photos.length}
                </p>
              </>
            )}
          </div>
          {photos.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:thin]">
              {photos.map((src, i) => (
                <button
                  key={`${src}-${i}`}
                  type="button"
                  onClick={() => setPhotoIndex(i)}
                  aria-label={`Show photo ${i + 1}`}
                  aria-pressed={i === photoIndex}
                  className={cn(
                    'h-14 w-20 shrink-0 cursor-pointer overflow-hidden transition-opacity duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    i === photoIndex ? 'opacity-100' : 'opacity-50 hover:opacity-80',
                  )}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section>
            <h2 className="font-semibold text-ink">About</h2>
            <ExpandableDescription
              text={property.description}
              className="mt-2"
              containExpandedScroll
              expandedMaxHeightClass="max-h-[min(18rem,40vh)]"
            />
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                Features
              </h3>
              <PropertyFeaturesDisplay amenities={property.amenities} compact />
            </div>
          </section>

          <section>
            <p className="tabular text-2xl font-bold text-ink">
              {property.listingMode === 'rent' || (property.listingMode === 'both' && !property.price)
                ? (
                    <>
                      {formatZAR(property.rent)}
                      <span className="text-base font-medium text-ink-500"> / mo</span>
                    </>
                  )
                : formatZAR(property.price)}
            </p>
            {property.listingMode === 'both' && property.price != null && property.rent != null && (
              <p className="mt-1 tabular text-sm font-medium text-ink-500">
                or {formatZAR(property.rent)} / mo to rent
              </p>
            )}
            <Badge className="mt-2" tone={resolved.tone}>
              {resolved.label}
            </Badge>
            <div className="mt-4 space-y-2 text-sm text-ink-600">
              <p className="flex flex-wrap items-center gap-2">
                <BedDouble className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                <span className="tabular">{property.beds}</span> beds ·{' '}
                <Bath className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                <span className="tabular">{property.baths}</span> baths
                {(property.garages ?? 0) > 0 ? (
                  <>
                    {' · '}
                    <Car className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                    <span className="tabular">{property.garages}</span> garages
                  </>
                ) : null}
                {' · '}
                <Car className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                <span className="tabular">{property.parking}</span> parking
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                {property.formattedAddress ?? property.address}
              </p>
              {agentLabel(property.agentId, agent?.name, '—') ? (
                <p>
                  Agent: <strong>{agentLabel(property.agentId, agent?.name, '—')}</strong>
                </p>
              ) : null}
              <p>
                Landlord: <strong>{landlord?.name ?? '—'}</strong>
              </p>
            </div>
          </section>
        </div>
      </div>

      <section className="grid grid-cols-3 gap-2 border-t border-primary-100 pt-6 text-center">
        <div>
          <p className="tabular text-xl font-semibold sm:text-2xl">{roomCount}</p>
          <p className="text-[11px] text-ink-500">Rooms</p>
        </div>
        <div>
          <p className="tabular text-xl font-semibold sm:text-2xl">{assetCount}</p>
          <p className="text-[11px] text-ink-500">Assets</p>
        </div>
        <div>
          <p className="tabular text-xl font-semibold sm:text-2xl">{appCount}</p>
          <p className="text-[11px] text-ink-500">Apps</p>
        </div>
      </section>
    </div>
  )
}
