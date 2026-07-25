import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronRight,
  Columns3,
  Plus,
} from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAgencyScope, useAuth } from '../context/AuthContext'
import { isFieldAgent } from '../lib/permissions'
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
import { DirectoryStatCard } from '../components/directory/DirectoryStats'
import { Badge, Button, PageHeader, Select, cn, statusTone } from '../components/ui'
import { formatZAR } from '../data/seed'
import type { Lead } from '../types/domain'

const ICON_STROKE = 1.6
const VIEW_KEY = 'propertyflow-crm-view'

const LEAD_STAGES = [
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

const BOARD_STAGES = [
  'New Lead',
  'Contacted',
  'Viewing Scheduled',
  'Viewing Completed',
  'Application Submitted',
  'Credit Check',
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
  const { state, createLead, updateLeadStage } = useStore()
  const { user, has } = useAuth()
  const { scopeAgency, scopeAgent, role, agencyId } = useAgencyScope()
  const reducedMotion = usePrefersReducedMotion()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<LeadView>(() => readLeadView(searchParams.get('view')))
  const [q, setQ] = useState('')
  const [stage, setStage] = useState('all')
  const [type, setType] = useState('all')
  const [channel, setChannel] = useState('all')
  const [attention, setAttention] = useState<AttentionFilter>('all')
  const [sort, setSort] = useState('updated')

  const openLead = (id: string) => {
    navigate(`/workspace/sales/crm/${encodeURIComponent(id)}`)
  }

  useEffect(() => {
    const v = searchParams.get('view')
    if (v === 'list' || v === 'cards' || v === 'board') setView(v)
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

  const portfolio: PortfolioLead[] = useMemo(() => {
    return state.leads
      .filter((l) => {
        if (!scopeAgency(l.agencyId)) return false
        if (isFieldAgent(role) && !scopeAgent(l.agentId)) return false
        return true
      })
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
  }, [state.leads, state.properties, state.users, scopeAgency, scopeAgent, role])

  const channels = useMemo(() => {
    const set = new Set(portfolio.map((p) => p.lead.channel))
    return [...set].sort()
  }, [portfolio])

  const counts = useMemo(() => {
    const neu = portfolio.filter((p) => p.lead.stage === 'New Lead').length
    const active = portfolio.filter((p) => isActiveStage(p.lead.stage)).length
    const closing = portfolio.filter((p) => isClosingStage(p.lead.stage)).length
    return { neu, active, closing, total: portfolio.length }
  }, [portfolio])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let rows = portfolio.filter((item) => {
      const l = item.lead
      if (stage !== 'all' && l.stage !== stage) return false
      if (type !== 'all' && l.type !== type) return false
      if (channel !== 'all' && l.channel !== channel) return false
      if (attention === 'new' && l.stage !== 'New Lead') return false
      if (attention === 'active' && !isActiveStage(l.stage)) return false
      if (attention === 'closing' && !isClosingStage(l.stage)) return false
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
      return b.lead.updatedAt.localeCompare(a.lead.updatedAt)
    })
    return rows
  }, [portfolio, q, stage, type, channel, attention, sort])

  const filtersActive =
    Boolean(q.trim()) || stage !== 'all' || type !== 'all' || channel !== 'all' || attention !== 'all'
  const clearFilters = () => {
    setQ('')
    setStage('all')
    setType('all')
    setChannel('all')
    setAttention('all')
  }

  const createWalkIn = () => {
    const prop = state.properties.find((p) => scopeAgency(p.agencyId))
    if (!prop || !agencyId) return
    const lead = createLead({
      agencyId,
      propertyId: prop.id,
      agentId: isFieldAgent(role) ? user.id : prop.agentId,
      name: 'New walk-in lead',
      email: 'lead@email.com',
      phone: '+27 80 000 0000',
      channel: 'Walk-in',
      type: prop.listingMode === 'sale' ? 'Buy' : 'Rent',
      value: prop.price ?? prop.rent ?? 0,
    })
    openLead(lead.id)
  }

  const advanceBoard = (item: PortfolioLead) => {
    if (!has('leads.manage')) {
      openLead(item.lead.id)
      return
    }
    const idx = BOARD_STAGES.indexOf(item.boardStage as (typeof BOARD_STAGES)[number])
    const next = BOARD_STAGES[Math.min(idx + 1, BOARD_STAGES.length - 1)]
    if (next && next !== item.boardStage) updateLeadStage(item.lead.id, next)
  }

  const resultLabel =
    filtered.length === portfolio.length
      ? `${filtered.length} ${filtered.length === 1 ? 'lead' : 'leads'}`
      : `${filtered.length} of ${portfolio.length} leads`

  return (
    <RequirePermission permission="leads.view">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Leads"
          subtitle="Agency lead ledger — filter, sort, and advance deals."
          actions={
            has('leads.manage') ? (
              <Button className="min-h-11" onClick={createWalkIn}>
                <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                New lead
              </Button>
            ) : null
          }
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DirectoryStatCard
            label="On ledger"
            value={counts.total}
            hint="All leads in scope"
            active={attention === 'all'}
            onClick={() => setAttention('all')}
          />
          <DirectoryStatCard
            label="New"
            value={counts.neu}
            hint="Awaiting first contact"
            active={attention === 'new'}
            onClick={() => setAttention(attention === 'new' ? 'all' : 'new')}
            highlight={counts.neu > 0}
          />
          <DirectoryStatCard
            label="In progress"
            value={counts.active}
            hint="Active pipeline"
            active={attention === 'active'}
            onClick={() => setAttention(attention === 'active' ? 'all' : 'active')}
          />
          <DirectoryStatCard
            label="Closing"
            value={counts.closing}
            hint="Offer through complete"
            active={attention === 'closing'}
            onClick={() => setAttention(attention === 'closing' ? 'all' : 'closing')}
          />
        </section>

        <DirectoryToolbar
          query={q}
          onQueryChange={setQ}
          searchPlaceholder="Filter by name, email, phone, property, or agent…"
          searchLabel="Filter leads"
          view={view === 'board' ? 'list' : view}
          onViewChange={(v) => setViewPersist(v)}
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: 'updated', label: 'Sort: Recently updated' },
            { value: 'name', label: 'Sort: Name' },
            { value: 'value', label: 'Sort: Value' },
            { value: 'stage', label: 'Sort: Stage' },
          ]}
          resultLabel={resultLabel}
          reducedMotion={reducedMotion}
          filters={
            <>
              <Select
                className="min-h-11"
                value={attention}
                onChange={(e) => setAttention(e.target.value as AttentionFilter)}
                aria-label="Focus"
              >
                <option value="all">All leads</option>
                <option value="new">New only</option>
                <option value="active">In progress</option>
                <option value="closing">Closing</option>
              </Select>
              <Select
                className="min-h-11"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                aria-label="Filter by stage"
              >
                <option value="all">All stages</option>
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <Select
                className="min-h-11"
                value={type}
                onChange={(e) => setType(e.target.value)}
                aria-label="Filter by type"
              >
                <option value="all">Buy & rent</option>
                <option value="Buy">Buy</option>
                <option value="Rent">Rent</option>
              </Select>
              <Select
                className="min-h-11"
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
              </Select>
            </>
          }
          extraViews={
            <button
              type="button"
              onClick={() => setViewPersist('board')}
              className={cn(
                'inline-flex min-h-9 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                reducedMotion && 'transition-none',
                view === 'board' ? 'bg-white text-primary shadow-sm' : 'text-ink-500 hover:text-ink',
              )}
              aria-pressed={view === 'board'}
            >
              <Columns3 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Board
            </button>
          }
        />

        {portfolio.length === 0 ? (
          <DirectoryEmpty
            title="No leads in your scope yet"
            hint="Create a walk-in lead or capture one from a listing enquiry."
            action={
              has('leads.manage') ? (
                <Button className="min-h-11" onClick={createWalkIn}>
                  <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  New lead
                </Button>
              ) : null
            }
          />
        ) : filtered.length === 0 ? (
          <DirectoryEmpty
            title="No leads match these filters"
            action={<ClearFiltersButton onClick={clearFilters} reducedMotion={reducedMotion} />}
          />
        ) : view === 'board' ? (
          <LeadBoard
            items={filtered}
            canManage={has('leads.manage')}
            onAdvance={advanceBoard}
            onOpen={openLead}
            reducedMotion={reducedMotion}
          />
        ) : view === 'list' ? (
          <LeadList items={filtered} onOpen={openLead} reducedMotion={reducedMotion} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <LeadCard
                key={item.lead.id}
                item={item}
                onOpen={() => openLead(item.lead.id)}
                reducedMotion={reducedMotion}
              />
            ))}
          </div>
        )}

        {filtersActive && filtered.length > 0 && (
          <div className="mt-4 flex justify-end">
            <ClearFiltersButton onClick={clearFilters} reducedMotion={reducedMotion} />
          </div>
        )}
      </div>
    </RequirePermission>
  )
}

