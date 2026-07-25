import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, Plus, Search } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAgencyScope, useAuth } from '../context/AuthContext'
import { isFieldAgent } from '../lib/permissions'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import { RequirePermission } from '../components/RequirePermission'
import { Button, Card, Input, PageHeader, Select, cn } from '../components/ui'
import {
  CreateViewingModal,
  type CreateViewingPayload,
} from '../components/viewings/CreateViewingModal'
import { ViewingsAgenda } from '../components/viewings/ViewingsAgenda'
import { ViewingsDayStrip, todayIso } from '../components/viewings/ViewingsDayStrip'
import {
  resolveAgentName,
  viewingStatus,
  viewingWhenLabel,
  type PortfolioViewing,
  type ViewingKindFilter,
  type ViewingStatusFilter,
} from '../components/viewings/types'
import { readReturnTo } from '../lib/returnTo'

const ICON_STROKE = 1.6

export default function Viewings() {
  const { state, createViewingSlot, bookViewingSlot, createViewing } = useStore()
  const { user, agencyId, has, role } = useAuth()
  const { scopeAgency, scopeAgent } = useAgencyScope()
  const reducedMotion = usePrefersReducedMotion()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const returnTo = readReturnTo(searchParams)

  const dayFilter = searchParams.get('date')
  const propertyParam = searchParams.get('property')
  const viewingParam = searchParams.get('viewing')

  const [selectedDate, setSelectedDate] = useState(dayFilter || todayIso())
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<ViewingKindFilter>('all')
  const [status, setStatus] = useState<ViewingStatusFilter>('all')
  const [createOpen, setCreateOpen] = useState(() => searchParams.get('create') === '1')

  useEffect(() => {
    if (dayFilter) setSelectedDate(dayFilter)
  }, [dayFilter])

  useEffect(() => {
    if (searchParams.get('create') === '1') setCreateOpen(true)
  }, [searchParams])

  const closeCreateModal = () => {
    setCreateOpen(false)
    if (returnTo && searchParams.get('create') === '1') {
      navigate(returnTo)
      return
    }
    if (searchParams.get('create') === '1') {
      const next = new URLSearchParams(searchParams)
      next.delete('create')
      setSearchParams(next, { replace: true })
    }
  }

  const deskRedirect = useMemo(() => {
    if (propertyParam) {
      return `/workspace/sales/viewings/property/${encodeURIComponent(propertyParam)}`
    }
    if (viewingParam) {
      const booking = state.viewings.find((v) => v.id === viewingParam)
      if (booking?.propertyId) {
        return `/workspace/sales/viewings/property/${encodeURIComponent(booking.propertyId)}`
      }
    }
    return null
  }, [propertyParam, viewingParam, state.viewings])

  const selectDate = (date: string) => {
    setSelectedDate(date)
    const next = new URLSearchParams(searchParams)
    next.set('date', date)
    setSearchParams(next, { replace: true })
  }

  const properties = useMemo(
    () =>
      state.properties.filter((p) => {
        if (!scopeAgency(p.agencyId)) return false
        if (isFieldAgent(role) && !scopeAgent(p.agentId)) return false
        return true
      }),
    [state.properties, scopeAgency, scopeAgent, role],
  )

  const agents = useMemo(
    () =>
      state.users.filter(
        (u) =>
          (u.role === 'ground_agent' || u.role === 'agent_admin' || u.role === 'agent') &&
          (has('platform.manage') || u.agencyId === agencyId),
      ),
    [state.users, has, agencyId],
  )

  const portfolio: PortfolioViewing[] = useMemo(() => {
    const bookings: PortfolioViewing[] = state.viewings
      .filter((v) => {
        if (!scopeAgency(v.agencyId)) return false
        if (isFieldAgent(role) && !scopeAgent(v.agentId)) return false
        return Boolean(state.properties.find((p) => p.id === v.propertyId))
      })
      .map((viewing) => {
        const property = state.properties.find((p) => p.id === viewing.propertyId)!
        const slot = viewing.slotId
          ? state.viewingSlots.find((s) => s.id === viewing.slotId) ?? null
          : null
        return {
          kind: 'booking' as const,
          id: `booking:${viewing.id}`,
          viewing,
          property,
          agentName: resolveAgentName(viewing.agentId, state.users),
          slot,
        }
      })

    const slots: PortfolioViewing[] = state.viewingSlots
      .filter((s) => {
        if (!scopeAgency(s.agencyId)) return false
        if (isFieldAgent(role) && !scopeAgent(s.agentId)) return false
        return Boolean(state.properties.find((p) => p.id === s.propertyId))
      })
      .map((slot) => {
        const property = state.properties.find((p) => p.id === slot.propertyId)!
        const slotBookings = state.viewings.filter(
          (v) => v.slotId === slot.id && v.status !== 'Cancelled',
        )
        return {
          kind: 'slot' as const,
          id: `slot:${slot.id}`,
          slot,
          property,
          agentName: resolveAgentName(slot.agentId, state.users),
          bookings: slotBookings,
        }
      })

    return [...slots, ...bookings]
  }, [
    state.viewings,
    state.viewingSlots,
    state.properties,
    state.users,
    scopeAgency,
    scopeAgent,
    role,
  ])

  const countsByDate = useMemo(() => {
    const map: Record<string, number> = {}
    for (const item of portfolio) {
      const date = item.kind === 'booking' ? item.viewing.date : item.slot.date
      map[date] = (map[date] ?? 0) + 1
    }
    return map
  }, [portfolio])

  const dayItems = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return portfolio
      .filter((item) => {
        const date = item.kind === 'booking' ? item.viewing.date : item.slot.date
        if (date !== selectedDate) return false
        if (kind === 'bookings' && item.kind !== 'booking') return false
        if (kind === 'slots' && item.kind !== 'slot') return false
        const st = viewingStatus(item)
        if (status !== 'all' && st !== status) return false
        if (!needle) return true
        const hay = [
          item.property.title,
          item.property.suburb,
          item.property.city,
          item.agentName,
          viewingWhenLabel(item),
          item.kind === 'booking'
            ? `${item.viewing.applicantName} ${item.viewing.applicantEmail ?? ''}`
            : `${item.slot.title ?? ''} ${item.slot.notes ?? ''}`,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(needle)
      })
      .sort((a, b) => viewingWhenLabel(a).localeCompare(viewingWhenLabel(b)))
  }, [portfolio, selectedDate, q, kind, status])

  const weekAhead = useMemo(() => {
    const props = new Set<string>()
    for (const item of portfolio) {
      const date = item.kind === 'booking' ? item.viewing.date : item.slot.date
      if (date >= selectedDate) props.add(item.property.id)
    }
    return props.size
  }, [portfolio, selectedDate])

  const formattedDay = useMemo(() => {
    try {
      return new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return selectedDate
    }
  }, [selectedDate])

  if (deskRedirect) {
    return <Navigate to={deskRedirect} replace />
  }

  const handleCreate = (payload: CreateViewingPayload) => {
    if (!agencyId) return
    const prop = properties.find((p) => p.id === payload.propertyId)
    if (!prop) return

    if (payload.mode === 'slot') {
      const slot = createViewingSlot({
        agencyId,
        propertyId: prop.id,
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
    } else {
      for (const guest of payload.guests) {
        createViewing({
          agencyId,
          propertyId: prop.id,
          agentId: payload.agentId,
          applicantName: guest.name,
          applicantEmail: guest.email,
          date: payload.date,
          time: payload.time,
          notes: payload.notes || undefined,
        })
      }
    }

    if (returnTo) {
      navigate(returnTo)
      return
    }
    selectDate(payload.date)
  }

  return (
    <RequirePermission permission="viewings.manage">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Viewing schedule"
          subtitle="Pick a day, scan the agenda by time, then open a property’s viewing desk to manage slots and invites."
          actions={
            has('viewings.manage') ? (
              <Button className="min-h-11 gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Schedule viewing
              </Button>
            ) : null
          }
        />

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.25rem] border border-primary-100 bg-gradient-to-br from-primary-50 to-white px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">This day</p>
            <p className="mt-1 tabular font-display text-2xl font-semibold text-ink">
              {dayItems.length}
            </p>
            <p className="text-xs text-ink-500">slots & invites on the agenda</p>
          </div>
          <div className="rounded-[1.25rem] border border-primary-100 bg-white px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              Properties ahead
            </p>
            <p className="mt-1 tabular font-display text-2xl font-semibold text-ink">{weekAhead}</p>
            <p className="text-xs text-ink-500">with viewings from this day forward</p>
          </div>
          <div className="rounded-[1.25rem] border border-primary-100 bg-white px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Tip</p>
            <p className="mt-1 text-sm text-ink-600">
              Open any row to manage that property’s slots, group invites, and attendance.
            </p>
          </div>
        </section>

        <ViewingsDayStrip
          selectedDate={selectedDate}
          onSelectDate={selectDate}
          countsByDate={countsByDate}
          reducedMotion={reducedMotion}
        />

        <div className="flex flex-col gap-3 rounded-[1.25rem] border border-primary-100/80 bg-white p-3 shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] sm:flex-row sm:items-center sm:p-4">
          <div className="relative min-w-0 flex-1" role="search" aria-label="Filter agenda">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              strokeWidth={ICON_STROKE}
              aria-hidden
            />
            <Input
              className="min-h-11 pl-9"
              placeholder="Filter this day’s agenda…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Filter agenda"
            />
          </div>
          <Select
            className="min-h-11 sm:w-40"
            value={kind}
            onChange={(e) => setKind(e.target.value as ViewingKindFilter)}
            aria-label="Kind"
          >
            <option value="all">All kinds</option>
            <option value="slots">Open slots</option>
            <option value="bookings">Invites</option>
          </Select>
          <Select
            className="min-h-11 sm:w-44"
            value={status}
            onChange={(e) => setStatus(e.target.value as ViewingStatusFilter)}
            aria-label="Status"
          >
            <option value="all">All statuses</option>
            <option value="Open">Open</option>
            <option value="Full">Full</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Completed">Completed</option>
            <option value="No-show">No-show</option>
            <option value="Cancelled">Cancelled</option>
          </Select>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <CalendarDays className="h-5 w-5 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
              {formattedDay}
            </h2>
            <p className="text-xs text-ink-500">
              {dayItems.length === 0
                ? 'No entries — schedule a slot or invite people.'
                : `${dayItems.length} timed ${dayItems.length === 1 ? 'entry' : 'entries'} · tap to open desk`}
            </p>
          </div>
          {selectedDate !== todayIso() && (
            <button
              type="button"
              onClick={() => selectDate(todayIso())}
              className={cn(
                'inline-flex min-h-11 cursor-pointer items-center rounded-2xl px-3 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                reducedMotion && 'transition-none',
              )}
            >
              Jump to today
            </button>
          )}
        </div>

        {portfolio.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-sm text-ink-500">No viewing slots or bookings in your scope yet.</p>
            {has('viewings.manage') && (
              <Button className="mt-4 min-h-11" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden /> Schedule first
                viewing
              </Button>
            )}
          </Card>
        ) : (
          <ViewingsAgenda
            items={dayItems}
            reducedMotion={reducedMotion}
            emptyLabel="Nothing on this day matches your filters."
          />
        )}

        <CreateViewingModal
          open={createOpen}
          onClose={closeCreateModal}
          properties={properties}
          agents={agents}
          defaultDate={selectedDate}
          defaultAgentId={isFieldAgent(role) ? user.id : undefined}
          onSubmit={handleCreate}
        />
      </div>
    </RequirePermission>
  )
}
