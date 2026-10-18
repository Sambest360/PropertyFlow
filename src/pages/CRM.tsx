import { useEffect, useMemo, useRef, useState, Fragment } from 'react'
import { acquireSubmitLock, releaseSubmitLock } from '../lib/wizardSubmitGuard'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Archive,
  ChevronDown,
  Columns3,
  Plus,
} from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import { RequirePermission } from '../components/RequirePermission'
import {
  ClearFiltersButton,
  DirectoryEmpty,
  DirectoryToolbar,
  PersonAvatar,
  readDirectoryView,
  type DirectoryViewMode,
} from '../components/directory/DirectoryToolbar'
import { DirectoryFilterSelect } from '../components/directory/DirectoryFilters'
import { DirectoryStatCard } from '../components/directory/DirectoryStats'
import { ActionButtonRow } from '../components/ActionButtonRow'
import { Badge, Button, PageHeader, cn, statusTone } from '../components/ui'
import { AgentAssigneeText } from '../components/detail/FlatFields'
import { appendAgentMetaRow } from '../lib/agentDisplay'
import { useAgentDisplay, useHideAgentColumn } from '../hooks/useAgentDisplay'
import { formatZAR } from '../data/seed'
import {
  formatLeadTime,
  canCloseLead,
  isClosedLeadStage,
  isOpenLeadStage,
  type ClosedLeadStage,
} from '../lib/leadLifecycle'
import { CloseLeadModal } from '../components/lead-detail/CloseLeadModal'
import { CrmLeadContactBar } from '../components/lead-detail/CrmLeadContactBar'
import { CrmLeadViewingBar } from '../components/lead-detail/CrmLeadViewingBar'
import { LeadCsvImportPanel } from '../components/syndication/LeadCsvImportPanel'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'
import { leadContactLine } from '../lib/displayIds'
import type { Lead, PropertyAsset } from '../types/domain'
import { useLookupOptions } from '../hooks/useLookupOptions'

const ICON_STROKE = 1.6
const VIEW_KEY = 'propertyflow-crm-view'

const FALLBACK_LEAD_STAGES = [
  'New Lead',
  'Contacted',
  'Viewing Scheduled',
  'Viewing Completed',
  'Application Submitted',
  'Offer Sent',
  'Deposit Paid',
  'Lease Signed',
  'Sale Completed',
] as const

type LeadView = DirectoryViewMode | 'board'

type PortfolioLead = {
  lead: Lead
  propertyTitle: string
  propertySuburb: string
  agentName: string | null
  boardStage: string
}

type AttentionFilter = 'all' | 'new' | 'active' | 'closing'
type LeadTab = 'active' | 'history'

function boardStageFor(stage: string) {
  if (['Credit Check', 'Documents Verified', 'Approved'].includes(stage)) return 'Credit Check'
  if (['Lease Signed', 'Offer Accepted'].includes(stage)) return 'Lease Signed'
  return stage
}

function readLeadView(searchView: string | null): LeadView {
  if (searchView === 'list' || searchView === 'cards' || searchView === 'board') return searchView
  try {
    const v = localStorage.getItem(VIEW_KEY)
    if (v === 'list' || v === 'cards' || v === 'board') return v
  } catch {
    /* ignore */
  }
  return readDirectoryView(VIEW_KEY, 'list')
}

function isClosingStage(stage: string) {
  return ['Offer Sent', 'Deposit Paid', 'Lease Signed', 'Sale Completed'].includes(stage)
}

function isActiveStage(stage: string) {
  return !['New Lead', 'Rejected', 'Lease Signed', 'Sale Completed'].includes(stage)
}

