import { Link } from 'react-router-dom'
import { Fragment, useMemo } from 'react'
import {
  ArrowRight,
  Bath,
  BedDouble,
  ChevronDown,
  HeartOff,
  MapPin,
} from 'lucide-react'
import { MediaImage } from '../media/MediaImage'
import { Badge, Button, cn } from '../ui'
import { formatZAR } from '../../data/seed'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/AppStore'
import { useWishlist } from '../../hooks/useWishlist'
import { usePrefersReducedMotion } from '../../hooks/useScrollMotion'
import { blockedPropertyIdsForApplicant } from '../../lib/blockedApplicants'
import { resolveUnitForProperty } from '../../lib/applicationApi'
import type { PropertyAsset } from '../../types/domain'

const ICON_STROKE = 1.6

function listingPriceLabel(p: PropertyAsset) {
  if (p.listingMode === 'sale' && p.price != null) return formatZAR(p.price)
  if (p.listingMode === 'rent' && p.rent != null) return `${formatZAR(p.rent)} / month`
  if (p.price != null && p.rent != null) return `${formatZAR(p.price)} · ${formatZAR(p.rent)}/mo`
  if (p.price != null) return formatZAR(p.price)
  if (p.rent != null) return `${formatZAR(p.rent)} / month`
  return '—'
}

function listingStatusLabel(p: PropertyAsset) {
  if (p.listingMode === 'both') return 'Sale or Rent'
  if (p.listingMode === 'sale') return 'For Sale'
  return 'To Rent'
}

function listingStatusTone(p: PropertyAsset): 'brand' | 'info' | 'neutral' {
  if (p.listingMode === 'sale') return 'brand'
  if (p.listingMode === 'rent') return 'info'
  return 'neutral'
}

