import { Link } from 'react-router-dom'
import { Bath, BedDouble, Car, Droplets, Heart, MapPin, Star, Sun, Zap } from 'lucide-react'
import { formatZAR } from '../data/seed'
import type { PropertyAsset } from '../types/domain'
import { featureByLabel } from '../lib/propertyFeatures'
import { cn } from './ui'
import {
  isLoadSheddingFree,
  isPremiumTier,
  resolveTotalEntryFees,
  type UnitCardPayload,
} from '../lib/api/unitsApi'
import type { Building, Unit } from '../data/infrastructure'
import { useAuth } from '../context/AuthContext'
import { useWishlist } from '../hooks/useWishlist'
import { canonicalListingId } from '../lib/listingIds'

export function PropertyCard({
  property,
  building,
  unit,
  card,
  className,
}: {
  property: PropertyAsset
  building?: Building
  unit?: Unit
  /** Prefer pre-built API card payload when available */
  card?: UnitCardPayload
  className?: string
}) {
  const { user, isAuthenticated } = useAuth()
  const { saved, toggle } = useWishlist(isAuthenticated ? user.id : 'guest')
  const wishlisted = saved(property.id)

  const loadFree =
    card?.is_load_shedding_free ??
    (building
      ? isLoadSheddingFree(building, property.amenities)
      : Boolean(property.solarCapacityKw && property.solarCapacityKw >= 3) ||
        property.amenities.some((a) => /generator|solar/i.test(a)))

  const premium =
    card?.is_premium_tier ??
    (building
      ? isPremiumTier(building)
      : property.grading === 'P' ||
        Boolean(property.solarCapacityKw && property.solarCapacityKw >= 20 && property.hasBorehole))

  const entryFees =
    card?.total_entry_fees ??
    (unit
      ? resolveTotalEntryFees(unit, property)
      : property.rent != null
        ? property.rent + property.rent * 2
        : property.price != null
          ? Math.round(property.price * 0.1)
          : null)

  const priceLabel = card?.display_metadata.primary_amount_label
    ? card.display_metadata.primary_amount_label
    : property.price
      ? formatZAR(property.price)
      : `${formatZAR(property.rent)} / month`

  const badge =
    property.listingMode === 'both' ? 'Sale or Rent' : property.listingMode === 'sale' ? 'For Sale' : 'To Rent'

  const href = `/listing/${canonicalListingId(card?.property_id ?? property.id)}`

  const image = card?.primary_image ?? property.images[0]
  const title = card?.title ?? property.title
  const suburb = card?.building.suburb ?? property.suburb
  const city = card?.building.city ?? property.city
  const beds = card?.bedrooms ?? property.beds
  const baths = card?.bathrooms ?? property.baths
  const parking = card?.parking ?? property.parking
  const area = card?.square_meters ?? property.area
  const featured = card?.featured ?? property.featured
  const grading = card?.building.grading ?? property.grading
  const solar = card?.building.solar_capacity_kw ?? property.solarCapacityKw ?? 0
  const borehole = card?.building.has_borehole ?? property.hasBorehole
  const highlightFeatures = property.amenities.slice(0, 3)

  return (
    <Link to={href} className={cn('group block animate-slide-up', className)}>
      <article className="overflow-hidden rounded-2xl bg-white transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(26,74,86,0.25)]">
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={image}
            alt=""
            width={400}
            height={300}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
          <div className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-sm">
            {badge}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              toggle(property.id)
            }}
            className="absolute right-3 top-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/95 text-ink shadow-sm transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
            aria-pressed={wishlisted}
          >
            <Heart className={cn('h-4 w-4', wishlisted && 'fill-accent text-accent')} />
          </button>
          {featured && (
            <div className="absolute bottom-3 left-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-white">
              Featured
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 font-semibold text-ink">{title}</h3>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-ink">
              <Star className="h-3.5 w-3.5 fill-accent text-accent" />
              4.{(property.id.charCodeAt(4) % 5) + 3}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm text-ink-500">
            <MapPin className="h-3.5 w-3.5" />
            {suburb}, {city}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {loadFree && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <Zap className="h-3 w-3" /> Load-shedding free
              </span>
            )}
            {premium && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-semibold text-accent">
                Premium tier
              </span>
            )}
            {grading && (
              <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-semibold text-ink-600">
                Grade {grading}
              </span>
            )}
            {solar > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-semibold text-ink-600">
                <Sun className="h-3 w-3" /> {solar} kW
              </span>
            )}
            {borehole && (
              <span className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-semibold text-ink-600">
                <Droplets className="h-3 w-3" /> Borehole
              </span>
            )}
          </div>

          <p className="mt-2 tabular text-lg font-bold text-ink">{priceLabel}</p>
          {entryFees != null && property.listingMode !== 'sale' && (
            <p className="tabular text-xs text-ink-500">
              {formatZAR(entryFees)} to move in (rent + deposit)
            </p>
          )}
          {highlightFeatures.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Key features">
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
          )}
          {card?.display_metadata.updated_relative && (
            <p className="mt-1 text-[11px] text-ink-400">{card.display_metadata.updated_relative}</p>
          )}
          <div className="mt-3 flex items-center gap-3 border-t border-primary-100 pt-3 text-xs text-ink-500">
            {beds > 0 && (
              <span className="inline-flex items-center gap-1">
                <BedDouble className="h-3.5 w-3.5" /> {beds} bed
              </span>
            )}
            {baths > 0 && (
              <span className="inline-flex items-center gap-1">
                <Bath className="h-3.5 w-3.5" /> {baths} bath
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Car className="h-3.5 w-3.5" /> {parking}
            </span>
            <span className="ml-auto tabular">{area.toLocaleString()} m²</span>
          </div>
        </div>
      </article>
    </Link>
  )
}
