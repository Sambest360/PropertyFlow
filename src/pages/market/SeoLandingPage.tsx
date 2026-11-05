/**
 * Area landing pages for search engines and visitors: /to-rent/:city,
 * /for-sale/:city and /rooms-to-rent/:city. Real listings for the city,
 * a short intro, questions and answers, and links to nearby cities.
 */
import { useMemo } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { usePublicProperties, useStore } from '../../context/AppStore'
import { PropertyCard } from '../../components/PropertyCard'
import { ListingCardGridSkeleton } from '../../components/loading/PageSkeleton'
import { usePageMeta } from '../../hooks/usePageMeta'
import { matchesBrowseMode } from '../../lib/browseMode'
import {
  SEO_KIND_MODE,
  listingInCity,
  seoCity,
  seoPlace,
  seoLandingFaq,
  seoLandingMeta,
  seoPath,
  type SeoKind,
} from '../../lib/seoPages'

const KIND_LABEL: Record<SeoKind, string> = { rent: 'To rent', sale: 'For sale', rooms: 'Rooms' }

export default function SeoLandingPage({ kind }: { kind: SeoKind }) {
  const { city: slug } = useParams()
  const city = seoPlace(slug)
  const { state } = useStore()
  const properties = usePublicProperties()
  const meta = city ? seoLandingMeta(kind, city) : null
  const faq = city ? seoLandingFaq(kind, city) : []
  const mode = SEO_KIND_MODE[kind]

  const listings = useMemo(
    () =>
      city
        ? properties.filter((p) => !['Draft', 'Archived', 'Maintenance'].includes(p.status) && matchesBrowseMode(p, mode) && listingInCity(p, city))
        : [],
    [properties, city, mode],
  )

  usePageMeta({
    title: meta?.title ?? 'Area not found',
    description: meta?.description,
    path: meta?.path,
    keywords: meta?.keywords,
    jsonLd: city
      ? {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://lekayarentals.site/' },
                { '@type': 'ListItem', position: 2, name: meta!.h1, item: `https://lekayarentals.site${meta!.path}` },
              ],
            },
            {
              '@type': 'FAQPage',
              mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
            },
          ],
        }
      : null,
  })

  if (!city || !meta) return <Navigate to={`/browse?mode=${mode}`} replace />

  const loading = listings.length === 0 && !state.publicMarketplaceFetchFailed && (state.marketplaceRefreshing || !state.publicMarketplaceSettled)
  const browseHref = `/browse?mode=${mode}&q=${encodeURIComponent(city.name)}`
  const nearby = city.near.map(seoCity).filter(Boolean) as NonNullable<ReturnType<typeof seoCity>>[]

  return (
    <div className="bg-white">
      <section className="border-b border-primary-100 bg-primary-50/60">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-500">
            <Link to="/" className="hover:text-primary">Home</Link> <span aria-hidden>/</span>{' '}
            <Link to={`/browse?mode=${mode}`} className="hover:text-primary">{kind === 'sale' ? 'For sale' : kind === 'rooms' ? 'Rooms to rent' : 'To rent'}</Link>{' '}
            <span aria-hidden>/</span> <span aria-current="page">{city.name}</span>
          </nav>
          <h1 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl">{meta.h1}</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-600">{meta.intro}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {(['rent', 'sale', 'rooms'] as SeoKind[]).map((k) => (
              <Link
                key={k}
                to={seoPath(k, city.slug)}
                aria-current={k === kind ? 'page' : undefined}
                className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${
                  k === kind ? 'bg-ink text-white' : 'bg-white text-ink-600 ring-1 ring-primary-100 hover:bg-primary-50'
                }`}
              >
                {KIND_LABEL[k]}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold text-ink">
            {listings.length ? `${listings.length} listing${listings.length === 1 ? '' : 's'} in ${city.name}` : `Listings in ${city.name}`}
          </h2>
          <Link to={browseHref} className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-600">
            Search with filters
          </Link>
        </div>
        <div className="mt-6">
          {loading ? (
            <ListingCardGridSkeleton count={4} label="Loading listings…" />
          ) : listings.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {listings.slice(0, 24).map((p) => (
                <PropertyCard key={p.id} property={p} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-primary-50/60 px-5 py-8 text-sm text-ink-600">
              Nothing listed in {city.name} right now. New listings go live once our team has checked them.{' '}
              <Link to={`/browse?mode=${mode}`} className="font-semibold text-primary hover:underline">
                See all of South Africa
              </Link>
              .
            </p>
          )}
        </div>
      </section>

      <section className="border-t border-primary-100">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:px-8">
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">Questions about {kind === 'sale' ? 'buying' : 'renting'} in {city.name}</h2>
            <dl className="mt-5 space-y-5">
              {faq.map((f) => (
                <div key={f.q}>
                  <dt className="font-semibold text-ink">{f.q}</dt>
                  <dd className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-600">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
          {nearby.length ? (
            <div>
              <h2 className="text-lg font-semibold text-ink">Nearby areas</h2>
              <ul className="mt-3 space-y-1">
                {nearby.map((c) => (
                  <li key={c.slug}>
                    <Link to={seoPath(kind, c.slug)} className="inline-flex min-h-9 items-center text-sm text-primary hover:underline">
                      {seoLandingMeta(kind, c).h1}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