function WishlistExpansion({
  property,
  canApply,
  reducedMotion,
  onRemove,
}: {
  property: PropertyAsset
  canApply: boolean
  reducedMotion?: boolean
  onRemove: () => void
}) {
  const listingHref = `/listing/${property.id}`
  const shortDescription =
    property.description.trim().length > 180
      ? `${property.description.trim().slice(0, 177).trimEnd()}…`
      : property.description.trim()

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <div className="min-w-0">
        <p className="font-display text-lg font-semibold tracking-tight text-ink">{property.title}</p>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-500">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
          <span>
            {property.address}
            <span className="text-ink-300"> · </span>
            {property.suburb}, {property.city}
          </span>
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-500">
          {property.beds > 0 && (
            <span className="inline-flex items-center gap-1">
              <BedDouble className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              <span className="tabular">{property.beds}</span> bed
            </span>
          )}
          {property.baths > 0 && (
            <span className="inline-flex items-center gap-1">
              <Bath className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              <span className="tabular">{property.baths}</span> bath
            </span>
          )}
        </div>
        {shortDescription ? (
          <p
            className={cn(
              'mt-3 text-sm leading-relaxed text-ink-600',
              !reducedMotion && 'transition-opacity duration-200',
            )}
          >
            {shortDescription}
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            Actions
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to={listingHref} className="inline-flex">
              <Button className="min-h-11 cursor-pointer gap-2 rounded-2xl">
                Open listing
                <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              </Button>
            </Link>
            {canApply ? (
              <Link to={listingHref} className="inline-flex">
                <Button variant="secondary" className="min-h-11 cursor-pointer rounded-2xl">
                  Apply
                </Button>
              </Link>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 cursor-pointer gap-2 rounded-2xl text-accent hover:bg-accent-50"
              onClick={onRemove}
            >
              <HeartOff className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Remove from wishlist
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function WishlistListView({
  properties,
  expandedId,
  onToggle,
  reducedMotion: reducedMotionProp,
}: {
  properties: PropertyAsset[]
  expandedId: string | null
  onToggle: (property: PropertyAsset) => void
  reducedMotion?: boolean
}) {
  const prefersReduced = usePrefersReducedMotion()
  const reducedMotion = reducedMotionProp ?? prefersReduced
  const { user, isAuthenticated } = useAuth()
  const { state } = useStore()
  const { toggle } = useWishlist(isAuthenticated ? user.id : 'guest')

  const blockedIds = useMemo(
    () => blockedPropertyIdsForApplicant(state.applications, user),
    [state.applications, user],
  )

  const canApplyFor = (p: PropertyAsset) => {
    const blocked = blockedIds.has(p.id)
    if (blocked) return false
    const unit = resolveUnitForProperty(p, state.units)
    if (unit && (unit.listingType === 'not_listed' || unit.statusKey === 'OCCUPIED')) return false
    return true
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] md:block">
        <div className="max-h-[min(78vh,56rem)] overflow-auto [scrollbar-width:thin]">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-[1] bg-white/95 backdrop-blur-md">
              <tr className="border-b border-primary-100 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                <th className="w-10 px-3 py-3" aria-hidden />
                <th className="px-4 py-3 font-semibold">Home</th>
                <th className="px-3 py-3 font-semibold">Price</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => {
                const expanded = expandedId === p.id
                return (
                  <Fragment key={p.id}>
                    <tr
                      className={cn(
                        'border-b border-primary-50',
                        expanded && 'border-b-0 bg-primary-100',
                      )}
                    >
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(p)}
                          aria-expanded={expanded}
                          aria-label={expanded ? 'Collapse listing details' : 'Expand listing details'}
                          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl text-ink-400 transition-colors duration-200 hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                              expanded && 'rotate-180',
                              reducedMotion && 'transition-none',
                            )}
                            strokeWidth={ICON_STROKE}
                            aria-hidden
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(p)}
                          className="group flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <MediaImage
                            src={p.images[0]}
                            alt=""
                            className={cn(
                              'shrink-0 rounded-lg object-cover ring-1 ring-primary-100 transition-[width,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                              expanded ? 'h-16 w-24' : 'h-12 w-16',
                              reducedMotion && 'transition-none',
                            )}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink group-hover:text-primary">
                              {p.title}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
                              <MapPin className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                              {p.suburb}, {p.city}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(p)}
                          className="w-full cursor-pointer text-left font-semibold tabular text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {listingPriceLabel(p)}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(p)}
                          className="cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Badge tone={listingStatusTone(p)}>{listingStatusLabel(p)}</Badge>
                        </button>
                      </td>
                    </tr>
                    <tr className={cn(!expanded && 'border-b border-primary-50')}>
                      <td colSpan={4} className="p-0">
                        <div
                          className={cn(
                            'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                            reducedMotion && 'transition-none',
                          )}
                        >
                          <div className="min-h-0 overflow-hidden">
                            <div
                              className={cn(
                                'border-b border-primary-100 bg-primary-50 px-4 py-4 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:px-5',
                                expanded
                                  ? 'translate-y-0 opacity-100'
                                  : 'pointer-events-none -translate-y-1 opacity-0',
                                reducedMotion && 'translate-y-0 transition-none',
                              )}
                              aria-hidden={!expanded}
                            >
                              <WishlistExpansion
                                property={p}
                                canApply={canApplyFor(p)}
                                reducedMotion={reducedMotion}
                                onRemove={() => toggle(p.id)}
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="space-y-2 md:hidden">
        {properties.map((p) => {
          const expanded = expandedId === p.id
          return (
            <li
              key={p.id}
              className={cn(
                'overflow-hidden rounded-[1.25rem] border shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)]',
                expanded
                  ? 'border-primary-100 bg-primary-100'
                  : 'border-primary-100/80 bg-white',
              )}
            >
              <button
                type="button"
                onClick={() => onToggle(p)}
                aria-expanded={expanded}
                className="flex w-full cursor-pointer gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <MediaImage
                  src={p.images[0]}
                  alt=""
                  className={cn(
                    'shrink-0 rounded-xl object-cover ring-1 ring-primary-100 transition-[width,height] duration-300',
                    expanded ? 'h-24 w-28' : 'h-20 w-24',
                    reducedMotion && 'transition-none',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start gap-2">
                    <p className="min-w-0 flex-1 truncate font-semibold text-ink">{p.title}</p>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-ink-400 transition-transform duration-300',
                        expanded && 'rotate-180',
                        reducedMotion && 'transition-none',
                      )}
                      strokeWidth={ICON_STROKE}
                      aria-hidden
                    />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {p.suburb}, {p.city}
                  </p>
                  <p className="mt-1.5 font-semibold tabular text-ink">{listingPriceLabel(p)}</p>
                  <div className="mt-2">
                    <Badge tone={listingStatusTone(p)}>{listingStatusLabel(p)}</Badge>
                  </div>
                </div>
              </button>
              <div
                className={cn(
                  'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                  reducedMotion && 'transition-none',
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="border-t border-primary-100/80 bg-primary-50 px-3 py-3">
                    <WishlistExpansion
                      property={p}
                      canApply={canApplyFor(p)}
                      reducedMotion={reducedMotion}
                      onRemove={() => toggle(p.id)}
                    />
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