export default function CRM() {
  const { state, createLead, updateLeadStage, closeLead, addPropertyEvent } = useStore()
  const { user, has } = useAuth()
  const { dealVisible, allowedPropertyIds, agencyId, canMutate } = usePropertyScope()
  const reducedMotion = usePrefersReducedMotion()
  const navigate = useNavigate()
  const alert = useSuiteAlert()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<LeadView>(() => readLeadView(searchParams.get('view')))
  const [q, setQ] = useState('')
  const [stage, setStage] = useState('all')
  const [type, setType] = useState('all')
  const [channel, setChannel] = useState('all')
  const [attention, setAttention] = useState<AttentionFilter>('all')
  const [leadTab, setLeadTab] = useState<LeadTab>(() =>
    searchParams.get('tab') === 'history' ? 'history' : 'active',
  )
  const [sort, setSort] = useState('created')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [closeTarget, setCloseTarget] = useState<PortfolioLead | null>(null)
  const hideAgentColumn = useHideAgentColumn()
  const walkInLockRef = useRef(false)
  const [walkInBusy, setWalkInBusy] = useState(false)

  const canManageLeads = has('leads.manage')
  const mayCloseLead = (lead: Lead) =>
    canCloseLead(lead, { userId: user.id, canManageLeads })

  const leadStageOptions = useLookupOptions('LEAD_STAGE', agencyId)
  const leadStages = useMemo(() => {
    const values = leadStageOptions.map((o) => o.value)
    return values.length ? values : [...FALLBACK_LEAD_STAGES]
  }, [leadStageOptions])
  const boardStages = leadStages

  const openLead = (id: string) => {
    navigate(`/workspace/sales/crm/${encodeURIComponent(id)}`)
  }

  const toggleExpand = (item: PortfolioLead) => {
    setExpandedId((id) => (id === item.lead.id ? null : item.lead.id))
  }

  useEffect(() => {
    const v = searchParams.get('view')
    if (v === 'list' || v === 'cards' || v === 'board') setView(v)
  }, [searchParams])

  useEffect(() => {
    if (searchParams.get('tab') === 'history') setLeadTab('history')
    else if (searchParams.get('tab') === 'active') setLeadTab('active')
  }, [searchParams])

  const setViewPersist = (next: LeadView) => {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      /* ignore */
    }
    const params = new URLSearchParams(searchParams)
    if (next === 'board') params.set('view', 'board')
    else params.delete('view')
    setSearchParams(params, { replace: true })
  }

  const setLeadTabPersist = (tab: LeadTab) => {
    setLeadTab(tab)
    setExpandedId(null)
    if (tab === 'history' && view === 'board') setViewPersist('list')
    const params = new URLSearchParams(searchParams)
    if (tab === 'history') params.set('tab', 'history')
    else params.delete('tab')
    setSearchParams(params, { replace: true })
  }

  const portfolio: PortfolioLead[] = useMemo(() => {
    return state.leads
      .filter((l) => dealVisible(l))
      .map((lead) => {
        const property = state.properties.find((p) => p.id === lead.propertyId)
        const agent = lead.agentId ? state.users.find((u) => u.id === lead.agentId) : null
        return {
          lead,
          propertyTitle: property?.title ?? lead.propertyId,
          propertySuburb: property ? `${property.suburb}, ${property.city}` : '—',
          agentName: agent?.name ?? null,
          boardStage: boardStageFor(lead.stage),
        }
      })
  }, [state.leads, state.properties, state.users, dealVisible])

  const propertyById = useMemo(
    () => new Map(state.properties.map((p) => [p.id, p])),
    [state.properties],
  )
  const propertyForLead = (lead: Lead): PropertyAsset | null =>
    propertyById.get(lead.propertyId) ?? null

  const channels = useMemo(() => {
    const set = new Set(portfolio.map((p) => p.lead.channel))
    return [...set].sort()
  }, [portfolio])

  const counts = useMemo(() => {
    const open = portfolio.filter((p) => isOpenLeadStage(p.lead.stage))
    const closed = portfolio.filter((p) => isClosedLeadStage(p.lead.stage))
    const neu = open.filter((p) => p.lead.stage === 'New Lead').length
    const active = open.filter((p) => isActiveStage(p.lead.stage)).length
    const closing = open.filter((p) => isClosingStage(p.lead.stage)).length
    return {
      neu,
      active,
      closing,
      open: open.length,
      closed: closed.length,
      total: portfolio.length,
    }
  }, [portfolio])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let rows = portfolio.filter((item) => {
      const l = item.lead
      const inTab =
        leadTab === 'active' ? isOpenLeadStage(l.stage) : isClosedLeadStage(l.stage)
      if (!inTab) return false
      if (stage !== 'all' && l.stage !== stage) return false
      if (type !== 'all' && l.type !== type) return false
      if (channel !== 'all' && l.channel !== channel) return false
      if (leadTab === 'active') {
        if (attention === 'new' && l.stage !== 'New Lead') return false
        if (attention === 'active' && !isActiveStage(l.stage)) return false
        if (attention === 'closing' && !isClosingStage(l.stage)) return false
      }
      if (!needle) return true
      const hay = [l.name, l.email, l.phone, l.id, item.propertyTitle, item.agentName, l.channel, l.stage]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
    rows = [...rows].sort((a, b) => {
      if (sort === 'name') return a.lead.name.localeCompare(b.lead.name)
      if (sort === 'value') return b.lead.value - a.lead.value
      if (sort === 'stage') return a.lead.stage.localeCompare(b.lead.stage)
      if (sort === 'updated') return b.lead.updatedAt.localeCompare(a.lead.updatedAt)
      return b.lead.createdAt.localeCompare(a.lead.createdAt)
    })
    return rows
  }, [portfolio, q, stage, type, channel, attention, sort, leadTab])

  const filtersActive =
    Boolean(q.trim()) || stage !== 'all' || type !== 'all' || channel !== 'all' || attention !== 'all'
  const activeFilterCount =
    (stage !== 'all' ? 1 : 0) +
    (type !== 'all' ? 1 : 0) +
    (channel !== 'all' ? 1 : 0) +
    (attention !== 'all' ? 1 : 0) +
    (sort !== 'created' ? 1 : 0)
  const clearFilters = () => {
    setQ('')
    setStage('all')
    setType('all')
    setChannel('all')
    setAttention('all')
  }

  const createWalkIn = () => {
    if (!acquireSubmitLock(walkInLockRef)) return
    setWalkInBusy(true)
    try {
      const prop = state.properties.find((p) => allowedPropertyIds.has(p.id))
      if (!prop || !agencyId || !canMutate(prop.id)) return
      const lead = createLead({
        agencyId,
        propertyId: prop.id,
        agentId: prop.agentId ?? user.id,
        name: 'New walk-in lead',
        email: 'lead@email.com',
        phone: '+27 80 000 0000',
        channel: 'Walk-in',
        type: prop.listingMode === 'sale' ? 'Buy' : 'Rent',
        value: prop.price ?? prop.rent ?? 0,
      })
      openLead(lead.id)
    } finally {
      setWalkInBusy(false)
      releaseSubmitLock(walkInLockRef)
    }
  }

  const advanceBoard = (item: PortfolioLead) => {
    if (!canManageLeads) {
      openLead(item.lead.id)
      return
    }
    const idx = boardStages.indexOf(item.boardStage)
    const next = boardStages[Math.min(idx < 0 ? 0 : idx + 1, boardStages.length - 1)]
    if (next && next !== item.boardStage) updateLeadStage(item.lead.id, next)
  }

  const submitCloseLead = (input: { stage: ClosedLeadStage; reason: string }) => {
    if (!closeTarget) return
    const prev = closeTarget.lead
    const result = closeLead(prev.id, input)
    if (result.ok === false) {
      void alert.success({ title: 'Could not close lead', text: result.reason, tone: 'danger' })
      return
    }
    addPropertyEvent({
      agencyId: prev.agencyId,
      propertyId: prev.propertyId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'closed a Lead',
      changes: [
        { field: 'Stage', from: prev.stage, to: result.stage },
        { field: 'Reason', from: '—', to: input.reason },
      ],
    })
    if (expandedId === prev.id) setExpandedId(null)
    void alert.success({
      title: 'Lead closed',
      text: `${prev.name} was moved to History as ${result.stage.toLowerCase()}.`,
    })
    setCloseTarget(null)
  }

  const resultLabel =
    filtered.length === (leadTab === 'active' ? counts.open : counts.closed)
      ? `${filtered.length} ${filtered.length === 1 ? 'lead' : 'leads'}`
      : `${filtered.length} of ${leadTab === 'active' ? counts.open : counts.closed} leads`

  return (
    <RequirePermission permission="leads.view">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Leads"
          subtitle="Early enquiries before they become applicants — filter, sort, or use the board."
          actions={
            has('leads.manage') ? (
              <Button className="min-h-11" disabled={walkInBusy} onClick={createWalkIn}>
                <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                New lead
              </Button>
            ) : null
          }
        />

        <LeadCsvImportPanel
          canImport={has('leads.manage')}
          leads={state.leads}
          properties={state.properties}
          agencyId={agencyId}
          onCreateLead={(draft) =>
            createLead({
              agencyId: draft.agencyId,
              propertyId: draft.propertyId,
              agentId: draft.agentId,
              name: draft.name,
              email: draft.email,
              phone: draft.phone,
              channel: draft.channel,
              source: draft.source,
              externalId: draft.externalId,
              type: draft.type,
              value: draft.value,
              notes: draft.notes,
              stage: draft.stage,
            })
          }
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <DirectoryStatCard
            label="Active"
            value={counts.open}
            hint="Open enquiries"
            active={leadTab === 'active' && attention === 'all'}
            onClick={() => {
              setLeadTabPersist('active')
              setAttention('all')
            }}
          />
          <DirectoryStatCard
            label="New"
            value={counts.neu}
            hint="Awaiting first contact"
            active={leadTab === 'active' && attention === 'new'}
            onClick={() => {
              setLeadTabPersist('active')
              setAttention(attention === 'new' ? 'all' : 'new')
            }}
            highlight={counts.neu > 0}
          />
          <DirectoryStatCard
            label="In progress"
            value={counts.active}
            hint="Being worked"
            active={leadTab === 'active' && attention === 'active'}
            onClick={() => {
              setLeadTabPersist('active')
              setAttention(attention === 'active' ? 'all' : 'active')
            }}
          />
          <DirectoryStatCard
            label="Closing"
            value={counts.closing}
            hint="Offer through complete"
            active={leadTab === 'active' && attention === 'closing'}
            onClick={() => {
              setLeadTabPersist('active')
              setAttention(attention === 'closing' ? 'all' : 'closing')
            }}
          />
          <DirectoryStatCard
            label="History"
            value={counts.closed}
            hint="Completed or rejected"
            active={leadTab === 'history'}
            onClick={() => setLeadTabPersist(leadTab === 'history' ? 'active' : 'history')}
          />
        </section>

        <DirectoryToolbar
          query={q}
          onQueryChange={setQ}
          searchPlaceholder="Search leads…"
          searchLabel="Filter leads"
          view={view === 'board' ? 'list' : view}
          onViewChange={(v) => setViewPersist(v)}
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: 'created', label: 'Newest first' },
            { value: 'updated', label: 'Recently updated' },
            { value: 'name', label: 'Name' },
            { value: 'value', label: 'Value' },
            { value: 'stage', label: 'Stage' },
          ]}
          resultLabel={resultLabel}
          reducedMotion={reducedMotion}
          activeFilterCount={activeFilterCount}
          onClearFilters={clearFilters}
          filters={
            <>
              <DirectoryFilterSelect
                value={attention}
                onChange={(e) => setAttention(e.target.value as AttentionFilter)}
                aria-label="Focus"
                disabled={leadTab === 'history'}
              >
                <option value="all">All leads</option>
                <option value="new">New only</option>
                <option value="active">In progress</option>
                <option value="closing">Closing</option>
              </DirectoryFilterSelect>
              <DirectoryFilterSelect
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                aria-label="Filter by stage"
              >
                <option value="all">All stages</option>
                {leadStageOptions.length
                  ? leadStageOptions.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))
                  : leadStages.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
              </DirectoryFilterSelect>
              <DirectoryFilterSelect
                value={type}
                onChange={(e) => setType(e.target.value)}
                aria-label="Filter by type"
              >
                <option value="all">Buy & rent</option>
                <option value="Buy">Buy</option>
                <option value="Rent">Rent</option>
              </DirectoryFilterSelect>
              <DirectoryFilterSelect
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                aria-label="Filter by channel"
              >
                <option value="all">All channels</option>
                {channels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </DirectoryFilterSelect>
            </>
          }
          extraViews={
            leadTab === 'active' ? (
              <button
                type="button"
                onClick={() => setViewPersist('board')}
                className={cn(
                  'inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-2.5',
                  reducedMotion && 'transition-none',
                  view === 'board' ? 'bg-white text-primary shadow-sm' : 'text-ink-500 hover:text-ink',
                )}
                aria-pressed={view === 'board'}
                aria-label="Board view"
                title="Board"
              >
                <Columns3 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                <span className="hidden sm:inline">Board</span>
              </button>
            ) : null
          }
        />

        {portfolio.length === 0 ? (
          <DirectoryEmpty
            title="No leads in your scope yet"
            hint="Create a walk-in lead or capture one from a listing enquiry."
            action={
              has('leads.manage') ? (
                <Button className="min-h-11" disabled={walkInBusy} onClick={createWalkIn}>
                  <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  New lead
                </Button>
              ) : null
            }
          />
        ) : filtered.length === 0 ? (
          <DirectoryEmpty
            title={leadTab === 'history' ? 'No leads in history yet' : 'No leads match these filters'}
            hint={
              leadTab === 'history'
                ? 'Completed and rejected leads appear here once a deal is closed.'
                : undefined
            }
            action={
              leadTab === 'active' ? (
                <ClearFiltersButton onClick={clearFilters} reducedMotion={reducedMotion} />
              ) : null
            }
          />
        ) : view === 'board' && leadTab === 'active' ? (
          <LeadBoard
            items={filtered}
            stages={boardStages}
            canManage={canManageLeads}
            mayClose={mayCloseLead}
            onClose={(item) => setCloseTarget(item)}
            onAdvance={advanceBoard}
            onOpen={openLead}
            reducedMotion={reducedMotion}
          />
        ) : view === 'list' ? (
          <LeadList
            items={filtered}
            expandedId={expandedId}
            onToggle={toggleExpand}
            mayClose={mayCloseLead}
            onClose={(item) => setCloseTarget(item)}
            reducedMotion={reducedMotion}
            hideAgentColumn={hideAgentColumn}
            timeField={leadTab === 'history' ? 'updatedAt' : 'createdAt'}
            timeLabel={leadTab === 'history' ? 'Closed' : 'Received'}
            propertyForLead={propertyForLead}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <LeadCard
                key={item.lead.id}
                item={item}
                property={propertyForLead(item.lead)}
                onOpen={() => openLead(item.lead.id)}
                mayClose={mayCloseLead(item.lead)}
                onClose={() => setCloseTarget(item)}
                reducedMotion={reducedMotion}
                hideAgent={hideAgentColumn}
                timeField={leadTab === 'history' ? 'updatedAt' : 'createdAt'}
              />
            ))}
          </div>
        )}

        <CloseLeadModal
          open={Boolean(closeTarget)}
          leadName={closeTarget?.lead.name ?? ''}
          leadType={closeTarget?.lead.type ?? 'Rent'}
          onClose={() => setCloseTarget(null)}
          onConfirm={submitCloseLead}
        />

        {filtersActive && filtered.length > 0 && (
          <div className="mt-4 flex justify-end">
            <ClearFiltersButton onClick={clearFilters} reducedMotion={reducedMotion} />
          </div>
        )}
      </div>
    </RequirePermission>
  )
}

