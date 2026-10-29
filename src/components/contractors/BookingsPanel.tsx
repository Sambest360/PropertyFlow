/**
 * Contractor lifecycle, step 2 and 3: book a contractor for a date, then link
 * the booking to a fault / maintenance job (which assigns the contractor).
 * Contractors use the same list to accept or decline (mode="contractor").
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/AppStore'
import { isApiEnabled } from '../../lib/api/config'
import { TIME_WINDOWS, bookingActionApi, createBookingApi, listBookingsApi, type Booking, type TimeWindow } from '../../lib/api/contractorBookingsApi'
import { CONTRACTOR_TRADES, tradeLabel } from '../../lib/contractors'
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Textarea } from '../ui'
import { sweetSuccess, sweetWarning } from '../../lib/sweetAlert'

const STATUS_TONE: Record<Booking['status'], 'info' | 'success' | 'neutral' | 'danger' | 'warning'> = {
  requested: 'warning',
  accepted: 'info',
  completed: 'success',
  declined: 'danger',
  cancelled: 'neutral',
}
const STATUS_LABEL: Record<Booking['status'], string> = {
  requested: 'Waiting for reply',
  accepted: 'Accepted',
  completed: 'Done',
  declined: 'Declined',
  cancelled: 'Cancelled',
}
const windowLabel = (w: TimeWindow) => TIME_WINDOWS.find((x) => x.key === w)?.label ?? w

export function BookContractorModal({
  open,
  onClose,
  contractorId,
  ticketId,
  onBooked,
}: {
  open: boolean
  onClose: () => void
  contractorId: string
  ticketId?: string
  onBooked: (b: Booking) => void
}) {
  const { state } = useStore()
  const contractor = state.users.find((u) => u.id === contractorId)
  const ticket = ticketId ? state.tickets.find((t) => t.id === ticketId) : undefined
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const [date, setDate] = useState(tomorrow)
  const [win, setWin] = useState<TimeWindow>('morning')
  const [listingId, setListingId] = useState(ticket?.propertyId ?? '')
  const [trade, setTrade] = useState('')
  const [description, setDescription] = useState(ticket ? `${ticket.title}: ${ticket.description}` : '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setListingId(ticket?.propertyId ?? '')
    setDescription(ticket ? `${ticket.title}: ${ticket.description}`.slice(0, 600) : '')
  }, [open, ticket])

  const submit = async () => {
    setSaving(true)
    try {
      const b = await createBookingApi({
        contractorUserId: contractorId,
        scheduledDate: date,
        timeWindow: win,
        description,
        listingId: listingId || undefined,
        ticketId,
        trade: trade || undefined,
      })
      await sweetSuccess('Booking sent', `${contractor?.name ?? 'The contractor'} has been asked to confirm ${date}.`)
      onBooked(b)
      onClose()
    } catch (e) {
      await sweetWarning('Could not book', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Book ${contractor?.name ?? 'contractor'}`}
      description={ticket ? `For the fault “${ticket.title}”.` : 'They get a request to accept or decline.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void submit()}>
            Send booking
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium text-ink">Date</span>
          <Input className="mt-1" type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="font-medium text-ink">Time</span>
          <Select className="mt-1 w-full" value={win} onChange={(e) => setWin(e.target.value as TimeWindow)}>
            {TIME_WINDOWS.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
              </option>
            ))}
          </Select>
        </label>
        {!ticket ? (
          <>
            <label className="text-sm">
              <span className="font-medium text-ink">Property</span>
              <Select className="mt-1 w-full" value={listingId} onChange={(e) => setListingId(e.target.value)}>
                <option value="">Choose a property…</option>
                {state.properties.slice(0, 400).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              <span className="font-medium text-ink">Trade</span>
              <Select className="mt-1 w-full" value={trade} onChange={(e) => setTrade(e.target.value)}>
                <option value="">Any</option>
                {CONTRACTOR_TRADES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </label>
          </>
        ) : null}
      </div>
      <Textarea className="mt-3" rows={4} placeholder="What needs doing? Access details?" value={description} onChange={(e) => setDescription(e.target.value)} />
    </Modal>
  )
}

function LinkTicket({ booking, onLinked }: { booking: Booking; onLinked: (b: Booking) => void }) {
  const { state, assignContractorToTicket } = useStore()
  const { user } = useAuth()
  const open = useMemo(
    () => state.tickets.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled' && (!booking.listingId || t.propertyId === booking.listingId)),
    [state.tickets, booking.listingId],
  )
  const [ticketId, setTicketId] = useState('')
  const link = async () => {
    if (!ticketId) return
    try {
      const b = await bookingActionApi(booking.id, { action: 'link_ticket', ticketId })
      const ok = assignContractorToTicket({ ticketId, contractorUserId: booking.contractorUserId, actorUserId: user.id })
      await sweetSuccess(
        'Linked',
        ok ? `${booking.contractorName} is now assigned to that job.` : 'The booking is linked. Add the contractor to your roster to assign them to the job.',
      )
      onLinked(b)
    } catch (e) {
      await sweetWarning('Could not link', e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select className="h-9 max-w-[16rem] text-xs" value={ticketId} onChange={(e) => setTicketId(e.target.value)} aria-label="Fault to assign">
        <option value="">Assign to a fault…</option>
        {open.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title} ({t.priority})
          </option>
        ))}
      </Select>
      <Button size="sm" variant="secondary" disabled={!ticketId} onClick={() => void link()}>
        Assign
      </Button>
      <Link
        to={`/workspace/operations/maintenance/new?contractor=${encodeURIComponent(booking.contractorUserId)}${booking.listingId ? `&property=${encodeURIComponent(booking.listingId)}` : ''}`}
        className="text-xs font-semibold text-primary hover:underline"
      >
        or create a maintenance job
      </Link>
    </div>
  )
}

export function BookingsPanel({ mode }: { mode: 'agency' | 'contractor' }) {
  const [items, setItems] = useState<Booking[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'upcoming' | 'all'>('upcoming')

  const load = useCallback(() => {
    if (!isApiEnabled) return
    listBookingsApi()
      .then(setItems)
      .catch((e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  const replace = (b: Booking) => setItems((xs) => (xs ?? []).map((x) => (x.id === b.id ? b : x)))
  const act = async (b: Booking, action: 'accept' | 'decline' | 'complete' | 'cancel') => {
    try {
      replace(await bookingActionApi(b.id, { action }))
    } catch (e) {
      await sweetWarning('Could not update', e instanceof Error ? e.message : String(e))
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const shown = (items ?? [])
    .filter((b) => filter === 'all' || (b.scheduledDate >= today && b.status !== 'cancelled' && b.status !== 'declined'))
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))

  if (!isApiEnabled) return <Card className="p-4 text-sm text-ink-600">Bookings need the live server.</Card>
  return (
    <div className="space-y-3">
      {error ? <Card className="p-4 text-sm text-rose-700">{error}</Card> : null}
      <div className="flex gap-2">
        {(['upcoming', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f ? 'bg-ink text-white' : 'bg-primary-50 text-ink-600'}`}
          >
            {f === 'upcoming' ? 'Upcoming' : 'All bookings'}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState
          title="No bookings"
          description={mode === 'agency' ? 'Book a contractor from the Find or Roster tab.' : 'Booking requests from agencies appear here.'}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((b) => (
            <Card key={b.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="inline-flex items-center gap-2 font-semibold text-ink">
                    <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
                    {new Date(`${b.scheduledDate}T12:00:00`).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
                    {windowLabel(b.timeWindow)}
                  </p>
                  <p className="text-sm text-ink-500">
                    {mode === 'agency' ? b.contractorName : `Booked by ${b.bookedByName ?? 'the agency'}`}
                    {b.listingTitle ? ` · ${b.listingTitle}` : ''}
                    {b.trade ? ` · ${tradeLabel(b.trade)}` : ''}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge>
              </div>
              <p className="whitespace-pre-line text-sm text-ink-600">{b.description}</p>
              {b.ticketId ? (
                <Link to={`/workspace/operations/maintenance/${encodeURIComponent(b.ticketId)}`} className="text-xs font-semibold text-primary hover:underline">
                  Linked job: {b.ticketTitle ?? 'open job'}
                </Link>
              ) : null}
              {b.contractorNote ? <p className="rounded-lg bg-primary-50 px-3 py-2 text-xs text-ink-600">{b.contractorNote}</p> : null}
              <div className="flex flex-wrap gap-2">
                {mode === 'contractor' && b.status === 'requested' ? (
                  <>
                    <Button size="sm" onClick={() => void act(b, 'accept')}>
                      Accept
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void act(b, 'decline')}>
                      Decline
                    </Button>
                  </>
                ) : null}
                {b.status === 'accepted' ? (
                  <Button size="sm" variant="secondary" onClick={() => void act(b, 'complete')}>
                    Mark done
                  </Button>
                ) : null}
                {mode === 'agency' && (b.status === 'requested' || b.status === 'accepted') ? (
                  <Button size="sm" variant="ghost" onClick={() => void act(b, 'cancel')}>
                    Cancel booking
                  </Button>
                ) : null}
              </div>
              {mode === 'agency' && !b.ticketId && (b.status === 'requested' || b.status === 'accepted') ? <LinkTicket booking={b} onLinked={replace} /> : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
