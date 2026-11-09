/** Workspace: guest houses I manage, plus one inbox for all their bookings (/workspace/guesthouses). */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BedDouble, CalendarCheck, Inbox, Percent, Plus, Wallet } from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, StatCard } from '../../components/ui'
import { listGuesthousesApi, listManagedBookingsApi, zar, type GuestBooking, type ManagedSummary } from '../../lib/api/guesthousesApi'
import { GuestBookingsTable } from './GuestBookingsTable'

export default function GuesthousesPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'bookings' ? 'bookings' : 'houses'
  const [houses, setHouses] = useState<ManagedSummary[] | null>(null)
  const [bookings, setBookings] = useState<GuestBooking[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([listGuesthousesApi(), listManagedBookingsApi()])
      .then(([h, b]) => {
        setHouses(h)
        setBookings(b)
      })
      .catch((e: Error) => {
        setError(e.message)
        setHouses([])
      })
  }, [])
  useEffect(load, [load])

  const pending = houses?.reduce((s, h) => s + h.pendingRequests, 0) ?? 0
  const upcoming = houses?.reduce((s, h) => s + h.upcoming, 0) ?? 0
  const revenue = houses?.reduce((s, h) => s + h.revenue30, 0) ?? 0
  const occ = houses?.length ? Math.round(houses.reduce((s, h) => s + h.occupancy30, 0) / houses.length) : 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Guest houses"
        subtitle="Short stays booked by the night. Manage rooms, rates, availability and guest bookings."
        actions={<Button onClick={() => navigate('/workspace/guesthouses/new')}><Plus className="mr-1 h-4 w-4" />Add guest house</Button>}
      />
      {error && <p className="rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">{error}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Requests to answer" value={String(pending)} icon={<Inbox className="h-5 w-5" />} />
        <StatCard label="Upcoming stays" value={String(upcoming)} icon={<CalendarCheck className="h-5 w-5" />} />
        <StatCard label="Occupancy, next 30 days" value={`${occ}%`} icon={<Percent className="h-5 w-5" />} />
        <StatCard label="Booked value, last 30 days" value={zar(revenue)} icon={<Wallet className="h-5 w-5" />} />
      </div>
      <div className="flex gap-1 border-b border-primary-100">
        {(['houses', 'bookings'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setParams(t === 'houses' ? {} : { tab: t })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? 'border-primary text-primary' : 'border-transparent text-ink-400 hover:text-ink'}`}
          >
            {t === 'houses' ? 'Guest houses' : `Bookings${pending ? ` (${pending})` : ''}`}
          </button>
        ))}
      </div>

      {tab === 'bookings' ? (
        <GuestBookingsTable bookings={bookings} showHouse onChange={(b) => { setBookings((list) => list.map((x) => (x.id === b.id ? b : x))); load() }} />
      ) : houses === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-primary-50" />
      ) : houses.length === 0 ? (
        <EmptyState title="No guest houses yet" description="Add a guest house, add its rooms and rates, then publish it so guests can book." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {houses.map((h) => (
            <Link key={h.id} to={`/workspace/guesthouses/${h.id}`}>
              <Card hover className="overflow-hidden p-0">
                <div className="aspect-[16/9] bg-primary-50">
                  {h.photos[0] ? <img src={h.photos[0]} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-primary-300"><BedDouble className="h-10 w-10" /></div>}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-ink">{h.name}</p>
                    <Badge tone={h.status === 'published' ? 'success' : h.status === 'paused' ? 'warning' : 'neutral'}>{h.status}</Badge>
                  </div>
                  <p className="text-sm text-ink-400">{[h.suburb, h.city].filter(Boolean).join(', ')} · {h.roomCount} room{h.roomCount === 1 ? '' : 's'}</p>
                  {(h.agencyName || h.hostName) && <p className="text-xs text-ink-400">Belongs to {[h.hostName, h.agencyName].filter(Boolean).join(' · ')}</p>}
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-primary-50 p-2"><p className="text-base font-semibold text-ink">{h.pendingRequests}</p>requests</div>
                    <div className="rounded-lg bg-primary-50 p-2"><p className="text-base font-semibold text-ink">{h.upcoming}</p>upcoming</div>
                    <div className="rounded-lg bg-primary-50 p-2"><p className="text-base font-semibold text-ink">{h.occupancy30}%</p>occupancy</div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
