/** Host's booking list with the lifecycle actions (confirm, decline, check in/out, payment). */
import { useState } from 'react'
import { Badge, Button, EmptyState, Select } from '../../components/ui'
import {
  BOOKING_STATUS_LABEL,
  BOOKING_STATUS_TONE,
  fmtDay,
  guestBookingActionApi,
  isoDay,
  zar,
  type BookingAction,
  type GuestBooking,
  type PaymentStatus,
} from '../../lib/api/guesthousesApi'

const FILTERS = [
  { key: 'action', label: 'Needs action' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'staying', label: 'In house' },
  { key: 'past', label: 'Past & cancelled' },
  { key: 'all', label: 'All' },
] as const

export function GuestBookingsTable({
  bookings,
  onChange,
  showHouse,
}: {
  bookings: GuestBooking[]
  onChange: (b: GuestBooking) => void
  showHouse?: boolean
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('upcoming')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = isoDay(new Date())

  const list = bookings
    .filter((b) => {
      if (filter === 'all') return true
      if (filter === 'action') return b.status === 'pending' || (b.status === 'confirmed' && b.checkIn <= today) || (b.status === 'checked_in' && b.checkOut <= today)
      if (filter === 'upcoming') return ['pending', 'confirmed'].includes(b.status) && b.checkOut >= today
      if (filter === 'staying') return b.status === 'checked_in'
      return ['completed', 'cancelled', 'declined', 'no_show', 'expired'].includes(b.status)
    })
    .sort((a, b) => (filter === 'past' || filter === 'all' ? b.checkIn.localeCompare(a.checkIn) : a.checkIn.localeCompare(b.checkIn)))

  const act = async (b: GuestBooking, action: BookingAction, extra: { paymentStatus?: PaymentStatus } = {}) => {
    let note: string | undefined
    if (action === 'decline' || action === 'cancel') {
      const reason = window.prompt(action === 'decline' ? 'Reason for declining (shown to the guest)' : 'Reason for cancelling (shown to the guest)')
      if (reason === null) return
      note = reason || undefined
    }
    setBusy(b.id)
    setError(null)
    try {
      onChange(await guestBookingActionApi(b.id, { action, note, ...extra }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-sm ${filter === f.key ? 'bg-primary text-white' : 'bg-primary-50 text-ink hover:bg-primary-100'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error && <p className="mb-3 rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">{error}</p>}
      {list.length === 0 ? (
        <EmptyState title="No bookings here" description="Bookings from the public guest-house page show up in this list." />
      ) : (
        <div className="space-y-3">
          {list.map((b) => (
            <div key={b.id} className="rounded-xl border border-primary-100 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {b.guestName} <span className="font-mono text-xs font-normal text-ink-400">{b.reference}</span>
                  </p>
                  <p className="text-sm text-ink-400">
                    {showHouse ? `${b.guesthouseName} · ` : ''}{b.roomName} · {b.guests} guest{b.guests === 1 ? '' : 's'}
                  </p>
                  <p className="text-sm text-ink">
                    {fmtDay(b.checkIn)} → {fmtDay(b.checkOut)} · {b.nights} night{b.nights === 1 ? '' : 's'} · <span className="font-semibold">{zar(b.total)}</span>
                  </p>
                  <p className="text-xs text-ink-400">
                    <a href={`mailto:${b.guestEmail}`} className="hover:underline">{b.guestEmail}</a>
                    {b.guestPhone && <> · <a href={`tel:${b.guestPhone}`} className="hover:underline">{b.guestPhone}</a></>}
                  </p>
                  {b.guestMessage && <p className="mt-1 whitespace-pre-line text-sm italic text-ink">“{b.guestMessage}”</p>}
                  {b.status === 'pending' && b.expiresAt && (
                    <p className="mt-1 text-xs font-medium text-amber-700">Reply by {new Date(b.expiresAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })} or the request expires</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge tone={BOOKING_STATUS_TONE[b.status]}>{BOOKING_STATUS_LABEL[b.status]}</Badge>
                  <Select
                    className="h-8 w-32 text-xs"
                    value={b.paymentStatus}
                    disabled={busy === b.id}
                    onChange={(e) => void act(b, 'payment', { paymentStatus: e.target.value as PaymentStatus })}
                    aria-label="Payment status"
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="deposit">Deposit paid</option>
                    <option value="paid">Paid in full</option>
                    <option value="refunded">Refunded</option>
                  </Select>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {b.status === 'pending' && (
                  <>
                    <Button size="sm" disabled={busy === b.id} onClick={() => void act(b, 'confirm')}>Accept</Button>
                    <Button size="sm" variant="secondary" disabled={busy === b.id} onClick={() => void act(b, 'decline')}>Decline</Button>
                  </>
                )}
                {b.status === 'confirmed' && (
                  <>
                    <Button size="sm" disabled={busy === b.id || b.checkIn > today} onClick={() => void act(b, 'check_in')}>Check in</Button>
                    {b.checkIn <= today && <Button size="sm" variant="secondary" disabled={busy === b.id} onClick={() => void act(b, 'no_show')}>No-show</Button>}
                    <Button size="sm" variant="ghost" disabled={busy === b.id} onClick={() => void act(b, 'cancel')}>Cancel</Button>
                  </>
                )}
                {b.status === 'checked_in' && <Button size="sm" disabled={busy === b.id} onClick={() => void act(b, 'check_out')}>Check out</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
