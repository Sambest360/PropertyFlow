import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { usePublicProperties, useStore } from '../../context/AppStore'
import { DataRefreshBanner } from '../../components/loading/DataRefreshBanner'
import { ListingCardGridSkeleton } from '../../components/loading/PageSkeleton'
import { orderFeaturedListings } from '../../lib/marketplaceListings'
import { PropertyCard } from '../../components/PropertyCard'
import { AreaSearch } from '../../components/AreaSearch'
import { cn } from '../../components/ui'
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
import {
  useElementTravel,
  useInView,
  usePrefersReducedMotion,
  useScrollProgress,
} from '../../hooks/useScrollMotion'

/** Near me: how far to look for listings before suggesting a search instead. */
const NEAR_ME_MAX_KM = 50

const storyImages = {
  listings: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80',
  search: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80',
  agency: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200&q=80',
}

function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode
  className?: string
  delayMs?: number
}) {
  const reduced = usePrefersReducedMotion()
  const { ref, inView } = useInView<HTMLDivElement>()

  return (
    <div
      ref={ref}
      className={cn('pf-reveal', inView && 'is-visible', reduced && 'is-visible', className)}
      style={reduced ? undefined : { transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  )
}

function StoryChapter({
  step,
  title,
  desc,
  image,
  imageAlt,
  to,
  cta,
  reverse = false,
}: {
  step: string
  title: string
  desc: string
  image: string
  imageAlt: string
  to: string
  cta: string
  reverse?: boolean
}) {
  const reduced = usePrefersReducedMotion()
  const { ref: travelRef, travel } = useElementTravel(reduced)
  const { ref: revealRef, inView } = useInView<HTMLElement>({
    threshold: 0.22,
    rootMargin: '0px 0px -12% 0px',
  })

  const setRefs = (node: HTMLElement | null) => {
    travelRef.current = node
    revealRef.current = node
  }

  const parallax = reduced ? 0 : (travel - 0.5) * 48
  const visible = inView || reduced

  return (
    <article
      ref={setRefs}
      className={cn('pf-story-chapter', visible && 'is-visible', reverse && 'is-reverse')}
    >
      <Link
        to={to}
        className="group grid cursor-pointer items-center gap-6 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 md:grid-cols-2 md:gap-10 lg:gap-14"
      >
        <div className={cn('pf-story-media relative overflow-hidden rounded-3xl', reverse && 'md:order-2')}>
          <div className="aspect-[4/3] overflow-hidden bg-primary-100 sm:aspect-[5/4]">
            <div
              className="h-[118%] w-full will-change-transform"
              style={{ transform: `translate3d(0, ${parallax}px, 0)` }}
            >
              <img
                src={image}
                alt={imageAlt}
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
                loading="lazy"
              />
            </div>
          </div>
          <span className="absolute bottom-4 left-4 rounded-full bg-ink/75 px-3 py-1 text-[11px] font-semibold tracking-wide text-white backdrop-blur-sm">
            {step}
          </span>
        </div>

        <div className={cn('pf-story-copy px-1', reverse && 'md:order-1')}>
          <h3 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{title}</h3>
          <p className="mt-3 max-w-md text-base leading-relaxed text-ink-500">{desc}</p>
          <span className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary transition-colors duration-200 group-hover:text-primary-700">
            {cta}
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
        </div>
      </Link>
    </article>
  )
}

import { usePageMeta } from '../../hooks/usePageMeta'

const HERO_LCP =
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1800&q=80'

export default function MarketHome() {
  const navigate = useNavigate()
  usePageMeta({
    title: 'Buy & rent property in South Africa',
    description:
      'Search homes for sale and rent across South Africa. Filter by area, price, and property type — then book viewings or apply online.',
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

  const chapters = [
    {
      step: '01 — Discover',
      title: `${liveListings.length}+ live listings`,
      desc: 'Browse houses, apartments, commercial space, and land across South Africa — with real pins on the map.',
      image: storyImages.listings,
      imageAlt: 'Modern South African home exterior',
      to: '/browse',
      cta: 'Browse listings',
      reverse: false,
    },
    {
      step: '02 — Choose',
      title: 'Buy or rent in one search',
      desc: 'Switch between for sale and to rent without losing your place. One search, two ways to move.',
      image: storyImages.search,
      imageAlt: 'Bright apartment living space',
      to: '/browse?mode=rent',
      cta: 'See rentals',
      reverse: true,
    },
    {
      step: '03 — Close',
      title: 'Handled with your agency',
      desc: 'Viewings, applications, documents, and leases stay organised with the agency — not left in email threads.',
      image: storyImages.agency,
      imageAlt: 'Keys handed over for a new home',
      to: '/workspace',
      cta: 'Open workspace',
      reverse: false,
    },
  ] as const

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

      <section id="home-story" className="relative z-10 -mt-1 overflow-x-clip bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Why Lekaya Rentals</p>
            <h2 className="mt-2 max-w-xl font-display text-2xl font-semibold text-ink sm:text-3xl">
              Search like a marketplace. Close like an agency.
            </h2>
          </Reveal>

          <div className="mt-12 flex flex-col gap-16 sm:mt-16 sm:gap-24 lg:gap-28">
            {chapters.map((chapter) => (
              <StoryChapter key={chapter.step} {...chapter} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-primary-50/70 py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mb-10 flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Featured homes</h2>
              <p className="mt-1 text-sm text-ink-500">Fresh listings across Port Elizabeth and the Eastern Cape</p>
            </div>
            <Link
              to="/browse"
              className="hidden min-h-11 cursor-pointer items-center text-sm font-semibold text-primary transition-colors duration-200 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:inline-flex"
            >
              View all
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </Link>
          </Reveal>

          <DataRefreshBanner
            active={state.marketplaceRefreshing && featured.length > 0}
            label="Updating listings…"
          />
          {featured.length === 0 && !state.publicMarketplaceFetchFailed && (state.marketplaceRefreshing || !state.publicMarketplaceSettled) ? (
            <ListingCardGridSkeleton count={8} label="Loading featured homes…" />
          ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {featured.slice(0, 8).map((p, i) => (
              <Reveal key={p.id} delayMs={Math.min(i, 5) * 70}>
                <PropertyCard property={p} />
              </Reveal>
            ))}
          </div>
          )}

          <Reveal className="mt-10 text-center sm:hidden">
            <Link
              to="/browse"
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              View all listings
            </Link>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-14 sm:px-6 md:grid-cols-2 lg:px-8 lg:py-20">
        <Reveal>
          <div className="h-full rounded-3xl bg-primary p-8 text-white sm:p-9">
            <h3 className="font-display text-2xl font-semibold">Looking for a home?</h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/85">
              Browse listings, book a viewing, and apply online when you’re ready.
            </p>
            <Link
              to="/browse"
              className="mt-6 inline-flex min-h-11 cursor-pointer items-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Start searching
            </Link>
          </div>
        </Reveal>
        <Reveal delayMs={100}>
          <div className="h-full rounded-3xl border border-primary-100 bg-white p-8 sm:p-9">
            <h3 className="font-display text-2xl font-semibold text-ink">Agency or property manager?</h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-500">
              Run leads, applications, documents, payments, and maintenance from one workspace.
            </p>
            <Link
              to="/workspace"
              className="mt-6 inline-flex min-h-11 cursor-pointer items-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              Open workspace
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  )
}
