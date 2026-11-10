/** Public: one guest house — photos, rooms, live availability, price and booking (/stays/:id). */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BedDouble, CheckCircle2, Clock, MapPin, ShieldCheck, Users, Zap } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  AMENITY_LABELS,
  createStayBookingApi,
  fmtDay,
  getStayApi,
  zar,
  type GuestBooking,
  type Guesthouse,
  type RoomAvailability,
} from '../../lib/api/guesthousesApi'
import { Button, Input, Textarea } from '../../components/ui'
import { AvailabilityCalendar } from './AvailabilityCalendar'
import { ListingPhotoGallery } from '../../components/listing/ListingPhotoGallery'

export default function StayDetailPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const checkIn = params.get('checkIn') ?? undefined
  const checkOut = params.get('checkOut') ?? undefined
  const guests = Number(params.get('guests') ?? 2) || 2
  const [house, setHouse] = useState<(Guesthouse & { rooms: RoomAvailability[] }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(params.get('room'))
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [bookError, setBookError] = useState<string | null>(null)
  const [booked, setBooked] = useState<GuestBooking | null>(null)

  useEffect(() => {
    if (isAuthenticated && user) setForm((f) => ({ ...f, name: f.name || user.name || '', email: f.email || user.email || '' }))
  }, [isAuthenticated, user])

  useEffect(() => {
    let live = true
    const pair = checkIn && checkOut ? { checkIn, checkOut } : {}
    getStayApi(id, { ...pair, guests })
      .then((h) => {
        if (!live) return
        setHouse(h)
        setError(null)
        setRoomId((cur) => cur ?? h.rooms.find((r) => r.available !== false)?.id ?? h.rooms[0]?.id ?? null)
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [id, checkIn && checkOut ? `${checkIn}|${checkOut}` : '', guests])

  const room = useMemo(() => house?.rooms.find((r) => r.id === roomId) ?? null, [house, roomId])

  const setParam = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    setParams(p, { replace: true })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!room || !checkIn || !checkOut) return
    setBusy(true)
    setBookError(null)
    try {
      const b = await createStayBookingApi({
        roomId: room.id,
        checkIn,
        checkOut,
        guests,
        guestName: form.name,
        guestEmail: form.email,
        guestPhone: form.phone || undefined,
        message: form.message || undefined,
      })
      setBooked(b)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setBookError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Once the page has loaded, a failed refresh (e.g. dates the server rejects) shows inline instead of replacing the page.
  if (error && !house) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="font-medium text-ink">{error}</p>
        <Link to="/stays" className="mt-3 inline-block text-sm text-primary hover:underline">Back to guest houses</Link>
      </div>
    )
  }
  if (!house) return <div className="mx-auto max-w-7xl px-4 py-8"><div className="h-80 animate-pulse rounded-2xl bg-primary-50" /></div>

  if (booked) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-2xl border border-primary-100 bg-white p-6 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h1 className="mt-3 text-2xl font-semibold text-ink">{booked.status === 'confirmed' ? 'Your stay is booked' : 'Request sent to the host'}</h1>
          <p className="mt-1 text-sm text-ink-400">
            {booked.status === 'confirmed'
              ? 'Your dates are reserved.'
              : 'The host has 24 hours to accept. Your dates are held until then.'}
          </p>
          <p className="mt-4 text-sm text-ink-400">Booking reference</p>
          <p className="font-mono text-2xl font-bold tracking-widest text-ink">{booked.reference}</p>
          <dl className="mt-6 grid grid-cols-2 gap-3 text-left text-sm">
            <div><dt className="text-ink-400">Guest house</dt><dd className="font-medium text-ink">{booked.guesthouseName}</dd></div>
            <div><dt className="text-ink-400">Room</dt><dd className="font-medium text-ink">{booked.roomName}</dd></div>
            <div><dt className="text-ink-400">Check in</dt><dd className="font-medium text-ink">{fmtDay(booked.checkIn)} from {booked.checkInTime}</dd></div>
            <div><dt className="text-ink-400">Check out</dt><dd className="font-medium text-ink">{fmtDay(booked.checkOut)} by {booked.checkOutTime}</dd></div>
            <div><dt className="text-ink-400">Guests</dt><dd className="font-medium text-ink">{booked.guests}</dd></div>
            <div><dt className="text-ink-400">Total</dt><dd className="font-medium text-ink">{zar(booked.total)}</dd></div>
          </dl>
          <p className="mt-6 text-xs text-ink-400">Keep your reference. Use it with {booked.guestEmail} to view or cancel this booking.</p>
          <div className="mt-4 flex justify-center gap-3">
            <Link to="/stays/bookings"><Button variant="secondary">Manage booking</Button></Link>
            <Link to="/stays"><Button>Browse more stays</Button></Link>
          </div>
        </div>
      </div>
    )
  }

  const canBook = Boolean(room && checkIn && checkOut && room.available)
  return (
    <div className="mx-auto max-w-7xl overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
      <Link to={`/stays${checkIn && checkOut ? `?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}` : ''}`} onClick={(e) => { if (location.key !== 'default') { e.preventDefault(); navigate(-1) } }} className="inline-flex items-center gap-1 text-sm text-ink-400 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      {error && <p className="mt-3 rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">{error}</p>}
      <h1 className="mt-3 break-words text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{house.name}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-400">
        <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{[house.suburb, house.city].filter(Boolean).join(', ')}</span>
        {house.instantBook && <span className="inline-flex items-center gap-1"><Zap className="h-4 w-4 text-amber-500" />Instant book</span>}
        {(house.hostName || house.agencyName) && <span>Hosted by {[house.hostName, house.agencyName].filter(Boolean).join(" · ")}</span>}
      </p>

      <div className="mt-4">
        {house.photos.length ? (
          <ListingPhotoGallery images={house.photos} title={house.name} />
        ) : (
          <div className="flex min-h-48 items-center justify-center rounded-2xl bg-primary-50 text-primary-300"><BedDouble className="h-14 w-14" /></div>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-8">
          {house.description && <p className="whitespace-pre-line text-ink">{house.description}</p>}

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">Choose a room</h2>
            <div className="space-y-3">
              {house.rooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRoomId(r.id)}
                  className={`flex w-full gap-4 rounded-2xl border p-3 text-left transition ${r.id === roomId ? 'border-primary ring-2 ring-primary/20' : 'border-primary-100 hover:border-primary-300'}`}
                >
                  <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-primary-50">
                    {r.photos[0] ? <img src={r.photos[0]} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-primary-300"><BedDouble className="h-8 w-8" /></div>}
                    {r.photos.length > 1 && <span className="absolute bottom-1 right-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{r.photos.length} photos</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-ink">{r.name}</p>
                      <p className="shrink-0 text-right text-sm"><span className="font-semibold text-ink">{zar(r.nightlyRate)}</span><span className="text-ink-400"> / night</span></p>
                    </div>
                    <p className="text-sm text-ink-400">{r.bedSetup} · <Users className="inline h-3.5 w-3.5" /> up to {r.maxGuests}{r.minNights > 1 ? ` · min ${r.minNights} nights` : ''}</p>
                    {r.weekendRate != null && <p className="text-xs text-ink-400">Fri & Sat nights {zar(r.weekendRate)}</p>}
                    {r.description && <p className="mt-1 line-clamp-2 text-sm text-ink">{r.description}</p>}
                    {r.available === true && <p className="mt-1 text-sm font-medium text-emerald-600">Available for your dates</p>}
                    {r.available === false && <p className="mt-1 text-sm font-medium text-accent-700">{r.reason}</p>}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {room && room.photos.length > 0 && (
            <section>
              <h2 className="mb-1 text-lg font-semibold text-ink">Inside {room.name}</h2>
              <p className="mb-3 text-sm text-ink-400">{room.bedSetup} · up to {room.maxGuests} guests. Tap a photo to see it full size.</p>
              <ListingPhotoGallery images={room.photos} title={`${house.name} — ${room.name}`} />
            </section>
          )}

          {room && (
            <section id="dates" className="scroll-mt-24">
              <h2 className="mb-1 text-lg font-semibold text-ink">Choose your dates · {room.name}</h2>
              <p className="mb-3 text-sm text-ink-400">Tap your arrival day, then your departure day. Struck-through nights are taken.</p>
              <AvailabilityCalendar
                unavailable={room.unavailable}
                checkIn={checkIn}
                checkOut={checkOut}
                minNights={room.minNights}
                onChange={(a, b) => setParam({ checkIn: a, checkOut: b })}
              />
            </section>
          )}

          {house.amenities.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-ink">What this place offers</h2>
              <ul className="grid grid-cols-2 gap-2 text-sm text-ink sm:grid-cols-3">
                {house.amenities.map((a) => <li key={a} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" />{AMENITY_LABELS[a] ?? a}</li>)}
              </ul>
            </section>
          )}

          <section className="grid gap-6 sm:grid-cols-2">
            <div>
              <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-ink"><Clock className="h-5 w-5" />Check-in & house rules</h2>
              <p className="text-sm text-ink">Check in from {house.checkInTime} · check out by {house.checkOutTime}</p>
              {house.houseRules && <p className="mt-2 whitespace-pre-line text-sm text-ink-400">{house.houseRules}</p>}
            </div>
            <div>
              <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-ink"><ShieldCheck className="h-5 w-5" />Cancellation</h2>
              <p className="text-sm capitalize text-ink">{house.cancellationPolicy}</p>
              <p className="text-sm text-ink-400">{house.cancellationText}</p>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <form id="book" onSubmit={submit} className="scroll-mt-24 space-y-4 rounded-2xl border border-primary-100 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-2 gap-2">
              {([['Check in', checkIn], ['Check out', checkOut]] as const).map(([label, value]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => document.getElementById('dates')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="rounded-xl border border-primary-100 px-3 py-2 text-left hover:border-primary-300"
                >
                  <span className="block text-xs font-semibold uppercase text-ink-400">{label}</span>
                  <span className={`block text-sm font-medium ${value ? 'text-ink' : 'text-ink-300'}`}>{value ? fmtDay(value) : 'Add date'}</span>
                </button>
              ))}
              <label className="col-span-2 text-xs font-semibold uppercase text-ink-400">Guests
                <Input type="number" min={1} max={30} value={guests} onChange={(e) => setParam({ guests: String(Math.max(1, Number(e.target.value) || 1)) })} className="mt-1" />
              </label>
            </div>

            {room?.quote ? (
              <div className="space-y-1 border-t border-primary-100 pt-3 text-sm">
                <p className="font-medium text-ink">{room.name}</p>
                <div className="flex justify-between text-ink-400"><span>{room.quote.nights} night{room.quote.nights === 1 ? '' : 's'}</span><span>{zar(room.quote.accommodation)}</span></div>
                {room.quote.cleaningFee > 0 && <div className="flex justify-between text-ink-400"><span>Cleaning fee</span><span>{zar(room.quote.cleaningFee)}</span></div>}
                {room.quote.tourismLevy > 0 && <div className="flex justify-between text-ink-400"><span>Tourism levy ({house.tourismLevyPct}%)</span><span>{zar(room.quote.tourismLevy)}</span></div>}
                <div className="flex justify-between border-t border-primary-100 pt-2 font-semibold text-ink"><span>Total</span><span>{zar(room.quote.total)}</span></div>
              </div>
            ) : (
              <p className="text-sm text-ink-400">Add your dates to see the full price.</p>
            )}
            {room?.available === false && <p className="rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">{room.reason}</p>}

            {canBook && (
              <div className="space-y-2 border-t border-primary-100 pt-3">
                <Input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <Input type="tel" placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <Textarea rows={2} placeholder="Message to the host (arrival time, requests)" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              </div>
            )}
            {bookError && <p className="rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">{bookError}</p>}
            <Button type="submit" className="w-full" disabled={!canBook || busy}>
              {busy ? 'Booking…' : house.instantBook ? 'Book now' : 'Request to book'}
            </Button>
            <p className="text-center text-xs text-ink-400">
              {house.instantBook ? 'Confirmed straight away.' : 'The host replies within 24 hours.'} Payment is arranged with the host.
            </p>
          </form>
        </aside>
      </div>

      {/* Phone: the chosen dates and price stay in view while scrolling the calendar. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-primary-100 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <button type="button" className="min-w-0 text-left" onClick={() => document.getElementById('dates')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            {checkIn && checkOut ? (
              <>
                <span className="block truncate text-sm font-semibold text-ink">{fmtDay(checkIn)} → {fmtDay(checkOut)}</span>
                <span className="block text-xs text-ink-400">{room?.quote ? `${zar(room.quote.total)} total · ${room.quote.nights} night${room.quote.nights === 1 ? '' : 's'}` : room?.name}</span>
              </>
            ) : (
              <>
                <span className="block text-sm font-semibold text-ink">{room ? `${zar(room.nightlyRate)} / night` : 'Choose a room'}</span>
                <span className="block text-xs text-primary underline">{checkIn ? 'Now pick your check-out day' : 'Add your dates'}</span>
              </>
            )}
          </button>
          <Button
            type="button"
            className="shrink-0"
            disabled={!checkIn || !checkOut}
            onClick={() => document.getElementById('book')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            {canBook ? 'Reserve' : 'Check price'}
          </Button>
        </div>
      </div>
      <div className="h-20 lg:hidden" aria-hidden />
    </div>
  )
}
