/** Public: browse and search guest houses by place, dates and guests (/stays). */
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BedDouble, Zap } from 'lucide-react'
import { searchStaysApi, zar, type StayListItem, type StaySearch } from '../../lib/api/guesthousesApi'
import { StaySearchBar } from './StaySearchBar'

function readSearch(p: URLSearchParams): StaySearch {
  return {
    q: p.get('q') ?? undefined,
    checkIn: p.get('checkIn') ?? undefined,
    checkOut: p.get('checkOut') ?? undefined,
    guests: p.get('guests') ? Number(p.get('guests')) : undefined,
    sort: p.get('sort') ?? undefined,
  }
}

export function stayQuery(s: StaySearch): string {
  const p = new URLSearchParams()
  if (s.checkIn) p.set('checkIn', s.checkIn)
  if (s.checkOut) p.set('checkOut', s.checkOut)
  if (s.guests) p.set('guests', String(s.guests))
  const out = p.toString()
  return out ? `?${out}` : ''
}

export default function StaysBrowsePage() {
  const [params, setParams] = useSearchParams()
  const search = useMemo(() => readSearch(params), [params])
  const [items, setItems] = useState<StayListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setItems(null)
    setError(null)
    searchStaysApi(search)
      .then((r) => live && setItems(r.items))
      .catch((e: Error) => live && (setError(e.message), setItems([])))
    return () => {
      live = false
    }
  }, [search])

  const apply = (s: StaySearch) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...s, sort: search.sort })) if (v) p.set(k, String(v))
    setParams(p)
  }
  const dated = Boolean(search.checkIn && search.checkOut)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Guest houses & short stays</h1>
        <p className="mt-1 text-sm text-ink-400">Book a room by the night. Pick your dates to see live availability and the full price.</p>
      </div>
      <StaySearchBar key={params.toString()} value={search} onSearch={apply} />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-400">
          {items === null ? 'Searching…' : `${items.length} place${items.length === 1 ? '' : 's'}${dated ? ' available for your dates' : ''}`}
        </p>
        <div className="flex items-center gap-3">
          <Link to="/stays/bookings" className="text-sm font-medium text-primary hover:underline">Find my booking</Link>
          <select
            className="h-9 rounded-lg border border-primary-100 bg-white px-2 text-sm"
            value={search.sort ?? ''}
            onChange={(e) => {
              const p = new URLSearchParams(params)
              if (e.target.value) p.set('sort', e.target.value)
              else p.delete('sort')
              setParams(p)
            }}
            aria-label="Sort"
          >
            <option value="">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
        </div>
      </div>
      {error && <p className="mt-4 rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">{error}</p>}

      <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items === null &&
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-primary-50" />)}
        {items?.map((h) => (
          <Link key={h.id} to={`/stays/${h.id}${stayQuery(search)}`} className="group block">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-primary-50">
              {h.photos[0] ? (
                <img src={h.photos[0]} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
              ) : (
                <div className="flex h-full items-center justify-center text-primary-300"><BedDouble className="h-12 w-12" /></div>
              )}
              {h.instantBook && (
                <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-xs font-semibold text-ink shadow">
                  <Zap className="h-3 w-3 text-amber-500" /> Instant book
                </span>
              )}
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{h.name}</p>
                <p className="truncate text-sm text-ink-400">{[h.suburb, h.city].filter(Boolean).join(', ')}</p>
                <p className="text-sm text-ink-400">
                  {h.roomCount} room{h.roomCount === 1 ? '' : 's'} · sleeps up to {h.maxGuests}
                  {h.availableRooms != null && ` · ${h.availableRooms} free`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {h.stayQuote ? (
                  <>
                    <p className="font-semibold text-ink">{zar(h.stayQuote.total)}</p>
                    <p className="text-xs text-ink-400">total · {h.stayQuote.nights} night{h.stayQuote.nights === 1 ? '' : 's'}</p>
                  </>
                ) : h.fromPrice != null ? (
                  <>
                    <p className="font-semibold text-ink">{zar(h.fromPrice)}</p>
                    <p className="text-xs text-ink-400">from / night</p>
                  </>
                ) : null}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {items?.length === 0 && !error && (
        <div className="mt-10 rounded-2xl border border-dashed border-primary-100 p-10 text-center">
          <p className="font-medium text-ink">No guest houses match</p>
          <p className="mt-1 text-sm text-ink-400">Try other dates, fewer guests or a wider area.</p>
        </div>
      )}
    </div>
  )
}
