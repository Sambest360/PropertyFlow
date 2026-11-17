/**
 * Home page below the hero, in reading order: browse by type and popular
 * searches, latest listings, "everything property" by audience (beside a real
 * listing photo), property by area (photo cards per city), the shared-record
 * pitch (problem and solution), one block per audience, about, how renting
 * works, pricing and FAQ, the calculators and a closing call. Sections
 * alternate white and tinted so the page reads as a sequence, not a stack.
 */
import { useMemo, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import {
  Building,
  Building2,
  Calculator,
  FileSignature,
  GraduationCap,
  Home,
  KeyRound,
  LandPlot,
  Landmark,
  Search,
  Store,
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
import { seoPath } from '../../lib/seoPages'
import type { ListingArea } from '../../lib/listingAreas'
import { MAINTENANCE_TIERS, PER_PROPERTY_BANDS, quote, rand } from '../../lib/publicPricing'

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

type Feature = { title: string; body: string; to: string; cta: string }

const DISCOVER: Record<'renting' | 'buying' | 'letting', { label: string; intro: string; items: Feature[] }> = {
  renting: {
    label: 'Renting',
    intro: 'Find a place, apply and move in without the paper chase.',
    items: [
      { title: 'Search by area or near you', body: 'Filter by price, bedrooms, pets, furnishing and load-shedding backup.', to: '/browse?mode=rent', cta: 'Find a rental' },
      { title: 'Rent a room', body: 'Shared houses show how many rooms are free. Apply for a room and the agency places you.', to: '/browse?mode=shared', cta: 'See rooms' },
      { title: 'Apply online', body: 'Upload your ID, payslips and bank statements once. Track every step of your application.', to: '/register', cta: 'Create an account' },
      { title: 'Sign the lease online', body: 'Leases are signed electronically under ECTA, then the deposit details and your proof of payment stay on file.', to: '/login', cta: 'Sign in' },
    ],
  },
  buying: {
    label: 'Buying',
    intro: 'Work out what you can afford before you fall in love with a house.',
    items: [
      { title: 'Homes for sale', body: 'Houses, apartments, land and farms listed by verified agencies and landlords.', to: '/browse?mode=buy', cta: 'Browse for sale' },
      { title: 'What can I afford?', body: 'See the bond you could qualify for from your income and expenses.', to: '/calculators/affordability', cta: 'Check affordability' },
      { title: 'Bond and transfer costs', body: 'Add up transfer duty, attorney and bond registration fees.', to: '/calculators/bond-transfer', cta: 'Work out costs' },
      { title: 'Commercial property', body: 'Offices, retail and industrial space for sale or to rent.', to: '/browse?mode=commercial', cta: 'See commercial' },
    ],
  },
  letting: {
    label: 'Letting your property',
    intro: 'For landlords and agencies: one record of every rental, from first viewing to deposit refund.',
    items: [
      { title: 'From listing to lease without paper', body: 'Advertise a vacancy, take viewing bookings, receive complete applications and sign the lease under ECTA.', to: '/register?role=landlord', cta: 'List your property' },
      { title: 'Inspections on record', body: 'The ingoing inspection sits in the same file as the signed lease, so move-out is a comparison, not an argument.', to: '/register?role=landlord', cta: 'Get started' },
      { title: 'Maintenance that runs itself', body: 'Tenants log a fault with photos. You assign a contractor, who quotes, does the job, uploads proof and invoices.', to: '/login', cta: 'Sign in' },
      { title: 'A ledger that knows whose money it is', body: 'Deposits, rent and contractor invoices recorded against the person they belong to. Your money stays in your trust account.', to: '/contact', cta: 'Book a walkthrough' },
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

const PROBLEMS: Array<[string, string]> = [
  ['The record is in five places.', 'The lease in one system, the deposit in another, inspection photos on a phone and the invoice in someone’s inbox.'],
  ['Audit season is a scramble.', 'You rebuild which trust money belongs to whom from bank statements and spreadsheets every year.'],
  ['Move-out turns into an argument.', 'The tenant says the stain was there, the landlord says it wasn’t, and the ingoing inspection can’t be found.'],
]

const SOLUTIONS: Array<{ title: string; body: string; detail: string; icon: Icon }> = [
  {
    title: 'A ledger that knows whose money it is',
    body: 'Each deposit, rent payment and contractor invoice is recorded against the tenant, landlord or contractor it belongs to. Your money stays in your trust account; Lekaya keeps the record.',
    detail: 'Every entry dated, linked to a lease, and never editable without a trace.',
    icon: Landmark,
  },
  {
    title: 'Maintenance that runs itself',
    body: 'Tenants log a fault with photos. You assign a contractor, who quotes, does the job, uploads proof and invoices against that property. The landlord sees it the same day.',
    detail: 'One ticket from report to paid invoice, visible to all four parties.',
    icon: Wrench,
  },
  {
    title: 'From listing to lease without paper',
    body: 'Advertise a vacancy, take viewing bookings, receive complete applications and sign the lease under ECTA. The tenant’s record starts the moment they sign.',
    detail: 'Application documents, signed lease and ingoing inspection in one file.',
    icon: FileSignature,
  },
]

const AUDIENCES: Array<{ who: string; body: string; to: string; cta: string; icon: Icon }> = [
  { who: 'Agencies', body: 'Run the whole rental lifecycle and the trust ledger from one screen, with an audit trail for every change.', to: '/contact', cta: 'Book a walkthrough', icon: Building2 },
  { who: 'Landlords', body: `See your property’s income, deposit, inspections and repairs as they happen, not in a monthly PDF. Self-managing? ${rand(PER_PROPERTY_BANDS[0].rate)} a property plus ${rand(MAINTENANCE_TIERS[0].fee)} maintenance a month, excl. VAT.`, to: '/register?role=landlord', cta: 'List your property', icon: KeyRound },
  { who: 'Tenants', body: 'Find a place, apply once, sign online, and keep your lease, deposit record and inspection report where you can always find them. Free.', to: '/browse?mode=rent', cta: 'Find a rental', icon: Home },
  { who: 'Contractors', body: 'Get jobs with photos and details up front, upload proof when you’re done, and see when your invoice is approved. Free.', to: '/register?role=contractor', cta: 'Join as a contractor', icon: Wrench },
]

const PRICE_EXAMPLES = [30, 150] as const

// PayProp import and POPIA/encryption answers left out until the founder confirms them (founder/landing-page.md).
const FAQ: Array<[string, string]> = [
  ['Does Lekaya hold or move our trust money?', 'No. Your money stays in your own trust account or with your payment provider. Lekaya records whose money each amount is, so you can see it at any time and show your auditor.'],
  ['Will my auditor accept Lekaya’s records?', 'Lekaya keeps a dated, permanent trail of every ledger entry and exports it for the annual trust audit.'],
  ['Do you take a percentage of rent?', 'No. Lekaya never holds or moves money and never takes a share of what you earn.'],
  ['Do tenants and contractors have to pay?', 'No, never.'],
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
  const pool = liveListings.length ? liveListings : featured

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
      .map(([name, g]) => ({
        name,
        ...g,
        suburbs: g.suburbs.sort((x, y) => y.total - x.total).slice(0, 6),
        photo: photoOf(pool.filter((p) => sameText(p.city, name))),
      }))
      .sort((x, y) => y.total - x.total)
      .slice(0, 6)
  }, [listingAreas, pool])

  /** Searches people actually make, from what is listed now (busiest city first). */
  const popular = useMemo(() => {
    const top = byCity[0]?.name
    const out: Array<{ label: string; to: string }> = []
    if (top && top !== 'Other areas') {
      const slug = citySlug(top)
      out.push({ label: `Property to rent in ${top}`, to: seoPath('rent', slug) })
      out.push({ label: `Rooms to rent in ${top}`, to: seoPath('rooms', slug) })
      out.push({ label: `Property for sale in ${top}`, to: seoPath('sale', slug) })
    }
    for (const g of byCity.slice(1, 4)) {
      if (g.name !== 'Other areas') out.push({ label: `To rent in ${g.name}`, to: seoPath('rent', citySlug(g.name)) })
    }
    out.push({ label: '2-bedroom rentals', to: buildBrowseSearchUrl({ mode: 'rent', beds: 2 }) })
    out.push({ label: 'Rentals under R8 000', to: buildBrowseSearchUrl({ mode: 'rent', maxPrice: 8000 }) })
    out.push({ label: 'Student accommodation', to: '/browse?mode=rent&type=Student%20Accommodation' })
    return out
  }, [byCity])

  const d = DISCOVER[discover]
  const discoverPhoto = useMemo(() => {
    const want = discover === 'buying' ? 'buy' : 'rent'
    const p = pool.find((x) => x.images?.[0] && matchesBrowseMode(x, want)) ?? pool.find((x) => x.images?.[0])
    return p ? { src: p.images[0], place: [p.suburb, p.city].filter(Boolean).join(', '), title: p.title } : null
  }, [discover, pool])

  return (
    <>
      <section id="home-story" className="relative z-10 -mt-1 overflow-x-clip border-b border-primary-100 bg-white">
        <div className={`${wrap} py-10 sm:py-12`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">Browse by type</h2>
            {liveListings.length ? (
              <p className="text-sm tabular-nums text-ink-500">
                {liveListings.length} listing{liveListings.length === 1 ? '' : 's'} live
                {byCity.length === 1 ? ` in ${byCity[0].name}` : byCity.length ? ` in ${byCity.length} cities` : ''}
              </p>
            ) : null}
          </div>
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
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-medium text-ink-500">Popular searches</span>
            {popular.map((q) => (
              <Link
                key={q.label}
                to={q.to}
                className="inline-flex min-h-9 items-center rounded-full border border-primary-100 px-3.5 text-sm text-ink-700 hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {q.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-primary-50/60 py-14 sm:py-16">
        <div className={wrap}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className={h2}>Latest listings</h2>
              <p className="mt-1 text-sm text-ink-500">Homes to rent, buy and share from agencies and landlords.</p>
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
        <div className={`${wrap} grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14`}>
          <div className="flex flex-col">
            <h2 className={h2}>Everything property, in one place</h2>
            <p className="mt-3 max-w-md text-base leading-relaxed text-ink-600">{d.intro}</p>
            <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="What are you here to do?">
              {(Object.keys(DISCOVER) as Array<keyof typeof DISCOVER>).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={discover === k} className={tabBtn(discover === k)} onClick={() => setDiscover(k)}>
                  {DISCOVER[k].label}
                </button>
              ))}
            </div>
            <figure className="relative mt-8 hidden min-h-[280px] flex-1 overflow-hidden rounded-3xl bg-primary lg:block">
              {discoverPhoto ? (
                <>
                  <Photo src={discoverPhoto.src} className="absolute inset-0 h-full w-full object-cover" />
                  <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-5 pb-4 pt-12 text-sm text-white">
                    <span className="block font-semibold">{discoverPhoto.title}</span>
                    {discoverPhoto.place ? <span className="text-white/80">{discoverPhoto.place}</span> : null}
                  </figcaption>
                </>
              ) : (
                <figcaption className="absolute inset-0 flex items-end p-6 font-display text-2xl font-semibold leading-snug text-white">
                  Every lease, inspection and repair on one record.
                </figcaption>
              )}
            </figure>
          </div>
          <ul className="divide-y divide-primary-100 border-y border-primary-100" role="tabpanel">
            {d.items.map((f) => (
              <li key={f.title} className="grid gap-2 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-8">
                <div>
                  <h3 className="text-lg font-semibold text-ink">{f.title}</h3>
                  <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink-500">{f.body}</p>
                </div>
                <Link
                  to={f.to}
                  className="inline-flex min-h-10 items-center justify-self-start whitespace-nowrap rounded-full border border-primary-200 px-4 text-sm font-semibold text-primary hover:border-primary hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {f.cta}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {byCity.length ? (
        <section className="bg-primary-50/60 py-14 sm:py-16">
          <div className={wrap}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className={h2}>Property by area</h2>
                <p className="mt-1 text-sm text-ink-500">Where our listings are right now.</p>
              </div>
              <Link to="/browse" className="text-sm font-semibold text-primary hover:underline">
                Search all areas
              </Link>
            </div>
            <div className={`mt-8 grid gap-5 ${byCity.length === 1 ? '' : byCity.length === 2 ? 'md:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
              {byCity.map((g) => {
                const wide = byCity.length === 1
                const cityUrl = g.city ? buildBrowseSearchUrl({ areas: [areaToPlace(g.city)] }) : '/browse'
                return (
                  <article key={g.name} className={`overflow-hidden rounded-2xl border border-primary-100 bg-white ${wide ? 'md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : ''}`}>
                    <Link
                      to={cityUrl}
                      className={`group relative block overflow-hidden bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${wide ? 'h-48 md:h-auto md:min-h-[220px]' : 'h-40'}`}
                    >
                      {g.photo ? <Photo src={g.photo} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" /> : null}
                      <span className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/20 to-transparent" aria-hidden />
                      <span className="absolute bottom-3 left-4 right-4 flex items-baseline justify-between gap-2 text-white">
                        <span className="font-display text-xl font-semibold">{g.name}</span>
                        <span className="text-sm tabular-nums text-white/85">
                          {g.total} listing{g.total === 1 ? '' : 's'}
                        </span>
                      </span>
                    </Link>
                    <div className={wide ? 'flex flex-col justify-center px-5 py-4 md:px-8 md:py-6' : 'px-4 py-3'}>
                      {wide ? <p className="mb-3 text-sm font-medium text-ink-500">Suburbs with listings</p> : null}
                      {g.suburbs.length ? (
                        <ul className={`grid gap-x-6 ${wide ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2'}`}>
                          {g.suburbs.map((a) => (
                            <li key={a.label}>
                              <Link
                                to={buildBrowseSearchUrl({ areas: [areaToPlace(a)] })}
                                className="flex min-h-9 items-center justify-between gap-2 text-sm text-ink-600 hover:text-primary"
                              >
                                <span className="truncate">{a.label}</span>
                                <span className="tabular-nums text-ink-400">{a.total}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {g.name !== 'Other areas' ? (
                        <div className="mt-2 flex gap-4 border-t border-primary-50 pt-3 text-sm font-semibold">
                          <Link to={seoPath('rent', citySlug(g.name))} className="text-primary hover:underline">To rent</Link>
                          <Link to={seoPath('sale', citySlug(g.name))} className="text-primary hover:underline">For sale</Link>
                          <Link to={seoPath('rooms', citySlug(g.name))} className="text-primary hover:underline">Rooms</Link>
                        </div>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      ) : null}

      <section className="bg-primary py-14 text-white sm:py-20">
        <div className={`${wrap} grid gap-10 lg:grid-cols-2 lg:gap-14`}>
          <div>
            <p className="text-sm font-medium text-white/75">For letting agencies, landlords, tenants and contractors</p>
            <h2 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">&ldquo;Whose deposit is this, and who paid the plumber?&rdquo;</h2>
            <ul className="mt-6 space-y-4 text-base leading-relaxed text-white/85">
              {PROBLEMS.map(([title, body]) => (
                <li key={title}>
                  <span className="font-semibold text-white">{title}</span> {body}
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/contact"
                className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-primary hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
              >
                Book a walkthrough
              </Link>
              <Link
                to="/register?role=landlord"
                className="inline-flex min-h-11 items-center rounded-full border border-white/40 px-5 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                List your property
              </Link>
            </div>
          </div>
          <div>
            <h3 className="font-display text-2xl font-semibold">Every party, every rand, every repair on one timeline</h3>
            <ul className="mt-6 divide-y divide-white/15 border-y border-white/15">
              {SOLUTIONS.map((f) => (
                <li key={f.title} className="flex gap-4 py-5">
                  <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-white/80" aria-hidden />
                  <div>
                    <h4 className="font-semibold">{f.title}</h4>
                    <p className="mt-1 text-sm leading-relaxed text-white/80">{f.body}</p>
                    <p className="mt-1.5 text-xs text-white/60">{f.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-20">
        <div className={wrap}>
          <h2 className={h2}>Built for four people</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-500">
            Each person sees only the properties and records they are part of. Tenants and contractors always use Lekaya free.
          </p>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCES.map((a) => (
              <li key={a.who} className="flex flex-col rounded-2xl border border-primary-100 bg-white p-5">
                <a.icon className="h-6 w-6 text-primary" aria-hidden />
                <h3 className="mt-3 text-lg font-semibold text-ink">{a.who}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-500">{a.body}</p>
                <Link
                  to={a.to}
                  className="mt-4 inline-flex min-h-10 items-center self-start whitespace-nowrap rounded-full border border-primary-200 px-4 text-sm font-semibold text-primary hover:border-primary hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {a.cta}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-primary-100 py-14 sm:py-16">
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
                shared accommodation, student housing, commercial property and land to rent or buy, from agencies and landlords.
              </p>
              <p>
                Tenants apply online, sign their lease electronically and keep their deposit, inspection and maintenance records in one tenant portal.
                Agencies, landlords and contractors work on the same record, from the first enquiry to the deposit refund. Lekaya records whose money
                each amount is; it never holds or moves your money.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-primary-100 bg-primary-50/60 py-14 sm:py-16">
        <div className={wrap}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className={h2}>How renting works on Lekaya</h2>
            <Link to="/register" className="text-sm font-semibold text-primary hover:underline">
              Create a free account
            </Link>
          </div>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative lg:pr-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white" aria-hidden>
                  {i + 1}
                </span>
                {i < STEPS.length - 1 ? <span className="absolute left-11 right-0 top-[18px] hidden h-px bg-primary-200 lg:block" aria-hidden /> : null}
                <h3 className="mt-3 font-semibold text-ink">{s.title}</h3>
                <p className="mt-1 text-sm text-ink-500">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-14 sm:py-20">
        <div className={`${wrap} grid gap-10 lg:grid-cols-2 lg:gap-14`}>
          <div>
            <h2 className={h2}>Pay per property. No share of your rent, ever.</h2>
            <p className="mt-2 text-base text-ink-600">
              {rand(PER_PROPERTY_BANDS[0].rate)} per property a month, plus one fixed maintenance fee for your size, from {rand(MAINTENANCE_TIERS[0].fee)}. Tenants and
              contractors use Lekaya free.
            </p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {PRICE_EXAMPLES.map((n) => {
                const q = quote(n)!
                return (
                  <li key={n} className="rounded-2xl border border-primary-100 p-5">
                    <h3 className="font-semibold text-ink">{n} properties</h3>
                    <p className="mt-1 font-display text-2xl font-semibold text-ink tabular-nums">{rand(q.monthlyTotal)} / month</p>
                    <p className="mt-2 text-sm leading-relaxed text-ink-500">{rand(q.effectivePerProperty, true)} per property, maintenance included.</p>
                  </li>
                )
              })}
            </ul>
            <p className="mt-4 text-sm text-ink-500">
              Excl. VAT. No per-user fees. Annual: pay 10 months, get 12.{' '}
              <Link to="/pricing" className="font-semibold text-primary hover:underline">
                See full pricing and work out yours
              </Link>
            </p>
          </div>
          <div>
            <h2 className={h2}>Questions</h2>
            <div className="mt-4 divide-y divide-primary-100 border-y border-primary-100">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-4">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    {q}
                    <span className="text-primary transition-transform group-open:rotate-45" aria-hidden>+</span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-primary-100 bg-primary-50/60 py-14 sm:py-16">
        <div className={`${wrap} grid gap-10 lg:grid-cols-[1fr_1.4fr]`}>
          <div>
            <h2 className={h2}>Property calculators</h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-500">Know the numbers before you make an offer or sign a bond.</p>
            <Link to="/calculators" className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">
              All calculators
            </Link>
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

      <section className="bg-primary py-14 text-white sm:py-16">
        <div className={`${wrap} flex flex-col gap-6 md:flex-row md:items-center md:justify-between`}>
          <div>
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">Your next audit and your next move-out, already on record</h2>
            <p className="mt-2 text-sm text-white/80">No share of your rent. No per-user fees. Lekaya never holds your money.</p>
          </div>
          <Link
            to="/contact"
            className="inline-flex min-h-11 shrink-0 items-center self-start rounded-full bg-white px-5 text-sm font-semibold text-primary hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary md:self-auto"
          >
            Book a walkthrough
          </Link>
        </div>
      </section>
    </>
  )
}

function sameText(a: string | null | undefined, b: string): boolean {
  return (a ?? '').trim().toLowerCase() === b.trim().toLowerCase()
}

function citySlug(name: string): string {
  return name.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** A listing photo that disappears (leaving the tinted panel) if it fails to load. */
function Photo({ src, className }: { src: string; className: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return <img src={src} alt="" className={className} loading="lazy" onError={() => setFailed(true)} />
}

function photoOf(list: PropertyAsset[]): string | null {
  return list.find((p) => p.images?.[0])?.images[0] ?? null
}
