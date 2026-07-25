import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Plus } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAgencyScope, useAuth } from '../context/AuthContext'
import { isFieldAgent } from '../lib/permissions'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import { scoreAssetHealth } from '../lib/api/ticketsApi'
import { isWarrantyCovered } from '../lib/maintenanceApi'
import type { AssetCondition } from '../data/infrastructure'
import type { MaintenanceTicket } from '../types/domain'
import type { TicketCompletionFields } from '../lib/maintenanceApi'
import { Button, Card, PageHeader } from '../components/ui'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'
import { MaintenanceToolbar } from '../components/maintenance/MaintenanceToolbar'
import { MaintenanceListView } from '../components/maintenance/MaintenanceListView'
import { MaintenancePortfolioCard } from '../components/maintenance/MaintenancePortfolioCard'
import {
  MaintenanceBoardView,
  type BoardColumnKey,
} from '../components/maintenance/MaintenanceBoardView'
import { CreateTicketModal } from '../components/maintenance/CreateTicketModal'
import { CompleteTicketModal } from '../components/maintenance/CompleteTicketModal'
import {
  isOpenStatus,
  resolveUserName,
  ticketAgeHours,
  urgencyScore,
  VIEW_STORAGE_KEY,
  type AttentionFilter,
  type MaintenanceViewMode,
  type PortfolioTicket,
  type PriorityFilter,
  type SortKey,
} from '../components/maintenance/types'
import { readReturnTo } from '../lib/returnTo'

const ICON_STROKE = 1.6

function readStoredView(): MaintenanceViewMode {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY)
    if (v === 'list' || v === 'cards' || v === 'board') return v
  } catch {
    /* ignore */
  }
  return 'list'
}

