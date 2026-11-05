/**
 * Home page below the hero: browse by type, latest listings, "everything
 * property" by audience, how renting works, property by area, calculators,
 * the agency/landlord pitch and a short about. Property24's home page is the
 * loose blueprint; the content is what Lekaya Rentals actually does.
 */
import { useMemo, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import {
  Building,
  Building2,
  Calculator,
  ClipboardCheck,
  FileSignature,
  GraduationCap,
  Home,
  KeyRound,
  LandPlot,
  Landmark,
  MessageSquareText,
  Search,
  ShieldCheck,
  Store,
  Upload,
  Users,
  Wrench,
} from 'lucide-react'
import type { PropertyAsset } from '../../types/domain'
import { useStore } from '../../context/AppStore'
import { PropertyCard } from '../../components/PropertyCard'
import { ListingCardGridSkeleton } from '../../components/loading/PageSkeleton'
import { matchesBrowseMode, isCommercialType } from '../../lib/browseMode'
import { isSharedAccommodation } from '../../lib/sharedAccommodation'
import { areaToPlace, buildBrowseSearchUrl } from '../../lib/placeCatalog'
import type { ListingArea } from '../../lib/listingAreas'

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

const wrap = 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'
const h2 = 'font-display text-2xl font-semibold text-ink sm:text-3xl'
const tabBtn = (on: boolean) =>
  `min-h-10 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    on ? 'bg-ink text-white' : 'bg-white text-ink-600 ring-1 ring-primary-100 hover:bg-primary-50'
  }`

type TypeTile = { label: string; icon: Icon; to: string; match: (p: PropertyAsset) => boolean }

const TYPE_TILES: TypeTile[] = [
  { label: 'Houses', icon: Home, to: '/browse?type=House', match: (p) => p.type === 'House' },
  { label: 'Apartments & flats', icon: Building2, to: '/browse?type=Apartment', match: (p) => p.type === 'Apartment' },
  { label: 'Townhouses', icon: Building, to: '/browse?type=Townhouse', match: (p) => p.type === 'Townhouse' },
  { label: 'Rooms & shared', icon: Users, to: '/browse?mode=shared', match: (p) => isSharedAccommodation(p.type) },
  { label: 'Student', icon: GraduationCap, to: '/browse?mode=rent&type=Student%20Accommodation', match: (p) => p.type === 'Student Accommodation' },
  { label: 'Commercial', icon: Store, to: '/browse?mode=commercial', match: (p) => isCommercialType(p.type) },
  { label: 'Land & farms', icon: LandPlot, to: '/browse?mode=buy&type=Vacant%20Land,Farm', match: (p) => p.type === 'Vacant Land' || p.type === 'Farm' },
  { label: 'All property', icon: Search, to: '/browse', match: () => true },
]

type Feature = { icon: Icon; title: string; body: string; to: string; cta: string }

const DISCOVER: Record<'renting' | 'buying' | 'letting', { label: string; intro: string; items: Feature[] }> = {
  renting: {
    label: 'Renting',
    intro: 'Find a place, apply and move in without the paper chase.',
    items: [
      { icon: Search, title: 'Search by area or near you', body: 'Filter by price, bedrooms, pets, furnishing and load-shedding backup.', to: '/browse?mode=rent', cta: 'Find a rental' },
      { icon: Users, title: 'Rent a room', body: 'Shared houses show how many rooms are free. Apply for a room and the agency places you.', to: '/browse?mode=shared', cta: 'See rooms' },
      { icon: Upload, title: 'Apply online', body: 'Upload your ID, payslips and bank statements once. Track every step of your application.', to: '/register', cta: 'Create an account' },
      { icon: FileSignature, title: 'Sign the lease online', body: 'Leases are signed electronically under ECTA, then the deposit details and your proof of payment stay on file.', to: '/login', cta: 'Sign in' },
    ],
  },
  buying: {
    label: 'Buying',
    intro: 'Work out what you can afford before you fall in love with a house.',
    items: [
      { icon: Home, title: 'Homes for sale', body: 'Houses, apartments, land and farms listed by verified agencies and landlords.', to: '/browse?mode=buy', cta: 'Browse for sale' },
      { icon: Calculator, title: 'What can I afford?', body: 'See the bond you could qualify for from your income and expenses.', to: '/calculators/affordability', cta: 'Check affordability' },
      { icon: Landmark, title: 'Bond and transfer costs', body: 'Add up transfer duty, attorney and bond registration fees.', to: '/calculators/bond-transfer', cta: 'Work out costs' },
      { icon: Store, title: 'Commercial property', body: 'Offices, retail and industrial space for sale or to rent.', to: '/browse?mode=commercial', cta: 'See commercial' },
    ],
  },
  letting: {
    label: 'Letting your property',
    intro: 'For landlords and agencies: one workspace from listing to move-out.',
    items: [
      { icon: ShieldCheck, title: 'List with checked quality', body: 'Every listing is reviewed by Lekaya Rentals before it goes live, so tenants trust what they see.', to: '/register?role=landlord', cta: 'List your property' },
      { icon: ClipboardCheck, title: 'Applications and leases', body: 'Review documents, approve with a reason, send ECTA leases and deposit details, and record the move-in inspection.', to: '/register?role=landlord', cta: 'Get started' },
      { icon: Wrench, title: 'Maintenance and contractors', body: 'Tenants log faults; you assign contractors and follow every job to done.', to: '/login', cta: 'Sign in' },
      { icon: MessageSquareText, title: 'Rent, trust and reports', body: 'Rent roll, arrears, trust accounting and owner statements in one place.', to: '/contact', cta: 'Talk to us' },
    ],
  },
}

const STEPS = [
  { title: 'Search', body: 'Pick an area, budget and type of home.' },
  { title: 'Book a viewing', body: 'Choose an open viewing time that suits you.' },
  { title: 'Apply online', body: 'Send your documents once and follow your application.' },
  { title: 'Sign and pay the deposit', body: 'Sign the lease online and upload proof of the deposit.' },
  { title: 'Move in', body: 'Check the condition report together and collect your keys.' },
]

const CALCULATORS = [
  { title: 'Bond repayments', body: 'Monthly repayment on a home loan.', to: '/calculators/mortgage-bond' },
  { title: 'Affordability', body: 'How much you could borrow.', to: '/calculators/affordability' },
  { title: 'Extra payments', body: 'Time and interest saved by paying more.', to: '/calculators/additional-payment' },
  { title: 'Bond and transfer costs', body: 'Once-off costs when you buy.', to: '/calculators/bond-transfer' },
]

export function HomeBelowHero({
  liveListings,
  featured,
  listingAreas,
}: {
  liveListings: PropertyAsset[]
  featured: PropertyAsset[]
  listingAreas: ListingArea[]
}) {
  const { state } = useStore()
  const [listTab, setListTab] = useState<'rent' | 'buy' | 'shared'>('rent')
  const [discover, setDiscover] = useState<keyof typeof DISCOVER>('renting')

  const typeCounts = useMemo(() => TYPE_TILES.map((t) => liveListings.filter(t.match).length), [liveListings])
  const tabListings = useMemo(() => featured.filter((p) => matchesBrowseMode(p, listTab)).slice(0, 8), [featured, listTab])
  const loading = featured.length === 0 && !state.publicMarketplaceFetchFailed && (state.marketplaceRefreshing || !state.publicMarketplaceSettled)

  /** Suburbs grouped under their city, busiest cities first (P24-style area lists). */
  const byCity = useMemo(() => {
    const groups = new Map<string, { city: ListingArea | null; suburbs: ListingArea[]; total: number }>()
    for (const a of listingAreas) {
      const key = (a.kind === 'city' ? a.label : a.city) || 'Other areas'
      const g = groups.get(key) ?? { city: null, suburbs: [], total: 0 }
      if (a.kind === 'city') {
        g.city = a
        g.total = Math.max(g.total, a.total)
      } else {
        g.suburbs.push(a)
        if (!g.city) g.total += a.total
      }
      groups.set(key, g)
    }
    return [...groups.entries()]
      .map(([name, g]) => ({ name, ...g, suburbs: g.suburbs.sort((x, y) => y.total - x.total).slice(0, 8) }))
      .sort((x, y) => y.total - x.total)
      .slice(0, 6)
  }, [listingAreas])

  const d = DISCOVER[discover]

  return (
    <>
      <section id="home-story" className="relative z-10 -mt-1 overflow-x-clip border-b border-primary-100 bg-white">
        <div className={`${wrap} py-10 sm:py-12`}>
          <h2 className="text-lg font-semibold text-ink">Browse by type</h2>
          <ul className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-primary-100 bg-primary-100 sm:grid-cols-4 lg:grid-cols-8">
            {TYPE_TILES.map((t, i) => (
              <li key={t.label} className="bg-white">
                <Link
                  to={t.to}
                  className="flex h-full flex-col gap-2 px-4 py-4 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <t.icon className="h-6 w-6 text-primary" aria-hidden />
                  <span className="text-sm font-semibold text-ink">{t.label}</span>
                  <span className="text-xs tabular-nums text-ink-500">
                    {typeCounts[i] ? `${typeCounts[i]} listing${typeCounts[i] === 1 ? '' : 's'}` : 'See listings'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-primary-50/60 py-14 sm:py-16">
        <div className={wrap}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className={h2}>Latest listings</h2>
              <p className="mt-1 text-sm text-ink-500">Checked by our team before they went live.</p>
            </div>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Listing type">
              {(
                [
                  ['rent', 'To rent'],
                  ['buy', 'For sale'],
                  ['shared', 'Rooms'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={listTab === k} className={tabBtn(listTab === k)} onClick={() => setListTab(k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6">
            {loading ? (
              <ListingCardGridSkeleton count={4} label="Loading listings…" />
            ) : tabListings.length ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {tabListings.map((p) => (
                  <PropertyCard key={p.id} property={p} />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-white px-5 py-8 text-center text-sm text-ink-500">
                No listings here yet. <Link to="/browse" className="font-semibold text-primary hover:underline">Browse everything</Link> or check back soon.
              </p>
            )}
          </div>
          <div className="mt-6">
            <Link
              to={`/browse?mode=${listTab}`}
              className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              View all {listTab === 'buy' ? 'property for sale' : listTab === 'shared' ? 'rooms' : 'rentals'}
            </Link>
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-20">
        <div className={wrap}>
          <h2 className={h2}>Everything property, in one place</h2>
          <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="What are you here to do?">
            {(Object.keys(DISCOVER) as Array<keyof typeof DISCOVER>).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={discover === k} className={tabBtn(discover === k)} onClick={() => setDiscover(k)}>
                {DISCOVER[k].label}
              </button>
            ))}
          </div>
          <p className="mt-4 max-w-2xl text-base text-ink-600">{d.intro}</p>
          <ul className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2">
            {d.items.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
                  <f.icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold text-ink">{f.title}</h3>
                  <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-500">{f.body}</p>
                  <Link to={f.to} className="mt-2 inline-flex min-h-9 items-center text-sm font-semibold text-primary hover:underline">
                    {f.cta}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-y border-primary-100 bg-white py-14 sm:py-16">
        <div className={wrap}>
          <h2 className={h2}>How renting works on Lekaya</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative lg:pr-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white" aria-hidden>
                  {i + 1}
                </span>
                {i < STEPS.length - 1 ? <span className="absolute left-11 right-0 top-[18px] hidden h-px bg-primary-100 lg:block" aria-hidden /> : null}
                <h3 className="mt-3 font-semibold text-ink">{s.title}</h3>
                <p className="mt-1 text-sm text-ink-500">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {byCity.length ? (
        <section className="py-14 sm:py-16">
          <div className={wrap}>
            <h2 className={h2}>Property by area</h2>
            <p className="mt-1 text-sm text-ink-500">Where our listings are right now.</p>
            <div className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {byCity.map((g) => (
                <div key={g.name}>
                  <h3 className="border-b border-primary-100 pb-2 font-semibold text-ink">
                    {g.city ? (
                      <Link to={buildBrowseSearchUrl({ areas: [areaToPlace(g.city)] })} className="hover:text-primary">
                        {g.name}
                      </Link>
                    ) : (
                      g.name
                    )}{' '}
                    <span className="text-sm font-normal tabular-nums text-ink-400">({g.total})</span>
                  </h3>
                  {g.suburbs.length ? (
                    <ul className="mt-2 columns-2 gap-4">
                      {g.suburbs.map((a) => (
                        <li key={a.label} className="break-inside-avoid">
                          <Link
                            to={buildBrowseSearchUrl({ areas: [areaToPlace(a)] })}
                            className="inline-flex min-h-9 items-center gap-1 text-sm text-ink-600 hover:text-primary"
                          >
                            {a.label} <span className="tabular-nums text-ink-400">{a.total}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="bg-primary-50/60 py-14 sm:py-16">
        <div className={`${wrap} grid gap-10 lg:grid-cols-[1fr_1.4fr]`}>
          <div>
            <h2 className={h2}>Property calculators</h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-500">Know the numbers before you make an offer or sign a bond.</p>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-2xl border border-primary-100 bg-primary-100 sm:grid-cols-2">
            {CALCULATORS.map((c) => (
              <li key={c.to} className="bg-white">
                <Link to={c.to} className="flex h-full gap-3 px-5 py-4 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                  <Calculator className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="block font-semibold text-ink">{c.title}</span>
                    <span className="block text-sm text-ink-500">{c.body}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-primary py-14 text-white sm:py-20">
        <div className={`${wrap} grid gap-10 lg:grid-cols-2 lg:items-center`}>
          <div>
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">Landlords and agencies: run your rentals here</h2>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-white/85">
              List properties, take enquiries and viewings, screen applicants, sign leases, collect deposits and rent, and handle maintenance. Your
              tenants get their own portal, so fewer calls and emails.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/register?role=landlord"
                className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-primary hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
              >
                List your property
              </Link>
              <Link
                to="/login"
                className="inline-flex min-h-11 items-center rounded-full border border-white/40 px-5 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Sign in
              </Link>
            </div>
          </div>
          <ul className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
            {[
              [KeyRound, 'Listings, viewings and enquiries'],
              [ClipboardCheck, 'Applications with document checks'],
              [FileSignature, 'ECTA e-signed lease agreements'],
              [Landmark, 'Deposits, rent and trust accounting'],
              [Wrench, 'Maintenance and contractor jobs'],
              [Users, 'Tenant and owner portals'],
            ].map(([I, label]) => {
              const IconC = I as Icon
              return (
                <li key={label as string} className="flex items-center gap-3 border-b border-white/15 pb-4">
                  <IconC className="h-5 w-5 shrink-0 text-white/80" aria-hidden />
                  <span className="font-medium">{label as string}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className={`${wrap} flex flex-col gap-8 md:flex-row md:items-center md:gap-12`}>
          {/* The logo is about 2.3 wide to 1 tall, so this width makes it as tall as the text beside it. */}
          <div className="w-full max-w-sm shrink-0 self-center md:max-w-none md:w-[48%]">
            <img src="/brand/lekaya-logo.svg" alt="Lekaya Rentals logo" width={1208} height={521} className="h-auto w-full" loading="lazy" />
          </div>
          <div className="max-w-2xl">
            <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">About Lekaya Rentals</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-600 sm:text-base">
              <p>
                Lekaya Rentals is a South African property website and rental management platform. Search houses, apartments, townhouses, rooms in
                shared accommodation, student housing, commercial property and land to rent or buy, from agencies and landlords whose listings our team
                checks before they go live.
              </p>
              <p>
                Tenants apply online, sign their lease electronically and keep their deposit, inspection and maintenance records in one tenant portal.
                Agencies and landlords use the same system to manage the whole rental, from the first enquiry to the move-out inspection.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
