import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { browseSortToApi } from '../../lib/browseSort'
import { useLocation, useSearchParams } from 'react-router-dom'
import { Filter, Heart, List, Map as MapIcon } from 'lucide-react'
import { usePublicProperties, useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { PropertyCard } from '../../components/PropertyCard'
import { PropertyMap } from '../../components/PropertyMap'
import { WishlistListView } from '../../components/wishlist/WishlistListView'
import { usePrefersReducedMotion } from '../../hooks/useScrollMotion'
import {
  BrowseFiltersBar,
  BrowseFiltersPanel,
  defaultBrowseFilters,
  type BrowseFilterState,
} from '../../components/BrowseFilters'
import type { PropertyAsset } from '../../types/domain'
import {
  propertyToUnitCard,
  searchUnitsFeed,
  type UnitCardPayload,
} from '../../lib/api/unitsApi'
import { blockedPropertyIdsForApplicant } from '../../lib/blockedApplicants'
import { canonicalListingId, listingIdAliases, unitIdForProperty } from '../../lib/listingIds'
import { useWishlist } from '../../hooks/useWishlist'
import { usePageMeta } from '../../hooks/usePageMeta'
import { FullScreenSheet } from '../../components/layout/mobile/FullScreenSheet'
import { DataRefreshBanner } from '../../components/loading/DataRefreshBanner'
import { ListingCardGridSkeleton } from '../../components/loading/PageSkeleton'
import { haversineKm, parseAreasParam, propertyMatchesAreas, searchPlaces } from '../../lib/placeCatalog'
import { geocodeAddress } from '../../lib/api/geocoding'
import { isLoadSheddingFreeListing } from '../../lib/loadShedding'
import { matchesBrowseMode } from '../../lib/browseMode'
import { toPublicListing } from '../../lib/publicLocation'

function listingAmount(p: PropertyAsset, mode: string): number | null {
  if (mode === 'rent') return p.rent
  if (mode === 'buy') return p.price
  return p.price ?? p.rent
}

function matchesFilters(
  p: PropertyAsset,
  q: string,
  mode: string,
  f: BrowseFilterState,
  areaPlaces: ReturnType<typeof parseAreasParam>,
): boolean {
  if (['Draft', 'Archived', 'Maintenance'].includes(p.status)) return false

  const matchQ =
    !q ||
    p.title.toLowerCase().includes(q.toLowerCase()) ||
    p.type.toLowerCase().includes(q.toLowerCase()) ||
    p.city.toLowerCase().includes(q.toLowerCase()) ||
    p.suburb.toLowerCase().includes(q.toLowerCase())

  if (!matchQ) return false

  // Buy / Rent / Commercial never overlap (src/lib/browseMode.ts).
  if (!matchesBrowseMode(p, mode)) return false

  if (f.types.length && !f.types.includes(p.type)) return false

  const amount = listingAmount(p, mode)
  const min = f.minPrice ? Number(f.minPrice) : null
  const max = f.maxPrice ? Number(f.maxPrice) : null
  if (min != null && (amount == null || amount < min)) return false
  if (max != null && (amount == null || amount > max)) return false

  if (f.beds != null && p.beds < f.beds) return false
  if (f.baths != null && p.baths < f.baths) return false
  if (f.parking != null && p.parking < f.parking) return false

  if (f.amenities.length && !f.amenities.every((a) => p.amenities.includes(a))) return false

  const grading = (p.grading as 'P' | 'A' | 'B' | 'C' | null) ?? null
  if (f.grading.length && (!grading || !f.grading.includes(grading))) return false
  if (f.minSolarKw && (p.solarCapacityKw ?? 0) < Number(f.minSolarKw)) return false
  if (f.hasBorehole && !p.hasBorehole) return false

  const loadFree = isLoadSheddingFreeListing(p.amenities)
  if (f.loadSheddingFree && !loadFree) return false

  const premium =
    p.grading === 'P' || Boolean(p.solarCapacityKw && p.solarCapacityKw >= 20 && p.hasBorehole)
  if (f.premiumTier && !premium) return false

  if (areaPlaces.length && !propertyMatchesAreas(p, areaPlaces)) return false

  return true
}

function sortProperties(list: PropertyAsset[], sort: BrowseFilterState['sort'], mode: string) {
  const next = [...list]
  next.sort((a, b) => {
    if (sort === 'price-asc' || sort === 'price-desc') {
      const av = listingAmount(a, mode) ?? Number.POSITIVE_INFINITY
      const bv = listingAmount(b, mode) ?? Number.POSITIVE_INFINITY
      return sort === 'price-asc' ? av - bv : bv - av
    }
    if (sort === 'beds-desc') return b.beds - a.beds
    if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt)
    if (a.featured !== b.featured) return a.featured ? -1 : 1
    return b.createdAt.localeCompare(a.createdAt)
  })
  return next
}