export default function Maintenance() {
  const {
    state,
    createMaintenanceTicket,
    patchMaintenanceTicket,
    updateTicket,
    runEmergencyEscalations,
    addPropertyEvent,
  } = useStore()
  const { user, has, role, agencyId } = useAuth()
  const { scopeAgency, scopeAgent } = useAgencyScope()
  const reducedMotion = usePrefersReducedMotion()
  const alert = useSuiteAlert()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const returnTo = readReturnTo(searchParams)

  const [q, setQ] = useState('')
  const [priority, setPriority] = useState<PriorityFilter>('all')
  const [propertyId, setPropertyId] = useState(() => searchParams.get('property') || 'all')
  const [attention, setAttention] = useState<AttentionFilter>('all')
  const [sort, setSort] = useState<SortKey>('priority')
  const [view, setView] = useState<MaintenanceViewMode>(() => readStoredView())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(() => searchParams.get('create') === '1')
  const [completeId, setCompleteId] = useState<string | null>(null)
  const [flash, setFlash] = useState('')

  const toggleExpand = (item: PortfolioTicket) => {
    setExpandedId((id) => (id === item.ticket.id ? null : item.ticket.id))
  }

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view)
    } catch {
      /* ignore */
    }
  }, [view])

  useEffect(() => {
    const prop = searchParams.get('property')
    const ticket = searchParams.get('ticket')
    if (prop) setPropertyId(prop)
    if (ticket) {
      navigate(`/workspace/operations/maintenance/${encodeURIComponent(ticket)}`, {
        replace: true,
      })
    }
    if (searchParams.get('create') === '1') setCreateOpen(true)
  }, [searchParams, navigate])

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

  const setPropertyFilter = (id: string) => {
    setPropertyId(id)
    const next = new URLSearchParams(searchParams)
    if (id === 'all') next.delete('property')
    else next.set('property', id)
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

  const contractors = useMemo(
    () =>
      state.users.filter(
        (u) =>
          u.role === 'contractor' &&
          u.active &&
          (has('platform.manage') || u.agencyId === agencyId),
      ),
    [state.users, has, agencyId],
  )

  const categories = useMemo(
    () =>
      state.lookups.filter(
        (l) =>
          l.configType === 'TICKET_CATEGORY' &&
          (!agencyId || l.clientId === agencyId) &&
          l.isActive,
      ),
    [state.lookups, agencyId],
  )

  const portfolio: PortfolioTicket[] = useMemo(() => {
    return state.tickets
      .filter((t) => {
        if (!scopeAgency(t.agencyId)) return false
        const prop = state.properties.find((p) => p.id === t.propertyId)
        if (!prop) return false
        if (isFieldAgent(role) && !scopeAgent(prop.agentId) && !scopeAgent(t.assignedAgentId)) {
          return false
        }
        return true
      })
      .map((ticket) => {
        const property = state.properties.find((p) => p.id === ticket.propertyId)!
        const asset = ticket.internalAssetId
          ? state.internalAssets.find((a) => a.id === ticket.internalAssetId)
          : undefined
        const warranty = ticket.warrantyCovered ?? isWarrantyCovered(asset)
        const assetHealth = scoreAssetHealth(asset, warranty)
        if (!asset && ticket.assetLabel) {
          assetHealth.item_name = ticket.assetLabel
        }
        const ageHours = ticketAgeHours(ticket)
        return {
          ticket,
          property,
          assetHealth,
          contractorName: resolveUserName(ticket.contractorId, state.users),
          agentName: resolveUserName(ticket.assignedAgentId, state.users),
          urgencyScore: urgencyScore(ticket, assetHealth),
          ageHours,
        }
      })
  }, [
    state.tickets,
    state.properties,
    state.internalAssets,
    state.users,
    scopeAgency,
    scopeAgent,
    role,
  ])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let rows = portfolio.filter((item) => {
      const t = item.ticket
      if (priority !== 'all' && t.priority !== priority) return false
      if (propertyId !== 'all' && t.propertyId !== propertyId) return false

      if (attention === 'open' && !isOpenStatus(t.status)) return false
      if (attention === 'emergency' && t.priority !== 'Emergency') return false
      if (attention === 'escalated' && !t.escalatedAt) return false
      if (attention === 'warranty' && !t.warrantyCovered) return false
      if (attention === 'unassigned' && t.contractorId) return false

      if (!needle) return true
      return (
        t.title.toLowerCase().includes(needle) ||
        t.id.toLowerCase().includes(needle) ||
        t.assetLabel.toLowerCase().includes(needle) ||
        item.property.title.toLowerCase().includes(needle) ||
        item.property.suburb.toLowerCase().includes(needle) ||
        item.property.city.toLowerCase().includes(needle) ||
        (item.contractorName ?? '').toLowerCase().includes(needle)
      )
    })

    rows = [...rows].sort((a, b) => {
      if (sort === 'opened') return b.ageHours - a.ageHours
      if (sort === 'property') return a.property.title.localeCompare(b.property.title)
      if (sort === 'status') return a.ticket.status.localeCompare(b.ticket.status)
      if (sort === 'cost') return b.ticket.cost - a.ticket.cost
      return b.urgencyScore - a.urgencyScore
    })

    return rows
  }, [portfolio, q, priority, propertyId, attention, sort])

  const filtersActive =
    Boolean(q.trim()) ||
    priority !== 'all' ||
    propertyId !== 'all' ||
    attention !== 'all'

  const clearFilters = () => {
    setQ('')
    setPriority('all')
    setPropertyFilter('all')
    setAttention('all')
  }

  const resultLabel =
    filtered.length === portfolio.length
      ? `${filtered.length} ${filtered.length === 1 ? 'maintenance' : 'maintenance'}`
      : `${filtered.length} of ${portfolio.length} maintenance`

  const changeStatus = (
    ticketId: string,
    next: MaintenanceTicket['status'],
    label?: string,
  ) => {
    if (next === 'Completed') {
      setCompleteId(ticketId)
      return
    }
    const prev = state.tickets.find((t) => t.id === ticketId)
    if (!prev || prev.status === next) return
    updateTicket(ticketId, { status: next })
    addPropertyEvent({
      agencyId: prev.agencyId,
      propertyId: prev.propertyId,
      actorUserId: user.id,
      actorName: user.name,
      action: label ?? 'changed the Maintenance status',
      changes: [{ field: 'Status', from: prev.status, to: next }],
    })
  }

  const onBoardMove = (ticketId: string, to: BoardColumnKey) => {
    if (!has('maintenance.manage')) return
    if (to === 'RESOLVED') {
      setCompleteId(ticketId)
      return
    }
    if (to === 'IN_PROGRESS') {
      changeStatus(ticketId, 'In Progress', 'moved maintenance on the board')
      setFlash('Moved to In progress')
    }
  }

  const submitCompletion = (fields: TicketCompletionFields): string | null => {
    if (!completeId) return 'No maintenance selected.'
    const prev = state.tickets.find((t) => t.id === completeId)
    const result = patchMaintenanceTicket({
      actorUserId: user.id,
      ticketId: completeId,
      patch: {
        status: 'RESOLVED',
        actual_cost: fields.cost,
        resolution_notes: fields.workNotes.trim(),
        contractor_id: fields.contractorId,
        photos: fields.photos,
        internal_asset_condition: fields.condition,
      },
    })
    if (result.status === 'ERROR') return result.error
    if (prev) {
      addPropertyEvent({
        agencyId: prev.agencyId,
        propertyId: prev.propertyId,
        actorUserId: user.id,
        actorName: user.name,
        action: 'resolved maintenance',
        changes: [
          { field: 'Status', from: prev.status, to: 'Completed' },
          { field: 'Cost', from: String(prev.cost), to: String(fields.cost) },
        ],
      })
    }
    setFlash('Maintenance resolved — work evidence saved.')
    setCompleteId(null)
    void alert.success({
      title: 'Maintenance completed',
      text: 'Cost, work notes, contractor, and photos were recorded.',
    })
    return null
  }

  const onCreate = (input: {
    propertyId: string
    title: string
    description: string
    priority: MaintenanceTicket['priority']
    categoryKey: string
    assetId: string | null
  }) => {
    const prop = properties.find((p) => p.id === input.propertyId)
    if (!prop?.unitId) return 'Property has no linked unit.'
    const result = createMaintenanceTicket({
      actorUserId: user.id,
      propertyId: input.propertyId,
      request: {
        unit_id: prop.unitId,
        internal_asset_id: input.assetId,
        category_key: input.categoryKey,
        priority:
          input.priority === 'Emergency'
            ? 'EMERGENCY'
            : (input.priority.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'),
        title: input.title,
        description: input.description,
      },
    })
    if (result.status === 'ERROR') return result.error
    if (returnTo) {
      void alert.success({
        title: 'Maintenance logged',
        text: `"${input.title}" was created.`,
      })
      navigate(returnTo)
      return null
    }
    setFlash(`Maintenance ${result.ticket_id} created`)
    void alert.success({
      title: 'Maintenance logged',
      text: `"${input.title}" was created.`,
    })
    navigate(`/workspace/operations/maintenance/${encodeURIComponent(result.ticket_id)}`)
    return null
  }

  const openTicketDetail = (id: string) => {
    navigate(`/workspace/operations/maintenance/${encodeURIComponent(id)}`)
  }

  const completeTicket = useMemo(
    () => portfolio.find((i) => i.ticket.id === completeId) ?? null,
    [portfolio, completeId],
  )

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Maintenance"
        subtitle="Scan maintenance, spot what needs attention, and open one for full detail."
        actions={
          <div className="flex flex-wrap gap-2">
            {has('maintenance.manage') && (
              <Button
                variant="secondary"
                className="min-h-11"
                onClick={() => {
                  const n = runEmergencyEscalations()
                  setFlash(
                    n
                      ? `Escalated ${n} emergency maintenance.`
                      : 'No emergencies past the 2h SLA.',
                  )
                }}
              >
                <AlertTriangle className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Escalate
              </Button>
            )}
            {has('maintenance.manage') && (
              <Button className="min-h-11" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Log maintenance
              </Button>
            )}
          </div>
        }
      />

      {flash && (
        <p className="mb-4 rounded-xl border border-primary-100 bg-primary-50/50 px-3 py-2 text-sm text-ink">
          {flash}
        </p>
      )}

      <MaintenanceToolbar
        query={q}
        onQueryChange={setQ}
        priority={priority}
        onPriorityChange={setPriority}
        propertyId={propertyId}
        onPropertyChange={setPropertyFilter}
        properties={properties.map((p) => ({ id: p.id, title: p.title }))}
        attention={attention}
        onAttentionChange={setAttention}
        sort={sort}
        onSortChange={setSort}
        view={view}
        onViewChange={setView}
        resultLabel={resultLabel}
        reducedMotion={reducedMotion}
      />

      {portfolio.length === 0 ? (
        <Card className="p-10 text-center text-sm text-ink-500">
          No maintenance in your scope yet.
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-ink-500">No maintenance matches these filters.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-2xl px-4 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Clear filters
          </button>
        </Card>
      ) : view === 'board' ? (
        <MaintenanceBoardView
          items={filtered}
          canDrag={has('maintenance.manage')}
          onOpen={openTicketDetail}
          onMove={onBoardMove}
          reducedMotion={reducedMotion}
        />
      ) : view === 'list' ? (
        <MaintenanceListView
          items={filtered}
          expandedId={expandedId}
          onToggle={toggleExpand}
          reducedMotion={reducedMotion}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <MaintenancePortfolioCard
              key={item.ticket.id}
              item={item}
              expanded={expandedId === item.ticket.id}
              onToggle={toggleExpand}
              reducedMotion={reducedMotion}
            />
          ))}
        </div>
      )}

      {filtersActive && filtered.length > 0 && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex min-h-11 cursor-pointer items-center px-2 text-sm font-semibold text-primary transition-colors duration-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Clear filters
          </button>
        </div>
      )}

      <CompleteTicketModal
        open={Boolean(completeId && completeTicket)}
        ticket={completeTicket?.ticket ?? null}
        propertyTitle={completeTicket?.property.title}
        contractors={contractors}
        defaultCondition={
          (completeTicket?.assetHealth.condition as AssetCondition | null | undefined) ?? 'Good'
        }
        onClose={() => setCompleteId(null)}
        onComplete={submitCompletion}
      />

      <CreateTicketModal
        open={createOpen}
        onClose={closeCreateModal}
        properties={properties}
        assets={state.internalAssets}
        categories={categories}
        onCreate={onCreate}
      />
    </div>
  )
}