function LeadBoardCard({
  item,
  canManage,
  mayClose,
  onClose,
  onAdvance,
  onOpen,
  reducedMotion,
}: {
  item: PortfolioLead
  canManage: boolean
  mayClose: (lead: Lead) => boolean
  onClose: (item: PortfolioLead) => void
  onAdvance: (item: PortfolioLead) => void
  onOpen: (id: string) => void
  reducedMotion?: boolean
}) {
  const { label: agentLabel } = useAgentDisplay()
  const agentShort = agentLabel(item.lead.agentId, item.agentName)?.split(' ')[0]
  return (
    <li>
      <div
        className={cn(
          'rounded-xl border border-primary-100 bg-white p-3 transition-colors duration-150 hover:border-primary-200',
          reducedMotion && 'transition-none',
        )}
      >
        <button
          type="button"
          onClick={() => onOpen(item.lead.id)}
          className="w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-ink">{item.lead.name}</p>
            <Badge tone={statusTone(item.lead.stage)}>{item.lead.stage}</Badge>
            <span className="text-[10px] text-ink-500">{item.lead.type}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-ink-500">{item.propertyTitle}</p>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-ink-400">{agentShort}</span>
            <span className="tabular font-semibold text-ink">{formatZAR(item.lead.value)}</span>
          </div>
        </button>
        {canManage && (
          <button
            type="button"
            className="mt-2 min-h-11 text-[10px] font-semibold uppercase tracking-wide text-primary hover:underline"
            onClick={() => onAdvance(item)}
          >
            Advance stage
          </button>
        )}
        {mayClose(item.lead) && (
          <button
            type="button"
            className="mt-1 min-h-11 text-[10px] font-semibold uppercase tracking-wide text-accent hover:underline"
            onClick={() => onClose(item)}
          >
            Close lead
          </button>
        )}
      </div>
    </li>
  )
}