function LeadBoard({
  items,
  canManage,
  onAdvance,
  onOpen,
  reducedMotion,
}: {
  items: PortfolioLead[]
  canManage: boolean
  onAdvance: (item: PortfolioLead) => void
  onOpen: (id: string) => void
  reducedMotion?: boolean
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
      {BOARD_STAGES.map((stage) => {
        const cards = items.filter((i) => i.boardStage === stage)
        return (
          <section key={stage} className="w-72 shrink-0">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-ink">{stage}</h2>
              <span className="tabular text-xs font-semibold text-ink-500">{cards.length}</span>
            </div>
            <ul className="min-h-[20rem] space-y-2 rounded-2xl border border-dashed border-primary-100 bg-primary-50/30 p-2">
              {cards.map((item) => (
                <li key={item.lead.id}>
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
                        <Badge tone={item.lead.type === 'Buy' ? 'accent' : 'info'}>{item.lead.type}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-ink-500">{item.propertyTitle}</p>
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className="text-ink-400">{item.agentName?.split(' ')[0] ?? '—'}</span>
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
                  </div>
                </li>
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
  onOpen,
  reducedMotion,
}: {
  items: PortfolioLead[]
  onOpen: (id: string) => void
  reducedMotion?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.14)]">
      <div className="hidden items-center gap-3 border-b border-primary-50 bg-primary-50/40 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400 xl:flex">
        <span className="w-1.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-[1.4]">Lead</span>
        <span className="min-w-0 flex-[1.2]">Property</span>
        <span className="w-36 shrink-0">Stage</span>
        <span className="w-28 shrink-0">Agent</span>
        <span className="w-24 shrink-0 text-right">Value</span>
        <span className="w-4 shrink-0" aria-hidden />
      </div>
      <ul>
        {items.map((item, index) => {
          const l = item.lead
          const isNew = l.stage === 'New Lead'
          return (
            <li key={l.id} className={cn(index > 0 && 'border-t border-primary-50')}>
              <button
                type="button"
                onClick={() => onOpen(l.id)}
                className={cn(
                  'flex w-full min-h-12 cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors duration-200 hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-5',
                  reducedMotion && 'transition-none',
                )}
              >
                <span
                  className={cn(
                    'h-8 w-1.5 shrink-0 rounded-full',
                    isNew ? 'bg-accent' : 'bg-primary',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 xl:flex xl:flex-[1.4] xl:flex-col">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-ink">{l.name}</span>
                    <Badge tone={l.type === 'Buy' ? 'accent' : 'info'}>{l.type}</Badge>
                  </span>
                  <span className="mt-0.5 block truncate text-xs tabular text-ink-500">
                    {l.phone} · {l.channel}
                    <span className="xl:hidden">
                      {' '}
                      · {item.propertyTitle} · {item.agentName ?? 'Unassigned'}
                    </span>
                  </span>
                </span>
                <span className="hidden min-w-0 flex-[1.2] truncate text-sm text-ink-600 xl:block">
                  {item.propertyTitle}
                </span>
                <span className="hidden w-36 shrink-0 xl:block">
                  <Badge tone={statusTone(l.stage)}>{l.stage}</Badge>
                </span>
                <span className="hidden w-28 shrink-0 truncate text-sm text-ink-500 xl:block">
                  {item.agentName ?? 'Unassigned'}
                </span>
                <span className="w-24 shrink-0 text-right tabular text-sm font-semibold text-ink">
                  {formatZAR(l.value)}
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-ink-300"
                  strokeWidth={ICON_STROKE}
                  aria-hidden
                />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function LeadCard({
  item,
  onOpen,
  reducedMotion,
}: {
  item: PortfolioLead
  onOpen: () => void
  reducedMotion?: boolean
}) {
  const l = item.lead
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full cursor-pointer rounded-[1.25rem] border border-primary-100/80 bg-white p-4 text-left shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] transition-shadow duration-200 hover:shadow-[0_14px_28px_-16px_rgba(15,39,68,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        reducedMotion && 'transition-none',
      )}
    >
      <div className="flex items-start gap-3">
        <PersonAvatar name={l.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate font-semibold text-ink">{l.name}</h3>
            <Badge tone={statusTone(l.stage)}>{l.stage}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-ink-500">{item.propertyTitle}</p>
          <p className="mt-2 tabular text-lg font-semibold text-ink">{formatZAR(l.value)}</p>
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-primary-50 pt-3">
            <Badge tone={l.type === 'Buy' ? 'accent' : 'info'}>{l.type}</Badge>
            <Badge tone="neutral">{l.channel}</Badge>
            <span className="text-xs font-medium text-ink-500">{item.agentName ?? 'Unassigned'}</span>
          </div>
        </div>
      </div>
    </button>
  )
}
