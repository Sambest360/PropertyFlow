import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowDown } from 'lucide-react'
import { usePublicProperties, useStore } from '../../context/AppStore'
import { orderFeaturedListings } from '../../lib/marketplaceListings'
import { AreaSearch } from '../../components/AreaSearch'
import {
  areaToPlace,
  buildBrowseSearchUrl,
  haversineKm,
  nearestPlaces,
  type Place,
} from '../../lib/placeCatalog'
import {
  aggregateListingAreas,
  areaCount,
  nearestListingArea,
  popularAreasForMode,
  type ListingArea,
} from '../../lib/listingAreas'
import { fetchPublicMarketplaceAreas } from '../../lib/api/postgresClient'
import { usePrefersReducedMotion, useScrollProgress } from '../../hooks/useScrollMotion'
import { HomeBelowHero } from './HomeBelowHero'

/** Near me: how far to look for listings before suggesting a search instead. */
const NEAR_ME_MAX_KM = 50

import { usePageMeta } from '../../hooks/usePageMeta'

const HERO_LCP =
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1800&q=80'

export default function MarketHome() {
  const navigate = useNavigate()
  usePageMeta({
    title: 'Property to rent & buy, and property management in South Africa',
    description:
      'Lekaya Rentals: search homes, flats, rooms and shared accommodation to rent or buy across South Africa, book viewings and apply online. Agencies and landlords manage tenants, leases and rent in one place.',
    keywords: ['Lekaya Rentals', 'property management', 'rental property South Africa', 'homes to rent', 'property for sale'],
    path: '/',
    preloadImage: HERO_LCP,
  })
  const { state } = useStore()
  const properties = usePublicProperties()
  const [areas, setAreas] = useState<Place[]>([])
  const [mode, setMode] = useState<'buy' | 'rent'>('buy')
  const reduced = usePrefersReducedMotion()
  const heroRef = useRef<HTMLElement | null>(null)
  const progress = useScrollProgress(heroRef, reduced)

  const liveListings = useMemo(
    () => properties.filter((p) => !['Draft', 'Archived', 'Maintenance'].includes(p.status)),
    [properties],
  )
  const featured = orderFeaturedListings(properties)

  const goBrowse = (nextAreas: Place[], keyword = '') => {
    navigate(buildBrowseSearchUrl({ mode, areas: nextAreas, q: keyword || undefined }))
  }

  // Areas with published listings: the server count covers every listing; the
  // listings already loaded here are the fallback (API off, or it failed).
  const [serverAreas, setServerAreas] = useState<ListingArea[] | null>(null)
  const [serverAreasDone, setServerAreasDone] = useState(false)
  useEffect(() => {
    let cancelled = false
    void fetchPublicMarketplaceAreas().then((areas) => {
      if (cancelled) return
      setServerAreas(areas)
      setServerAreasDone(true)
    })
    return () => {
      cancelled = true
    }
  }, [])
  const clientAreas = useMemo(() => aggregateListingAreas(liveListings), [liveListings])
  const listingAreas = serverAreas?.length ? serverAreas : clientAreas
  const areasLoading = !listingAreas.length && (!serverAreasDone || !state.publicMarketplaceSettled)

  const popular = useMemo(() => popularAreasForMode(listingAreas, mode), [listingAreas, mode])

  /** Typeahead: only places with listings in this section, busiest first. */
  const { suggestionPlaces, countByPlaceId } = useMemo(() => {
    const counts = new Map<string, number>()
    const placesOut: Place[] = []
    const ranked = listingAreas
      .filter((a) => areaCount(a, mode) > 0)
      .sort((a, b) => areaCount(b, mode) - areaCount(a, mode) || a.label.localeCompare(b.label))
    for (const area of ranked) {
      const place = areaToPlace(area)
      if (counts.has(place.id)) continue
      counts.set(place.id, areaCount(area, mode))
      placesOut.push(place)
    }
    return { suggestionPlaces: placesOut, countByPlaceId: counts }
  }, [listingAreas, mode])

  const sectionNoun = mode === 'rent' ? 'rentals' : 'homes for sale'

  const nearMe = useCallback(
    (pos: { lat: number; lng: number }): string | null => {
      const withCoords = listingAreas.some((a) => a.lat != null && a.lng != null)
      if (withCoords) {
        if (!nearestListingArea(listingAreas, pos, mode, NEAR_ME_MAX_KM, haversineKm)) {
          return `No ${sectionNoun} within ${NEAR_ME_MAX_KM} km of you yet. Try a suburb or one of the popular areas.`
        }
        const params = new URLSearchParams({
          mode,
          near: `${pos.lat.toFixed(4)},${pos.lng.toFixed(4)}`,
          nearLabel: 'your location',
        })
        navigate(`/browse?${params.toString()}`)
        return null
      }
      // Listings without map pins: fall back to the nearest known suburbs.
      const nearby = nearestPlaces(pos.lat, pos.lng, { limit: 4, maxKm: 25 })
      if (!nearby.length) return `No ${sectionNoun} near your location yet. Try searching a suburb.`
      navigate(buildBrowseSearchUrl({ mode, areas: nearby }))
      return null
    },
    [listingAreas, mode, navigate, sectionNoun],
  )

  const parallaxY = reduced ? 0 : progress * 120
  const contentFade = reduced ? 1 : Math.max(0, 1 - progress * 1.35)
  const contentLift = reduced ? 0 : progress * 48

  const scrollToStory = () => {
    document.getElementById('home-story')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })
  }


  return (
    <div className="overflow-x-hidden bg-white">
      <section
        ref={heroRef}
        className="relative isolate flex min-h-[calc(100dvh-4rem)] flex-col overflow-hidden"
      >
        <div
          className="absolute inset-0 -z-20 max-w-[100vw] bg-cover bg-center will-change-transform sm:scale-110"
          style={{
            backgroundImage: `url(${HERO_LCP})`,
            transform: `translate3d(0, ${parallaxY}px, 0)`,
          }}
          aria-hidden
        />
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/55 via-ink/40 to-ink/65"
          aria-hidden
        />

        <div
          className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 pb-24 pt-10 sm:px-6 lg:px-8"
          style={{
            opacity: contentFade,
            transform: `translate3d(0, ${contentLift}px, 0)`,
          }}
        >
          <p className="text-sm font-medium tracking-wide text-white/85">
            South Africa’s property marketplace
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-[1.12] text-white sm:text-5xl lg:text-[3.4rem]">
            Find a place to call home
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-white/90 sm:text-lg">
            Search homes for sale and to rent, then manage viewings, applications, and leases in one place.
          </p>

          <div
            className="mt-8 max-w-2xl rounded-2xl bg-white p-2 shadow-[0_24px_60px_-28px_rgba(15,39,68,0.55)] sm:rounded-3xl sm:p-2.5"
          >
            <div className="mb-2 flex gap-1" role="tablist" aria-label="Listing type">
              {(['buy', 'rent'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`min-h-11 cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                    mode === m ? 'bg-primary text-white' : 'text-ink-600 hover:bg-primary-50'
                  }`}
                >
                  {m === 'buy' ? 'For sale' : 'To rent'}
                </button>
              ))}
            </div>

            <AreaSearch
              value={areas}
              onChange={setAreas}
              onSubmit={({ areas: next, keyword }) => goBrowse(next, keyword)}
              submitLabel="Search"
              placeholder="Search suburbs or city…"
              places={suggestionPlaces.length ? suggestionPlaces : undefined}
              placeHint={(p) => {
                const n = countByPlaceId.get(p.id)
                return n ? `${n} listing${n === 1 ? '' : 's'}` : undefined
              }}
              onNearMe={nearMe}
            />
          </div>

          {popular.length > 0 ? (
            <div className="mt-5">
              <p className="mb-2.5 text-xs font-medium text-white/75">
                Popular areas {mode === 'rent' ? 'to rent' : 'for sale'}
              </p>
              <div className="flex flex-wrap gap-2">
                {popular.map((area) => {
                  const n = areaCount(area, mode)
                  return (
                    <Link
                      key={`${area.kind}-${area.label}`}
                      to={buildBrowseSearchUrl({ mode, areas: [areaToPlace(area)] })}
                      aria-label={`${area.label}, ${n} ${n === 1 ? 'listing' : 'listings'}`}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3.5 text-sm font-medium text-white backdrop-blur-sm transition-colors duration-200 hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      {area.label}
                      <span className="text-xs tabular text-white/70">{n}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ) : areasLoading ? (
            <div className="mt-5 flex flex-wrap gap-2" aria-hidden>
              {[88, 112, 76, 104].map((w) => (
                <span key={w} className="h-11 animate-pulse rounded-full bg-white/15" style={{ width: w }} />
              ))}
            </div>
          ) : null}
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center pb-6">
          <button
            type="button"
            onClick={scrollToStory}
            className="group inline-flex min-h-11 cursor-pointer flex-col items-center gap-1.5 rounded-full px-4 text-white/85 transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span className="text-xs font-medium tracking-wide">Scroll to explore</span>
            <ArrowDown className="h-4 w-4 animate-pf-bounce" aria-hidden />
          </button>
        </div>
      </section>

      <HomeBelowHero liveListings={liveListings} featured={featured} listingAreas={listingAreas} />
    </div>
  )
}
