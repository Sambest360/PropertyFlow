/** Public: find a guest-house booking by reference + email, or list my stays when signed in (/stays/bookings). */
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  BOOKING_STATUS_LABEL,
  BOOKING_STATUS_TONE,
  cancelStayBookingApi,
  fmtDay,
  lookupStayBookingApi,
  myStayBookingsApi,
  POLICY_LABELS,
  zar,
  type GuestBooking,
} from '../../lib/api/guesthousesApi'
import { Badge, Button, Input } from '../../components/ui'

function BookingCard({ b, onCancel }: { b: GuestBooking; onCancel?: () => void }) {
  return (
    <div className="rounded-2xl border border-primary-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link to={`/stays/${b.guesthouseId}`} className="font-semibold text-ink hover:underline">{b.guesthouseName}</Link>
          <p className="text-sm text-ink-400">{b.roomName} · {b.city}</p>
        </div>
        <Badge tone={BOOKING_STATUS_TONE[b.status]}>{BOOKING_STATUS_LABEL[b.status]}</Badge>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-ink-400">Reference</dt><dd className="font-mono font-semibold text-ink">{b.reference}</dd></div>
        <div><dt className="text-ink-400">Check in</dt><dd className="text-ink">{fmtDay(b.checkIn)} · {b.checkInTime}</dd></div>
        <div><dt className="text-ink-400">Check out</dt><dd className="text-ink">{fmtDay(b.checkOut)} · {b.checkOutTime}</dd></div>
        <div><dt className="text-ink-400">Total</dt><dd className="font-semibold text-ink">{zar(b.total)}</dd></div>
      </dl>
      {b.hostNote && <p className="mt-3 whitespace-pre-line rounded-lg bg-primary-50 px-3 py-2 text-sm text-ink">{b.hostNote}</p>}
      {onCancel && ['pending', 'confirmed'].includes(b.status) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-primary-100 pt-3">
          <p className="text-xs text-ink-400">{POLICY_LABELS[b.cancellationPolicy]}</p>
          <Button variant="danger" size="sm" onClick={onCancel}>Cancel booking</Button>
        </div>
      )}
    </div>
  )
}

export default function MyStaysPage() {
  const { isAuthenticated } = useAuth()
  const [reference, setReference] = useState('')
  const [email, setEmail] = useState('')
  const [found, setFound] = useState<GuestBooking | null>(null)
  const [mine, setMine] = useState<GuestBooking[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    myStayBookingsApi().then(setMine).catch(() => setMine([]))
  }, [isAuthenticated])

  const lookup = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    try {
      setFound(await lookupStayBookingApi(reference.trim(), email.trim()))
    } catch (err) {
      setFound(null)
      setError((err as Error).message)
    }
  }

  const cancel = async (b: GuestBooking) => {
    if (!window.confirm(`Cancel booking ${b.reference}?`)) return
    try {
      const out = await cancelStayBookingApi(b.reference, b.guestEmail)
      setNotice(`Booking ${out.reference} cancelled. Refund due under the host's policy: ${out.refundPercent}%.`)
      setFound((f) => (f?.id === out.id ? out : f))
      setMine((m) => m?.map((x) => (x.id === out.id ? out : x)) ?? m)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">My guest-house bookings</h1>
      <p className="mt-1 text-sm text-ink-400">Enter the reference from your confirmation and the email you booked with.</p>
      <form onSubmit={lookup} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input required placeholder="Reference, e.g. GH-7K2P9Q" value={reference} onChange={(e) => setReference(e.target.value)} />
        <Input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit">Find</Button>
      </form>
      {error && <p className="mt-3 rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">{error}</p>}
      {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      {found && <div className="mt-4"><BookingCard b={found} onCancel={() => void cancel(found)} /></div>}

      {isAuthenticated && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-ink">Stays on your account</h2>
          {mine === null ? (
            <div className="h-24 animate-pulse rounded-2xl bg-primary-50" />
          ) : mine.length === 0 ? (
            <p className="text-sm text-ink-400">No stays yet. <Link to="/stays" className="text-primary hover:underline">Find a guest house</Link></p>
          ) : (
            <div className="space-y-3">{mine.map((b) => <BookingCard key={b.id} b={b} onCancel={() => void cancel(b)} />)}</div>
          )}
        </section>
      )}
    </div>
  )
}
