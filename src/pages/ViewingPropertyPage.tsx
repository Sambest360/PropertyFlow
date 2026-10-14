import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import {
  CalendarDays,
  ChevronDown,
  MapPin,
  Pencil,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { ActionButtonRow } from '../components/ActionButtonRow'
import { BackButton } from '../components/BackButton'
import { Badge, Button, Card, Select, cn, statusTone } from '../components/ui'
import {
  CreateViewingModal,
  type CreateViewingPayload,
} from '../components/viewings/CreateViewingModal'
import {
  EditViewingSlotModal,
  type EditViewingSlotPayload,
} from '../components/viewings/EditViewingSlotModal'
import {
  EditViewingBookingModal,
  type EditViewingBookingPayload,
} from '../components/viewings/EditViewingBookingModal'
import {
  GuestListEditor,
  type ViewingGuest,
} from '../components/viewings/GuestListEditor'
import { VIEWING_BOOKING_STATUSES } from '../components/viewings/types'
import type { Viewing, ViewingSlot } from '../types/domain'
import { isFutureViewingSlot } from '../lib/viewingSlotTime'

const ICON_STROKE = 1.6

export default function ViewingPropertyPage() {
  const { propertyId } = useParams()
  const [searchParams] = useSearchParams()
  const { state, createViewingSlot, bookViewingSlot, createViewing, updateViewing, updateViewingSlot } =
    useStore()
  const { agencyId, has } = useAuth()
  const { inPropertyScope, canMutate } = usePropertyScope()

  const property = state.properties.find((p) => p.id === propertyId)

  const [createOpen, setCreateOpen] = useState(false)
  const [editSlotId, setEditSlotId] = useState<string | null>(null)
  const [editBookingId, setEditBookingId] = useState<string | null>(null)
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null)
  const [inviteSlotId, setInviteSlotId] = useState<string | null>(null)
  const [inviteGuests, setInviteGuests] = useState<ViewingGuest[]>([])
  const [inviteError, setInviteError] = useState<string | null>(null)

  const slotFocus = searchParams.get('slot')
  const bookingFocus = searchParams.get('booking')

  useEffect(() => {
    let resolvedSlotId = slotFocus
    if (!resolvedSlotId && bookingFocus) {
      const booking = state.viewings.find((v) => v.id === bookingFocus)
      if (booking?.slotId) resolvedSlotId = booking.slotId
    }

    const targetId = resolvedSlotId
      ? `viewing-slot-${resolvedSlotId}`
      : bookingFocus
        ? `viewing-booking-${bookingFocus}`
        : null
    if (!targetId) return

    if (resolvedSlotId) {
      setExpandedSlotId(resolvedSlotId)
    }

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [slotFocus, bookingFocus, propertyId, state.viewings])

  const agents = useMemo(
    () =>
      state.users.filter(
        (u) =>
          (u.role === 'ground_agent' || u.role === 'agent_admin' || u.role === 'agent') &&
          (has('platform.manage') || u.agencyId === agencyId),
      ),
    [state.users, has, agencyId],
  )

  const scopedOk = Boolean(property && inPropertyScope(property.id))

  const slots = useMemo(() => {
    if (!property) return []
    return state.viewingSlots
      .filter((s) => s.propertyId === property.id && isFutureViewingSlot(s))
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  }, [state.viewingSlots, property])

  const standalone = useMemo(() => {
    if (!property) return []
    return state.viewings
      .filter(
        (v) =>
          v.propertyId === property.id &&
          !v.slotId &&
          v.status !== 'Cancelled',
      )
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  }, [state.viewings, property])

  const attendeesFor = (slotId: string) =>
    state.viewings.filter((v) => v.slotId === slotId && v.status !== 'Cancelled')

  const stats = useMemo(() => {
    const openSlots = slots.filter((s) => s.status === 'Open').length
    const upcoming = [
      ...slots.filter((s) => s.status !== 'Cancelled'),
      ...standalone.filter((v) => v.status === 'Scheduled'),
    ].length
    const people = slots.reduce((n, s) => n + attendeesFor(s.id).length, 0) + standalone.length
    return { openSlots, upcoming, people }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attendees derived from state.viewings
  }, [slots, standalone, state.viewings])

  if (!propertyId) return <Navigate to="/workspace/sales/viewings" replace />
  if (!property || !scopedOk) {
    return (
      <RequirePermission permission="viewings.manage">
        <Card className="p-10 text-center text-sm text-ink-500">
          <p>Property not found or out of scope.</p>
          <div className="mt-3 flex justify-center">
            <BackButton to="/workspace/sales/viewings" label="Back to schedule" />
          </div>
        </Card>
      </RequirePermission>
    )
  }

  const handleCreate = (payload: CreateViewingPayload) => {
    if (!agencyId || !canMutate(property.id)) return
    if (payload.mode === 'slot') {
      const slot = createViewingSlot({
        agencyId,
        propertyId: property.id,
        agentId: payload.agentId,
        date: payload.date,
        time: payload.time,
        capacity: payload.capacity,
        title: payload.title || undefined,
        notes: payload.notes || undefined,
        durationMinutes: payload.durationMinutes,
      })
      for (const guest of payload.guests) {
        bookViewingSlot(slot.id, guest.name, guest.email)
      }
      setExpandedSlotId(slot.id)
      return
    }
    for (const guest of payload.guests) {
      createViewing({
        agencyId,
        propertyId: property.id,
        agentId: payload.agentId,
        applicantName: guest.name,
        applicantEmail: guest.email,
        date: payload.date,
        time: payload.time,
        notes: payload.notes || undefined,
      })
    }
  }

  const submitInvite = (slot: ViewingSlot) => {
    const remaining = Math.max(0, slot.capacity - slot.booked)
    if (inviteGuests.length === 0) {
      setInviteError('Add at least one person.')
      return
    }
    if (inviteGuests.length > remaining) {
      setInviteError(`Only ${remaining} place${remaining === 1 ? '' : 's'} left on this slot.`)
      return
    }
    for (const guest of inviteGuests) {
      bookViewingSlot(slot.id, guest.name, guest.email)
    }
    setInviteGuests([])
    setInviteSlotId(null)
    setInviteError(null)
  }

  const editSlot = editSlotId ? slots.find((s) => s.id === editSlotId) ?? null : null
  const editBooking = editBookingId
    ? standalone.find((v) => v.id === editBookingId) ?? null
    : null

  const saveSlotEdit = (payload: EditViewingSlotPayload) => {
    if (!editSlot) return
    updateViewingSlot(editSlot.id, payload)
  }

  const saveBookingEdit = (payload: EditViewingBookingPayload) => {
    if (!editBooking) return
    updateViewing(editBooking.id, payload)
  }

  return (
    <RequirePermission permission="viewings.manage">
      <div className="animate-fade-in space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-400">
            <span className="font-medium text-ink">Property viewing desk</span>
          </div>
          <ActionButtonRow className="sm:w-auto">
            <BackButton to="/workspace/sales/viewings" label="Schedule" />
          </ActionButtonRow>
        </div>

        <section className="overflow-hidden rounded-[1.5rem] border border-primary-100 bg-white shadow-[0_12px_32px_-24px_rgba(15,39,68,0.3)]">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="relative min-h-[12rem] bg-primary-50">
              {property.images[0] ? (
                <img src={property.images[0]} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-ink/50 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <Badge tone="brand" className="mb-2">
                  Viewing desk
                </Badge>
                <h1 className="font-display text-2xl font-semibold text-white drop-shadow">
                  {property.title}
                </h1>
                <p className="mt-1 flex items-center gap-1 text-sm text-white/90">
                  <MapPin className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                  {property.suburb}, {property.city}
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-4 p-5 sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Manage viewings for this property
                </p>
                <p className="mt-1 text-sm text-ink-500">
                  Publish open slots, invite individuals or groups, and track attendance — all tied to{' '}
                  <span className="font-semibold text-ink">{property.title}</span>.
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-primary-50/80 px-3 py-3 text-center">
                    <p className="tabular text-xl font-semibold text-ink">{stats.openSlots}</p>
                    <p className="text-[11px] font-medium text-ink-500">Open slots</p>
                  </div>
                  <div className="rounded-2xl bg-primary-50/80 px-3 py-3 text-center">
                    <p className="tabular text-xl font-semibold text-ink">{stats.upcoming}</p>
                    <p className="text-[11px] font-medium text-ink-500">Upcoming</p>
                  </div>
                  <div className="rounded-2xl bg-primary-50/80 px-3 py-3 text-center">
                    <p className="tabular text-xl font-semibold text-ink">{stats.people}</p>
                    <p className="text-[11px] font-medium text-ink-500">People</p>
                  </div>
                </div>
              </div>
              <ActionButtonRow>
                {has('viewings.manage') && (
                  <Button className="min-h-11 gap-1.5 rounded-2xl" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                    New slot or invite
                  </Button>
                )}
                <Link to={`/workspace/properties/${property.id}`} className="inline-flex">
                  <Button variant="secondary" className="min-h-11 rounded-2xl">
                    Property profile
                  </Button>
                </Link>
              </ActionButtonRow>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Open & scheduled slots</h2>
            <p className="text-xs text-ink-500">Expand a slot to manage attendees or invite a group.</p>
          </div>

          {slots.length === 0 ? (
            <Card className="p-8 text-center text-sm text-ink-500">
              No slots on this property yet.
              {has('viewings.manage') && (
                <div className="mt-3">
                  <Button className="min-h-11" onClick={() => setCreateOpen(true)}>
                    Create first slot
                  </Button>
                </div>
              )}
            </Card>
          ) : (
            <ul className="space-y-2">
              {slots.map((slot) => {
                const open = expandedSlotId === slot.id
                const attendees = attendeesFor(slot.id)
                const agent = state.users.find((u) => u.id === slot.agentId)
                const remaining = Math.max(0, slot.capacity - slot.booked)
                const inviting = inviteSlotId === slot.id
                return (
                  <li
                    key={slot.id}
                    id={`viewing-slot-${slot.id}`}
                    className={cn(
                      'overflow-hidden rounded-[1.25rem] border transition-colors duration-200',
                      open ? 'border-primary-200 bg-primary-50/40' : 'border-primary-100 bg-white',
                      slotFocus === slot.id && 'ring-2 ring-primary/30',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedSlotId(open ? null : slot.id)
                        if (open) setInviteSlotId(null)
                      }}
                      aria-expanded={open}
                      className="flex w-full min-h-14 cursor-pointer items-center gap-3 px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-white tabular ring-1 ring-primary-100">
                        <span className="text-[10px] font-semibold uppercase text-ink-400">
                          {slot.date.slice(5, 7)}/{slot.date.slice(8, 10)}
                        </span>
                        <span className="text-sm font-bold text-ink">{slot.time}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">
                          {slot.title?.trim() || `Viewing · ${slot.time}`}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
                          <span className="tabular">{slot.date}</span>
                          <span>·</span>
                          <span>{agent?.name ?? 'Unassigned'}</span>
                          {slot.durationMinutes ? <span>· {slot.durationMinutes} min</span> : null}
                        </span>
                      </span>
                      <span className="hidden items-center gap-1 text-xs font-medium text-ink-500 sm:inline-flex">
                        <Users className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                        <span className="tabular">
                          {slot.booked}/{slot.capacity}
                        </span>
                      </span>
                      <Badge tone={statusTone(slot.status)}>{slot.status}</Badge>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 shrink-0 text-ink-400 transition-transform duration-200',
                          open && 'rotate-180',
                        )}
                        strokeWidth={ICON_STROKE}
                        aria-hidden
                      />
                    </button>

                    {open && (
                      <div className="space-y-4 border-t border-primary-100/80 bg-white px-4 py-4">
                        {slot.notes && <p className="text-sm text-ink-600">{slot.notes}</p>}

                        <div>
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                            Attendees ({attendees.length})
                          </p>
                          <ul className="space-y-2">
                            {attendees.map((v) => (
                              <AttendeeRow
                                key={v.id}
                                viewing={v}
                                canManage={has('viewings.manage')}
                                onUpdate={updateViewing}
                              />
                            ))}
                            {attendees.length === 0 && (
                              <li className="rounded-xl border border-dashed border-primary-100 px-3 py-4 text-sm text-ink-500">
                                Nobody booked yet — invite people below.
                              </li>
                            )}
                          </ul>
                        </div>

                        {has('viewings.manage') && slot.status === 'Open' && remaining > 0 && (
                          <div className="rounded-2xl border border-primary-100 bg-primary-50/40 p-4">
                            {!inviting ? (
                              <Button
                                type="button"
                                variant="secondary"
                                className="min-h-11 gap-1.5 rounded-2xl"
                                onClick={() => {
                                  setInviteSlotId(slot.id)
                                  setInviteGuests([])
                                  setInviteError(null)
                                }}
                              >
                                <UserPlus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                                Invite person or group
                                <span className="tabular text-ink-400">· {remaining} left</span>
                              </Button>
                            ) : (
                              <div className="space-y-3">
                                <GuestListEditor
                                  guests={inviteGuests}
                                  onChange={setInviteGuests}
                                  label="Invite to this slot"
                                  hint={`Up to ${remaining} more ${remaining === 1 ? 'person' : 'people'} can join.`}
                                />
                                {inviteError && (
                                  <p role="alert" className="text-xs font-medium text-accent">
                                    {inviteError}
                                  </p>
                                )}
                                <ActionButtonRow>
                                  <Button
                                    type="button"
                                    className="min-h-11 rounded-2xl"
                                    onClick={() => submitInvite(slot)}
                                  >
                                    Confirm invites
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="min-h-11"
                                    onClick={() => {
                                      setInviteSlotId(null)
                                      setInviteGuests([])
                                      setInviteError(null)
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </ActionButtonRow>
                              </div>
                            )}
                          </div>
                        )}

                        {has('viewings.manage') && (
                          <ActionButtonRow className="border-t border-primary-50 pt-3">
                            {slot.status !== 'Cancelled' && (
                              <Button
                                variant="secondary"
                                className="min-h-11 gap-1.5"
                                onClick={() => setEditSlotId(slot.id)}
                              >
                                <Pencil className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                                Edit slot
                              </Button>
                            )}
                            {slot.status === 'Open' && (
                              <Button
                                variant="secondary"
                                className="min-h-11"
                                onClick={() => updateViewingSlot(slot.id, { status: 'Cancelled' })}
                              >
                                Cancel slot
                              </Button>
                            )}
                            {slot.status === 'Cancelled' && (
                              <Button
                                variant="secondary"
                                className="min-h-11"
                                onClick={() => updateViewingSlot(slot.id, { status: 'Open' })}
                              >
                                Reopen slot
                              </Button>
                            )}
                          </ActionButtonRow>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {standalone.length > 0 && (
          <section className="space-y-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Direct bookings</h2>
              <p className="text-xs text-ink-500">Scheduled without an open slot (named invites).</p>
            </div>
            <ul className="space-y-2">
              {standalone.map((v) => (
                <li
                  key={v.id}
                  id={`viewing-booking-${v.id}`}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-primary-100 bg-white px-4 py-3',
                    bookingFocus === v.id && 'ring-2 ring-primary/30',
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{v.applicantName}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs tabular text-ink-500">
                      <CalendarDays className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                      {v.date} · {v.time}
                      {v.applicantEmail ? ` · ${v.applicantEmail}` : ''}
                    </p>
                  </div>
                  {has('viewings.manage') ? (
                    <ActionButtonRow className="w-auto sm:w-auto">
                      <Button
                        variant="secondary"
                        className="min-h-11 gap-1.5"
                        onClick={() => setEditBookingId(v.id)}
                      >
                        <Pencil className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                        Edit
                      </Button>
                      <Select
                      className="min-h-11"
                      value={v.status}
                      onChange={(e) =>
                        updateViewing(v.id, {
                          status: e.target.value as Viewing['status'],
                          attendance:
                            e.target.value === 'Completed'
                              ? 'Attended'
                              : e.target.value === 'No-show'
                                ? 'No-show'
                                : v.attendance,
                        })
                      }
                    >
                      {VIEWING_BOOKING_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                    </ActionButtonRow>
                  ) : (
                    <Badge tone={statusTone(v.status)}>{v.status}</Badge>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <CreateViewingModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          properties={[property]}
          agents={agents}
          defaultPropertyId={property.id}
          lockProperty
          onSubmit={handleCreate}
        />

        <EditViewingSlotModal
          open={Boolean(editSlot)}
          slot={editSlot}
          onClose={() => setEditSlotId(null)}
          onSave={saveSlotEdit}
        />

        <EditViewingBookingModal
          open={Boolean(editBooking)}
          viewing={editBooking}
          onClose={() => setEditBookingId(null)}
          onSave={saveBookingEdit}
        />
      </div>
    </RequirePermission>
  )
}

function AttendeeRow({
  viewing,
  canManage,
  onUpdate,
}: {
  viewing: Viewing
  canManage: boolean
  onUpdate: (id: string, patch: Partial<Viewing>) => void
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary-50 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{viewing.applicantName}</p>
        <p className="text-xs text-ink-500">{viewing.applicantEmail ?? 'No email'}</p>
      </div>
      {canManage ? (
        <Select
          className="min-h-11"
          value={viewing.status}
          onChange={(e) =>
            onUpdate(viewing.id, {
              status: e.target.value as Viewing['status'],
              attendance:
                e.target.value === 'Completed'
                  ? 'Attended'
                  : e.target.value === 'No-show'
                    ? 'No-show'
                    : viewing.attendance,
            })
          }
        >
          {VIEWING_BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      ) : (
        <Badge tone={statusTone(viewing.status)}>{viewing.status}</Badge>
      )}
    </li>
  )
}