function LeadBoard({
  items,
  stages,
  canManage,
  mayClose,
  onClose,
  onAdvance,
  onOpen,
  reducedMotion,
}: {
  items: PortfolioLead[]
  stages: string[]
  canManage: boolean
  mayClose: (lead: Lead) => boolean
  onClose: (item: PortfolioLead) => void
  onAdvance: (item: PortfolioLead) => void
  onOpen: (id: string) => void
  reducedMotion?: boolean
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
      {stages.map((stage) => {
        const cards = items.filter((i) => i.boardStage === stage)
        return (
          <section key={stage} className="w-72 shrink-0">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-ink">{stage}</h2>
              <span className="tabular text-xs font-semibold text-ink-500">{cards.length}</span>
            </div>
            <ul className="min-h-[20rem] space-y-2 rounded-2xl border border-dashed border-primary-100 bg-primary-50/30 p-2">
              {cards.map((item) => (
                <LeadBoardCard
                  key={item.lead.id}
                  item={item}
                  canManage={canManage}
                  mayClose={mayClose}
                  onClose={onClose}
                  onAdvance={onAdvance}
                  onOpen={onOpen}
                  reducedMotion={reducedMotion}
                />
              ))}
              {cards.length === 0 && (
                <li className="px-3 py-8 text-center text-xs text-ink-400">Empty stage</li>
              )}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function LeadList({
  items,
  expandedId,
  onToggle,
  mayClose,
  onClose,
  reducedMotion,
  hideAgentColumn,
  timeField,
  timeLabel,
  propertyForLead,
}: {
  items: PortfolioLead[]
  expandedId: string | null
  onToggle: (item: PortfolioLead) => void
  mayClose: (lead: Lead) => boolean
  onClose: (item: PortfolioLead) => void
  reducedMotion?: boolean
  hideAgentColumn?: boolean
  timeField: 'createdAt' | 'updatedAt'
  timeLabel: string
  propertyForLead: (lead: Lead) => PropertyAsset | null
}) {
  const colSpan = hideAgentColumn ? 6 : 7
  return (
    <>
      <div className="hidden overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] md:block">
        <div className="max-h-[min(78vh,56rem)] overflow-auto [scrollbar-width:thin]">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-[1] bg-white/95 backdrop-blur-md">
              <tr className="border-b border-primary-100 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                <th className="w-10 px-3 py-3" aria-hidden />
                <th className="px-4 py-3 font-semibold">Lead</th>
                <th className="px-3 py-3 font-semibold">Property</th>
                <th className="px-3 py-3 font-semibold">Stage</th>
                <th className="px-3 py-3 font-semibold">{timeLabel}</th>
                {!hideAgentColumn ? <th className="px-3 py-3 font-semibold">Agent</th> : null}
                <th className="px-4 py-3 font-semibold text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const l = item.lead
                const expanded = expandedId === l.id
                const isNew = l.stage === 'New Lead'
                return (
                  <Fragment key={l.id}>
                    <tr
                      className={cn(
                        'border-b border-primary-50',
                        expanded && 'border-b-0 bg-primary-100',
                      )}
                    >
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          aria-expanded={expanded}
                          aria-label={expanded ? 'Collapse lead details' : 'Expand lead details'}
                          className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-xl text-ink-400 transition-colors duration-200 hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                              expanded && 'rotate-180',
                              reducedMotion && 'transition-none',
                            )}
                            strokeWidth={ICON_STROKE}
                            aria-hidden
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="group flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <span
                            className={cn(
                              'h-8 w-1.5 shrink-0 rounded-full',
                              isNew ? 'bg-accent' : 'bg-primary',
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate font-semibold text-ink group-hover:text-primary">
                                {l.name}
                              </span>
                              <span className="text-xs text-ink-500">{l.type}</span>
                            </span>
                            <span className="mt-0.5 block truncate text-xs tabular text-ink-500">
                              {l.phone} · {l.channel} · {formatLeadTime(l.createdAt, 'relative')}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="w-full min-h-11 cursor-pointer truncate text-left text-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {item.propertyTitle}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Badge tone={statusTone(l.stage)}>{l.stage}</Badge>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="w-full min-h-11 cursor-pointer truncate text-left text-xs tabular text-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          title={formatLeadTime(l[timeField], 'absolute')}
                        >
                          {formatLeadTime(l[timeField], 'relative')}
                        </button>
                      </td>
                      {!hideAgentColumn ? (
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => onToggle(item)}
                            className="w-full min-h-11 cursor-pointer truncate text-left text-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <AgentAssigneeText agentId={l.agentId} agentName={item.agentName} />
                          </button>
                        </td>
                      ) : null}
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="w-full cursor-pointer text-right tabular font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {formatZAR(l.value)}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-primary-100 bg-primary-50/60">
                        <td colSpan={colSpan} className="px-4 py-4 sm:px-5">
                          <LeadExpansion
                            item={item}
                            property={propertyForLead(item.lead)}
                            reducedMotion={reducedMotion}
                            mayClose={mayClose(item.lead)}
                            onClose={() => onClose(item)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="space-y-2 md:hidden">
        {items.map((item) => {
          const l = item.lead
          const expanded = expandedId === l.id
          return (
            <li
              key={l.id}
              className={cn(
                'overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.14)]',
                expanded && 'border-primary-200 bg-primary-50/40',
              )}
            >
              <button
                type="button"
                onClick={() => onToggle(item)}
                aria-expanded={expanded}
                className="flex w-full min-h-14 cursor-pointer items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{l.name}</span>
                    <Badge tone={statusTone(l.stage)}>{l.stage}</Badge>
                  </span>
                  <span className="mt-1 block truncate text-xs text-ink-500">
                    {item.propertyTitle} · {formatLeadTime(l[timeField], 'relative')}
                  </span>
                </span>
                <span className="shrink-0 tabular text-sm font-semibold text-ink">
                  {formatZAR(l.value)}
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-ink-400 transition-transform duration-300',
                    expanded && 'rotate-180',
                    reducedMotion && 'transition-none',
                  )}
                  strokeWidth={ICON_STROKE}
                  aria-hidden
                />
              </button>
              {expanded && (
                <div className="border-t border-primary-100/80 px-4 py-4">
                  <LeadExpansion
                    item={item}
                    property={propertyForLead(item.lead)}
                    reducedMotion={reducedMotion}
                    mayClose={mayClose(item.lead)}
                    onClose={() => onClose(item)}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function LeadExpansion({
  item,
  property,
  reducedMotion,
  mayClose,
  onClose,
}: {
  item: PortfolioLead
  property: PropertyAsset | null
  reducedMotion?: boolean
  mayClose?: boolean
  onClose?: () => void
}) {
  const l = item.lead
  const detailTo = `/workspace/sales/crm/${encodeURIComponent(l.id)}`
  const { viewerId } = useAgentDisplay()
  const metaRows: Array<{ label: string; value: string }> = appendAgentMetaRow(
    [
      { label: 'Email', value: l.email },
      { label: 'Phone', value: l.phone },
      { label: 'Property', value: item.propertyTitle },
      { label: 'Area', value: item.propertySuburb },
      { label: 'Stage', value: l.stage },
      { label: 'Type', value: l.type },
      { label: 'Channel', value: l.channel },
      { label: 'Received', value: formatLeadTime(l.createdAt) },
      { label: 'Updated', value: formatLeadTime(l.updatedAt) },
      { label: 'Value', value: formatZAR(l.value) },
    ],
    viewerId,
    l.agentId,
    item.agentName,
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-3">
          <PersonAvatar name={l.name} />
          <div className="min-w-0">
            <p className="font-display text-2xl font-semibold tracking-tight text-ink">{l.name}</p>
            <p className="truncate text-sm text-ink-500">{leadContactLine(l)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge tone={statusTone(l.stage)}>{l.stage}</Badge>
          <span className="text-xs text-ink-500">{l.type}</span>
        </div>
      </div>
      <div className="min-w-0">
        <dl className="grid gap-2 sm:grid-cols-2">
          {metaRows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                {row.label}
              </dt>
              <dd className="mt-0.5 truncate text-sm font-semibold tabular text-ink" title={row.value}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        <ActionButtonRow className={cn('mt-4 border-t border-primary-100/80 pt-4', reducedMotion && 'transition-none')}>
          <CrmLeadContactBar lead={l} property={property} compact />
          <CrmLeadViewingBar lead={l} property={property} compact />
          <Link to={detailTo} className="inline-flex">
            <Button className="min-h-11 cursor-pointer gap-2 rounded-2xl">
              Open lead
              <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            </Button>
          </Link>
          {mayClose && onClose ? (
            <Button
              variant="secondary"
              className="min-h-11 cursor-pointer gap-2 rounded-2xl text-accent"
              onClick={onClose}
            >
              <Archive className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Close lead
            </Button>
          ) : null}
        </ActionButtonRow>
      </div>
    </div>
  )
}

function LeadCard({
  item,
  property,
  onOpen,
  mayClose,
  onClose,
  reducedMotion,
  hideAgent,
  timeField,
}: {
  item: PortfolioLead
  property: PropertyAsset | null
  onOpen: () => void
  mayClose?: boolean
  onClose?: () => void
  reducedMotion?: boolean
  hideAgent?: boolean
  timeField: 'createdAt' | 'updatedAt'
}) {
  const l = item.lead
  const { label: agentLabel } = useAgentDisplay()
  const agent = hideAgent ? null : agentLabel(l.agentId, item.agentName)
  return (
    <div
      className={cn(
        'relative rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] transition-shadow duration-200 hover:shadow-[0_14px_28px_-16px_rgba(15,39,68,0.28)]',
        reducedMotion && 'transition-none',
      )}
    >
      {mayClose && onClose ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="absolute right-3 top-3 z-10 inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-semibold text-accent transition-colors duration-200 hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Close lead ${l.name}`}
        >
          <Archive className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
          Close
        </button>
      ) : null}
      <button
        type="button"
        onClick={onOpen}
        className="w-full cursor-pointer p-4 pr-20 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
      <div className="flex items-start gap-3">
        <PersonAvatar name={l.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate font-semibold text-ink">{l.name}</h3>
            <Badge tone={statusTone(l.stage)}>{l.stage}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-ink-500">{item.propertyTitle}</p>
          <p className="mt-1 text-xs tabular text-ink-400">
            {formatLeadTime(l[timeField], 'relative')}
          </p>
          <p className="mt-2 tabular text-lg font-semibold text-ink">{formatZAR(l.value)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-primary-50 pt-3 text-xs text-ink-500">
            <span>{l.type}</span>
            <span aria-hidden>·</span>
            <span>{l.channel}</span>
            {agent ? (
              <>
                <span aria-hidden>·</span>
                <span>{agent}</span>
              </>
            ) : null}
          </div>
          <span className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary">
            Open lead
            <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          </span>
        </div>
      </div>
      </button>
      <div className="flex flex-wrap items-center gap-2 border-t border-primary-50 px-4 py-3">
        <CrmLeadContactBar lead={l} property={property} compact />
        <CrmLeadViewingBar lead={l} property={property} compact />
      </div>
    </div>
  )
}