function browsePageHeading(mode: string, q: string, savedOnly: boolean): string {
  if (savedOnly) return 'Saved homes'
  if (q) return `Results for “${q}”`
  if (mode === 'rent') return 'Browse rental properties'
  if (mode === 'buy') return 'Browse properties for sale'
  if (mode === 'commercial') return 'Browse commercial properties'
  return 'Browse properties'
}

function cardMatchesBrowseMode(
  card: UnitCardPayload,
  mode: string,
  properties: readonly PropertyAsset[],
  storeProperties: readonly PropertyAsset[],
): boolean {
  if (mode === 'all') return true
  const property =
    properties.find((p) => p.id === card.property_id || p.unitId === card.id) ??
    storeProperties.find((p) => p.id === card.property_id)
  if (!property) return mode !== 'commercial'
  return matchesBrowseMode(property, mode)
}

/** Listings per set on the browse grid; Show more adds another set. */
export const BROWSE_PAGE_SIZE = 12

export default function BrowsePage() {
  const publicProperties = usePublicProperties()
  const { state, refreshMarketplaceListings } = useStore()
  const marketplaceRetryAttempt = useRef(0)

  useEffect(() => {
    if (!state.publicMarketplaceFetchFailed) {
      marketplaceRetryAttempt.current = 0
      return
    }
    const delays = [2000, 5000, 15000]
    const attempt = marketplaceRetryAttempt.current
    const delay = delays[Math.min(attempt, delays.length - 1)]
    marketplaceRetryAttempt.current = attempt + 1
    const t = window.setTimeout(() => {
      void refreshMarketplaceListings({ force: true })
    }, delay)
    return () => window.clearTimeout(t)
  }, [state.publicMarketplaceFetchFailed, refreshMarketplaceListings])
  const { user, isAuthenticated } = useAuth()
  const location = useLocation()
  const savedOnly = location.pathname === '/saved' || location.pathname.endsWith('/saved')
  const { ids: wishlistIds } = useWishlist(isAuthenticated ? user.id : 'guest')
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  const mode = params.get('mode') ?? 'all'
  const areaPlaces = useMemo(() => parseAreasParam(params.get('areas')), [params])
  // Address search: a typed address (or ?near=lat,lng) shows homes around that
  // spot, closest first, instead of only listings whose text matches.
  const [near, setNear] = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [radiusKm, setRadiusKm] = useState(5)
  useEffect(() => {
    const raw = params.get('near')
    if (raw) {
      const [lat, lng] = raw.split(',').map(Number)
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setNear({ lat, lng, label: params.get('nearLabel') || 'the selected address' })
        return
      }
    }
    const text = q.trim()
    const knownPlace = text && searchPlaces(text, 1)[0]?.label.toLowerCase() === text.toLowerCase()
    const looksLikeAddress = /\d/.test(text) || text.includes(',') || text.split(/\s+/).length >= 3
    if (!text || knownPlace || areaPlaces.length || !looksLikeAddress) {
      setNear(null)
      return
    }
    let cancelled = false
    void geocodeAddress({ address: text }).then((g) => {
      if (!cancelled && g.source !== 'mock') setNear({ lat: g.lat, lng: g.lng, label: g.formattedAddress || text })
    })
    return () => {
      cancelled = true
    }
  }, [params, q, areaPlaces.length])
  const textQ = near ? '' : q
  const [filters, setFilters] = useState<BrowseFilterState>(defaultBrowseFilters)
  const [panelOpen, setPanelOpen] = useState(false)
  const [showMap, setShowMap] = useState(!savedOnly)
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list')
  // Show a set of listings, then "Show more" adds the next set below.
  const [visibleCount, setVisibleCount] = useState(BROWSE_PAGE_SIZE)
  const [expandedWishlistId, setExpandedWishlistId] = useState<string | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  const browseTitle = browsePageHeading(mode, q, savedOnly)

  usePageMeta({
    title: browseTitle,
    description: savedOnly
      ? 'Your saved property wishlist on Lekaya.'
      : 'Filter buy, rent, and commercial listings by area, price, beds, and amenities across South Africa.',
    path: savedOnly ? '/saved' : '/browse',
  })

  const blockedIds = useMemo(() => {
    if (!isAuthenticated || user.id === 'guest') return new Set<string>()
    return blockedPropertyIdsForApplicant(state.applications, user)
  }, [isAuthenticated, state.applications, user])

  const properties = useMemo(() => {
    const base = publicProperties.filter((p) => !blockedIds.has(p.id))
    if (!savedOnly) return base
    const wish = new Set(wishlistIds)
    return base.filter((p) => wish.has(p.id))
  }, [publicProperties, blockedIds, savedOnly, wishlistIds])

  const visibleStoreProperties = useMemo(
    () => publicProperties.filter((p) => !blockedIds.has(p.id)),
    [publicProperties, blockedIds],
  )

  const filtered = useMemo(() => {
    const list = properties.filter((p) => matchesFilters(p, textQ, mode, filters, areaPlaces))
    return sortProperties(list, filters.sort, mode)
  }, [properties, textQ, mode, filters, areaPlaces])

  /** Prefer infra units feed when units exist — card-ready (all matches; the grid shows a set at a time). */
  const unitsFeed = useMemo(() => {
    if (savedOnly) return null
    if (mode === 'commercial') return null
    if (!state.units.length) return null
    return searchUnitsFeed({
      units: state.units,
      buildings: state.buildings,
      properties: visibleStoreProperties,
      users: state.users,
      filters: {
        q: textQ || undefined,
        area_places: areaPlaces.length ? areaPlaces : undefined,
        listing_type: mode === 'rent' ? 'rent' : mode === 'buy' ? 'sale' : 'all',
        marketplace_public: true,
        types: filters.types.length ? [...filters.types] : undefined,
        min_rent: mode === 'rent' && filters.minPrice ? Number(filters.minPrice) : undefined,
        max_rent: mode === 'rent' && filters.maxPrice ? Number(filters.maxPrice) : undefined,
        min_price: mode !== 'rent' && filters.minPrice ? Number(filters.minPrice) : undefined,
        max_price: mode !== 'rent' && filters.maxPrice ? Number(filters.maxPrice) : undefined,
        bedrooms_min: filters.beds ?? undefined,
        bathrooms_min: filters.baths ?? undefined,
        parking_min: filters.parking ?? undefined,
        amenities: filters.amenities.length ? filters.amenities : undefined,
        load_shedding_free: filters.loadSheddingFree || undefined,
        premium_tier: filters.premiumTier || undefined,
        has_borehole: filters.hasBorehole || undefined,
        min_solar_kw: filters.minSolarKw ? Number(filters.minSolarKw) : undefined,
        grading: filters.grading.length ? filters.grading : undefined,
        sort: browseSortToApi(filters.sort, mode),
        cursor: null,
        limit: 5000,
      },
    })
  }, [state.units, state.buildings, state.users, visibleStoreProperties, textQ, mode, filters, savedOnly, areaPlaces])

  const cards: UnitCardPayload[] = useMemo(() => {
    const raw =
      unitsFeed && unitsFeed.data.length > 0
        ? unitsFeed.data
        : filtered.map((p) => {
          const building = p.buildingId
            ? state.buildings.find((b) => b.id === p.buildingId)
            : undefined
          return propertyToUnitCard(p, building)
        })
    // P1-1 (E2E #2): one card per canonical listing ID — PR-x and its unt-x
    // alias (or any doubled prefix) must collapse to a single result.
    const seen = new Set<string>()
    return raw
      .filter((c) => !c.property_id || !blockedIds.has(c.property_id))
      .filter((c) => cardMatchesBrowseMode(c, mode, properties, state.properties))
      .filter((c) => {
        const key = canonicalListingId(c.property_id ?? c.id).toLowerCase()
        if (!key) return true
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }, [unitsFeed, filtered, state.buildings, state.properties, blockedIds, mode, properties])

  /** Cards near the searched address, closest first (radius widens until something is found). */
  const nearResult = useMemo(() => {
    if (!near) return null
    const withKm = cards
      .filter((c) => c.lat != null && c.lng != null)
      .map((c) => ({ c, km: haversineKm(near, { lat: c.lat!, lng: c.lng! }) }))
      .sort((a, b) => a.km - b.km)
    let used = radiusKm
    let hits = withKm.filter((x) => x.km <= used)
    for (const wider of [10, 25, 50]) {
      if (hits.length || wider <= used) continue
      used = wider
      hits = withKm.filter((x) => x.km <= used)
    }
    return { cards: hits.map((x) => x.c), radius: used, widened: used !== radiusKm }
  }, [near, cards, radiusKm])
  const listCards = nearResult ? nearResult.cards : cards

  // A new search starts again from the first set.
  useEffect(() => {
    setVisibleCount(BROWSE_PAGE_SIZE)
  }, [q, mode, filters, areaPlaces, savedOnly, near, radiusKm])
  const shownCards = listCards.slice(0, visibleCount)
  const moreToShow = listCards.length - shownCards.length

  const getCount = useCallback(
    (draft: BrowseFilterState) =>
      properties.filter((p) => matchesFilters(p, textQ, mode, draft, areaPlaces)).length,
    [properties, textQ, mode, areaPlaces],
  )

  const priceHint =
    mode === 'rent'
      ? 'Monthly rent in ZAR'
      : mode === 'buy'
        ? 'Sale price in ZAR'
        : 'Sale price or monthly rent in ZAR'

  const resolveCardProperty = useCallback(
    (c: UnitCardPayload) =>
      state.properties.find((p) => p.id === c.property_id) ??
      properties.find((p) => p.id === c.property_id || p.unitId === c.id),
    [state.properties, properties],
  )

  const mapProperties = useMemo(() => {
    return listCards.map((c) => resolveCardProperty(c)).filter(Boolean) as PropertyAsset[]
  }, [listCards, resolveCardProperty])

  const cardsByPropertyId = useMemo(() => {
    const map: Record<string, UnitCardPayload> = {}
    for (const c of cards) {
      const p = resolveCardProperty(c)
      if (!p) continue
      const keys = new Set<string>([
        ...listingIdAliases(p.id),
        ...listingIdAliases(c.property_id),
        ...listingIdAliases(c.id),
        unitIdForProperty(p.id),
      ])
      for (const key of keys) {
        if (key) map[key] = c
      }
    }
    return map
  }, [cards, resolveCardProperty])

  const wishlistProperties = useMemo(() => {
    if (!savedOnly) return [] as PropertyAsset[]
    return cards
      .map(
        (c) =>
          state.properties.find((p) => p.id === c.property_id) ??
          properties.find((p) => p.id === c.property_id || p.unitId === c.id),
      )
      .filter(Boolean) as PropertyAsset[]
  }, [savedOnly, cards, state.properties, properties])

  const toggleWishlistExpand = (property: PropertyAsset) => {
    setExpandedWishlistId((id) => (id === property.id ? null : property.id))
  }

  // Ghost cards until the first marketplace load finishes — a fresh visit to
  // /browse?mode=rent used to flash "No listings yet" for a few seconds.
  const showFullMarketplaceLoader =
    cards.length === 0 &&
    !state.publicMarketplaceFetchFailed &&
    (state.marketplaceRefreshing || !state.publicMarketplaceSettled)

  return (
    <div className="min-h-[70vh] bg-primary-50/60">
      <div className="border-b border-primary-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="font-display text-2xl font-semibold text-ink">
                {savedOnly ? 'Wishlist' : browseTitle}
              </h1>
              <p className="text-sm text-ink-500">
                {savedOnly
                  ? `${cards.length} saved home${cards.length === 1 ? '' : 's'}`
                  : moreToShow > 0
                    ? `Showing ${shownCards.length} of ${listCards.length} places`
                    : `${listCards.length} place${listCards.length === 1 ? '' : 's'}`}
              </p>
              {near && nearResult ? (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-600">
                  Homes within
                  <select
                    className="rounded-lg border border-primary-100 bg-white px-2 py-0.5 text-sm"
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(Number(e.target.value))}
                    aria-label="Distance"
                  >
                    {[2, 5, 10, 25, 50].map((km) => (
                      <option key={km} value={km}>
                        {km} km
                      </option>
                    ))}
                  </select>
                  of <span className="font-medium text-ink">{near.label}</span>, closest first
                  {nearResult.widened ? <span className="text-xs text-ink-500">(nothing closer, so we looked {nearResult.radius} km out)</span> : null}
                </p>
              ) : null}
              {savedOnly && cards.length === 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-500">
                  <Heart className="h-4 w-4 text-accent" /> Tap the heart on any listing to save it here.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-tip-target="browse-map"
                onClick={() => setShowMap((s) => !s)}
                className="hidden min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-primary-100 bg-white px-3.5 py-1.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:inline-flex"
              >
                <MapIcon className="h-3.5 w-3.5" />
                {showMap ? 'Hide map' : 'Show map'}
              </button>
              {!savedOnly && (
                <div
                  className="inline-flex rounded-full border border-primary-100 bg-white p-1 lg:hidden"
                  role="tablist"
                  aria-label="List or map view"
                >
                  {(
                    [
                      ['list', 'List', List],
                      ['map', 'Map', MapIcon],
                    ] as const
                  ).map(([id, label, Icon]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={mobileView === id}
                      onClick={() => setMobileView(id)}
                      className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        mobileView === id ? 'bg-primary text-white' : 'text-ink-500'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div data-tip-target="browse-filters">
            <BrowseFiltersBar
            filters={filters}
            onOpen={() => setPanelOpen(true)}
            onClear={() => {
              setFilters(defaultBrowseFilters())
            }}
            onRemoveType={(t) => setFilters((f) => ({ ...f, types: f.types.filter((x) => x !== t) }))}
            onRemoveAmenity={(a) =>
              setFilters((f) => ({ ...f, amenities: f.amenities.filter((x) => x !== a) }))
            }
            onClearPrice={() => setFilters((f) => ({ ...f, minPrice: '', maxPrice: '' }))}
            onClearBeds={() => setFilters((f) => ({ ...f, beds: null }))}
            onClearBaths={() => setFilters((f) => ({ ...f, baths: null }))}
            onClearParking={() => setFilters((f) => ({ ...f, parking: null }))}
            onClearSort={() => setFilters((f) => ({ ...f, sort: 'featured' }))}
            onClearUtility={() =>
              setFilters((f) => ({
                ...f,
                loadSheddingFree: false,
                premiumTier: false,
                hasBorehole: false,
                minSolarKw: '',
                grading: [],
              }))
            }
          />
          </div>
        </div>
      </div>

      <div className={`mx-auto grid max-w-7xl gap-0 lg:px-8 ${showMap ? 'lg:grid-cols-[1fr_380px]' : ''}`}>
        <div className={`p-4 sm:p-6 ${mobileView === 'map' ? 'hidden lg:block' : ''}`}>
          <DataRefreshBanner
            active={state.marketplaceRefreshing && cards.length > 0}
            label="Updating listings…"
          />
          {showFullMarketplaceLoader ? (
            <ListingCardGridSkeleton count={6} className={showMap ? 'lg:grid-cols-2 xl:grid-cols-2' : undefined} />
          ) : listCards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-primary-100 bg-white p-10 text-center">
              <Filter className="mx-auto h-8 w-8 text-ink-400" />
              <p className="mt-3 font-semibold">
                {state.publicMarketplaceFetchFailed ? 'Listings temporarily unavailable' : 'No listings yet'}
              </p>
              <p className="mt-1 text-sm text-ink-500">
                {state.publicMarketplaceFetchFailed
                  ? 'We could not load the public marketplace. Refresh the page in a moment, or try again later.'
                  : 'Agencies haven’t published homes here yet — check back soon, or clear filters if you’re searching.'}
              </p>
              {state.publicMarketplaceFetchFailed ? (
                <button
                  type="button"
                  onClick={() => {
                    marketplaceRetryAttempt.current = 0
                    void refreshMarketplaceListings({ force: true })
                  }}
                  className="mt-4 min-h-11 cursor-pointer rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Retry loading listings
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setFilters(defaultBrowseFilters())
                  }}
                  className="mt-4 min-h-11 cursor-pointer text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : savedOnly ? (
            <WishlistListView
              properties={wishlistProperties}
              expandedId={expandedWishlistId}
              onToggle={toggleWishlistExpand}
              reducedMotion={reducedMotion}
            />
          ) : (
            <>
              <div className={`grid gap-5 ${showMap ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
                {shownCards.map((card) => {
                  const property =
                    properties.find((p) => p.id === card.property_id || p.unitId === card.id) ??
                    state.properties.find((p) => p.id === card.property_id)
                  if (!property) return null
                  const building = state.buildings.find((b) => b.id === card.building.id)
                  const unit = state.units.find((u) => u.id === card.id)
                  return (
                    <PropertyCard
                      key={card.id}
                      property={property}
                      building={building}
                      unit={unit}
                      card={card}
                      browseMode={mode}
                    />
                  )
                })}
              </div>
              {moreToShow > 0 && (
                <div className="mt-8 flex flex-col items-center gap-2">
                  <p className="text-xs text-ink-500">
                    Showing {shownCards.length} of {listCards.length}
                  </p>
                  <button
                    type="button"
                    className="min-h-11 cursor-pointer rounded-full border border-primary-200 bg-white px-6 text-sm font-semibold text-primary shadow-sm transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => setVisibleCount((n) => n + BROWSE_PAGE_SIZE)}
                  >
                    Show more ({Math.min(moreToShow, BROWSE_PAGE_SIZE)})
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {showMap && (
          <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] border-l border-primary-100 bg-white p-4 lg:block">
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-primary-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Map view</p>
                  <p className="text-xs text-ink-500">
                    {mapProperties.length} {mapProperties.length === 1 ? 'listing' : 'listings'} on map
                  </p>
                </div>
              </div>
              <div className="min-h-0 flex-1 p-2">
                <PropertyMap
                  properties={(mapProperties.length ? mapProperties : filtered).map(toPublicListing)}
                  mode={mode}
                  className="h-full"
                  cardsByPropertyId={cardsByPropertyId}
                />
              </div>
            </div>
          </aside>
        )}
      </div>

      <FullScreenSheet
        open={!savedOnly && mobileView === 'map'}
        onClose={() => setMobileView('list')}
        title="Map view"
      >
        <div className="flex h-[calc(100dvh-4rem)] flex-col p-2">
          <p className="mb-2 px-2 text-xs text-ink-500">
            {mapProperties.length} {mapProperties.length === 1 ? 'listing' : 'listings'} on map
          </p>
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-primary-100">
            <PropertyMap
              properties={(mapProperties.length ? mapProperties : filtered).map(toPublicListing)}
              mode={mode}
              className="h-full"
              cardsByPropertyId={cardsByPropertyId}
            />
          </div>
        </div>
      </FullScreenSheet>

      <BrowseFiltersPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        value={filters}
        onApply={(next) => {
          setFilters(next)
        }}
        resultCount={getCount(filters)}
        getCount={getCount}
        priceHint={priceHint}
        mode={mode}
      />
    </div>
  )
}