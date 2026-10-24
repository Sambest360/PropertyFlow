import { useEffect, useMemo, useState } from 'react'
import { matchesResponsibleFilter, type ResponsibleFilter } from '../components/maintenance/TicketResponsibilityCard'
import { checkTicketPhotos } from '../lib/photoLimits'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Plus } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import { scoreAssetHealth } from '../lib/api/ticketsApi'
import { isWarrantyCovered } from '../lib/maintenanceApi'
import { getLookupOptions } from '../lib/lookups'
import type { AssetCondition } from '../data/infrastructure'
import type { MaintenanceTicket } from '../types/domain'
import type { TicketCompletionFields } from '../lib/maintenanceApi'
import { Button, Card, PageHeader } from '../components/ui'
import { ActionButtonRow } from '../components/ActionButtonRow'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'
import { MaintenanceToolbar } from '../components/maintenance/MaintenanceToolbar'
import { MaintenanceListView } from '../components/maintenance/MaintenanceListView'
import { MaintenancePortfolioCard } from '../components/maintenance/MaintenancePortfolioCard'
import {
  MaintenanceBoardView,
  type BoardColumnKey,
} from '../components/maintenance/MaintenanceBoardView'
import { CompleteTicketModal } from '../components/maintenance/CompleteTicketModal'
import { maintenanceCreateHref } from './maintenance/MaintenanceCreatePage'
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
import { listApprovedContractors } from '../lib/contractors'
import { DataRefreshBanner } from '../components/loading/DataRefreshBanner'
import { usePortalHydrating } from '../components/PortalHydrationGate'
import { DataTableSkeleton } from '../components/loading/PageSkeleton'

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
  const dataLoading = usePortalHydrating()
  const {
    state,
    patchMaintenanceTicket,
    updateTicket,
    runEmergencyEscalations,
    addPropertyEvent,
    updateMaintenanceTicketDetails,
  } = useStore()
  const { user, has, agencyId } = useAuth()
  const { allowedPropertyIds, ticketVisible } = usePropertyScope()
  const reducedMotion = usePrefersReducedMotion()
  const alert = useSuiteAlert()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const returnTo = readReturnTo(searchParams)

  const [q, setQ] = useState('')
  const [priority, setPriority] = useState<PriorityFilter>('all')
  const [propertyId, setPropertyId] = useState(() => searchParams.get('property') || 'all')
  const [contractorFilter, setContractorFilter] = useState(() => searchParams.get('contractor') || 'all')
  const [attention, setAttention] = useState<AttentionFilter>('all')
  const [responsible, setResponsible] = useState<ResponsibleFilter>('all')
  const [sort, setSort] = useState<SortKey>('priority')
  const [view, setView] = useState<MaintenanceViewMode>(() => readStoredView())
  const [expandedId, setExpandedId] = useState<string | null>(null)
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
    const contractor = searchParams.get('contractor')
    if (contractor) setContractorFilter(contractor)
    if (ticket) {
      navigate(`/workspace/operations/maintenance/${encodeURIComponent(ticket)}`, {
        replace: true,
      })
    }
    if (searchParams.get('create') === '1') {
      navigate(
        maintenanceCreateHref({
          propertyId: searchParams.get('property') ?? undefined,
          returnTo,
        }),
        { replace: true },
      )
    }
  }, [searchParams, navigate, returnTo])

  const setPropertyFilter = (id: string) => {
    setPropertyId(id)
    const next = new URLSearchParams(searchParams)
    if (id === 'all') next.delete('property')
    else next.set('property', id)
    setSearchParams(next, { replace: true })
  }

  const properties = useMemo(
    () => state.properties.filter((p) => allowedPropertyIds.has(p.id)),
    [state.properties, allowedPropertyIds],
  )

  const contractors = useMemo(
    () => listApprovedContractors(state.agencyContractors, state.users, agencyId),
    [state.agencyContractors, state.users, agencyId],
  )

  const ticketPriorities = useMemo(
    () => getLookupOptions(state.lookups, agencyId, 'TICKET_PRIORITY'),
    [state.lookups, agencyId],
  )

  const portfolio: PortfolioTicket[] = useMemo(() => {
    return state.tickets
      .filter((t) => ticketVisible(t))
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
      .filter((item) => Boolean(item.property))
  }, [
    state.tickets,
    state.properties,
    state.internalAssets,
    state.users,
    ticketVisible,
  ])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let rows = portfolio.filter((item) => {
      const t = item.ticket
      if (priority !== 'all' && t.priority !== priority) return false
      if (propertyId !== 'all' && t.propertyId !== propertyId) return false
      if (contractorFilter !== 'all' && t.contractorId !== contractorFilter) return false

      if (attention === 'open' && !isOpenStatus(t.status)) return false
      if (attention === 'emergency' && t.priority !== 'Emergency') return false
      if (attention === 'escalated' && !t.escalatedAt) return false
      if (attention === 'warranty' && !t.warrantyCovered) return false
      if (attention === 'unassigned' && t.contractorId) return false
      if (!matchesResponsibleFilter(t, responsible)) return false

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
  }, [portfolio, q, priority, propertyId, contractorFilter, attention, responsible, sort])

  const filtersActive =
    Boolean(q.trim()) ||
    priority !== 'all' ||
    propertyId !== 'all' ||
    contractorFilter !== 'all' ||
    attention !== 'all' ||
    responsible !== 'all'

  const clearFilters = () => {
    setQ('')
    setPriority('all')
    setPropertyFilter('all')
    setAttention('all')
    setResponsible('all')
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
    // Same rule as the server (TICKET_PHOTO_INVALID) before anything is saved.
    if (prev && fields.completionPhotoUrls?.length) {
      const check = checkTicketPhotos([...(prev.photoUrls ?? []), ...fields.completionPhotoUrls])
      if (check.ok === false) return `Photos not saved: ${check.reason}.`
    }
    const photoCount = fields.completionPhotoUrls?.length ?? fields.photos
    const result = patchMaintenanceTicket({
      actorUserId: user.id,
      ticketId: completeId,
      patch: {
        status: 'RESOLVED',
        actual_cost: fields.cost,
        resolution_notes: fields.workNotes.trim(),
        contractor_id: fields.contractorId,
        photos: photoCount,
        internal_asset_condition: fields.condition,
      },
    })
    if (result.status === 'ERROR') return result.error
    if (prev && fields.completionPhotoUrls?.length) {
      const merged = [...(prev.photoUrls ?? []), ...fields.completionPhotoUrls]
      updateMaintenanceTicketDetails(completeId, { photoUrls: merged, photos: merged.length })
    }
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

  const createHref = maintenanceCreateHref({
    propertyId: propertyId !== 'all' ? propertyId : undefined,
    returnTo: '/workspace/operations/maintenance',
  })

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
          <ActionButtonRow className="sm:w-auto">
            {has('maintenance.manage') && (
              <Link to={createHref}>
                <Button className="min-h-11 cursor-pointer">
                  <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  Log maintenance
                </Button>
              </Link>
            )}
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
          </ActionButtonRow>
        }
      />

      <DataRefreshBanner active={state.sessionRefreshing} label="Syncing maintenance…" />

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
        responsible={responsible}
        onResponsibleChange={setResponsible}
        sort={sort}
        onSortChange={setSort}
        view={view}
        onViewChange={setView}
        resultLabel={resultLabel}
        reducedMotion={reducedMotion}
        priorities={ticketPriorities}
        onClearFilters={clearFilters}
      />

      {dataLoading ? (
        <DataTableSkeleton />
      ) : portfolio.length === 0 ? (
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
        agencyId={agencyId}
        defaultCondition={
          (completeTicket?.assetHealth.condition as AssetCondition | null | undefined) ?? 'Good'
        }
        onClose={() => setCompleteId(null)}
        onComplete={submitCompletion}
      />
    </div>
  )
}
