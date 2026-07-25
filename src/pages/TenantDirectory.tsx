import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAgencyScope } from '../context/AuthContext'
import { isFieldAgent } from '../lib/permissions'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import { RequirePermission } from '../components/RequirePermission'
import {
  ClearFiltersButton,
  DirectoryEmpty,
  DirectoryToolbar,
  PersonAvatar,
  useDirectoryView,
} from '../components/directory/DirectoryToolbar'
import { DirectoryStatCard } from '../components/directory/DirectoryStats'
import { Badge, PageHeader, Select, cn, statusTone } from '../components/ui'
import { formatZAR } from '../data/seed'
import type { Tenancy } from '../types/domain'

const ICON_STROKE = 1.6
const VIEW_KEY = 'propertyflow-occupants-view'

type PortfolioOccupant = {
  tenancy: Tenancy
  propertyTitle: string
  propertyArea: string
  agentName: string | null
}

type AttentionFilter = 'all' | 'active' | 'ending' | 'pending'

function daysUntil(date: string | null | undefined) {
  if (!date) return null
  const end = new Date(date)
  if (Number.isNaN(end.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - today.getTime()) / 86400000)
}

export default function TenantDirectory() {
  const { state } = useStore()
  const { scopeAgency, scopeAgent, role } = useAgencyScope()
  const reducedMotion = usePrefersReducedMotion()
  const [view, setView] = useDirectoryView(VIEW_KEY)
  const [q, setQ] = useState('')
  const [attention, setAttention] = useState<AttentionFilter>('all')
  const [sort, setSort] = useState('name')
  const navigate = useNavigate()
  const openOccupant = (id: string) => {
    navigate(`/workspace/people/tenants/${encodeURIComponent(id)}`)
  }

  const portfolio: PortfolioOccupant[] = useMemo(() => {
    return state.tenancies
      .filter((t) => {
        if (!scopeAgency(t.agencyId)) return false
        if (isFieldAgent(role) && !scopeAgent(t.agentId)) return false
        return true
      })
      .map((tenancy) => {
        const property = state.properties.find((p) => p.id === tenancy.propertyId)
        const agent = tenancy.agentId ? state.users.find((u) => u.id === tenancy.agentId) : null
        return {
          tenancy,
          propertyTitle: property?.title ?? tenancy.propertyId,
          propertyArea: property ? `${property.suburb}, ${property.city}` : '—',
          agentName: agent?.name ?? null,
        }
      })
  }, [state.tenancies, state.properties, state.users, scopeAgency, scopeAgent, role])

  const counts = useMemo(() => {
    const active = portfolio.filter((p) => /active|occupied|current/i.test(p.tenancy.status)).length
    const ending = portfolio.filter((p) => {
      const d = daysUntil(p.tenancy.endDate)
      return d != null && d >= 0 && d <= 60
    }).length
    const pending = portfolio.filter((p) => /pending|incoming|move/i.test(p.tenancy.status)).length
    return { active, ending, pending, total: portfolio.length }
  }, [portfolio])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let rows = portfolio.filter((item) => {
      const status = item.tenancy.status
      if (attention === 'active' && !/active|occupied|current/i.test(status)) return false
      if (attention === 'pending' && !/pending|incoming|move/i.test(status)) return false
      if (attention === 'ending') {
        const d = daysUntil(item.tenancy.endDate)
        if (d == null || d < 0 || d > 60) return false
      }
      if (!needle) return true
      const t = item.tenancy
      const hay = [t.tenantName, t.tenantEmail, item.propertyTitle, item.agentName, t.status, t.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
    rows = [...rows].sort((a, b) => {
      if (sort === 'rent') return b.tenancy.rent - a.tenancy.rent
      if (sort === 'start') return b.tenancy.startDate.localeCompare(a.tenancy.startDate)
      if (sort === 'property') return a.propertyTitle.localeCompare(b.propertyTitle)
      return a.tenancy.tenantName.localeCompare(b.tenancy.tenantName)
    })
    return rows
  }, [portfolio, q, attention, sort])

  const filtersActive = Boolean(q.trim()) || attention !== 'all'
  const clearFilters = () => {
    setQ('')
    setAttention('all')
  }

  const resultLabel =
    filtered.length === portfolio.length
      ? `${filtered.length} ${filtered.length === 1 ? 'occupant' : 'occupants'}`
      : `${filtered.length} of ${portfolio.length} occupants`

  return (
    <RequirePermission permission="occupants.view">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Occupants"
          subtitle="Lease ledger — residents, rent, and linked properties."
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DirectoryStatCard
            label="On ledger"
            value={counts.total}
            hint="All occupants"
            active={attention === 'all'}
            onClick={() => setAttention('all')}
          />
          <DirectoryStatCard
            label="Active"
            value={counts.active}
            hint="Current leases"
            active={attention === 'active'}
            onClick={() => setAttention(attention === 'active' ? 'all' : 'active')}
          />
          <DirectoryStatCard
            label="Ending soon"
            value={counts.ending}
            hint="Within 60 days"
            active={attention === 'ending'}
            onClick={() => setAttention(attention === 'ending' ? 'all' : 'ending')}
            highlight={counts.ending > 0}
          />
          <DirectoryStatCard
            label="Pending"
            value={counts.pending}
            hint="Incoming / move-in"
            active={attention === 'pending'}
            onClick={() => setAttention(attention === 'pending' ? 'all' : 'pending')}
          />
        </section>

        <DirectoryToolbar
          query={q}
          onQueryChange={setQ}
          searchPlaceholder="Filter by name, email, property, or agent…"
          searchLabel="Filter occupants"
          view={view}
          onViewChange={setView}
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: 'name', label: 'Sort: Name' },
            { value: 'property', label: 'Sort: Property' },
            { value: 'rent', label: 'Sort: Rent' },
            { value: 'start', label: 'Sort: Start date' },
          ]}
          resultLabel={resultLabel}
          reducedMotion={reducedMotion}
          filters={
            <Select
              className="min-h-11"
              value={attention}
              onChange={(e) => setAttention(e.target.value as AttentionFilter)}
              aria-label="Focus"
            >
              <option value="all">All occupants</option>
              <option value="active">Active leases</option>
              <option value="ending">Ending ≤ 60 days</option>
              <option value="pending">Pending / incoming</option>
            </Select>
          }
        />

        {portfolio.length === 0 ? (
          <DirectoryEmpty
            title="No occupants in your scope yet"
            hint="Occupants appear when a lease becomes active."
          />
        ) : filtered.length === 0 ? (
          <DirectoryEmpty
            title="No occupants match these filters"
            action={<ClearFiltersButton onClick={clearFilters} reducedMotion={reducedMotion} />}
          />
        ) : view === 'list' ? (
          <div className="overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.14)]">
            <div className="hidden items-center gap-3 border-b border-primary-50 bg-primary-50/40 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400 xl:flex">
              <span className="w-1.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-[1.3]">Occupant</span>
              <span className="min-w-0 flex-[1.2]">Property</span>
              <span className="w-28 shrink-0">Status</span>
              <span className="w-28 shrink-0">Agent</span>
              <span className="w-24 shrink-0 text-right">Rent</span>
              <span className="w-4 shrink-0" aria-hidden />
            </div>
            <ul>
              {filtered.map((item, index) => {
                const endingSoon = (() => {
                  const d = daysUntil(item.tenancy.endDate)
                  return d != null && d >= 0 && d <= 60
                })()
                return (
                  <li key={item.tenancy.id} className={cn(index > 0 && 'border-t border-primary-50')}>
                    <button
                      type="button"
                      onClick={() => openOccupant(item.tenancy.id)}
                      className={cn(
                        'flex w-full min-h-12 cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors duration-200 hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-5',
                        reducedMotion && 'transition-none',
                      )}
                    >
                      <span
                        className={cn(
                          'h-8 w-1.5 shrink-0 rounded-full',
                          endingSoon ? 'bg-accent' : 'bg-primary',
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 xl:flex-[1.3]">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-ink">
                            {item.tenancy.tenantName}
                          </span>
                          {endingSoon && <Badge tone="warning">Ending</Badge>}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-500">
                          {item.tenancy.tenantEmail}
                          <span className="xl:hidden">
                            {' '}
                            · {item.propertyTitle} · {item.tenancy.status}
                          </span>
                        </span>
                      </span>
                      <span className="hidden min-w-0 flex-[1.2] truncate text-sm text-ink-600 xl:block">
                        {item.propertyTitle}
                      </span>
                      <span className="hidden w-28 shrink-0 xl:block">
                        <Badge tone={statusTone(item.tenancy.status)}>{item.tenancy.status}</Badge>
                      </span>
                      <span className="hidden w-28 shrink-0 truncate text-sm text-ink-500 xl:block">
                        {item.agentName ?? 'Unassigned'}
                      </span>
                      <span className="w-24 shrink-0 text-right tabular text-sm font-semibold text-ink">
                        {formatZAR(item.tenancy.rent)}
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
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <button
                key={item.tenancy.id}
                type="button"
                onClick={() => openOccupant(item.tenancy.id)}
                className={cn(
                  'cursor-pointer rounded-[1.25rem] border border-primary-100/80 bg-white p-4 text-left shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] transition-shadow duration-200 hover:shadow-[0_14px_28px_-16px_rgba(15,39,68,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  reducedMotion && 'transition-none',
                )}
              >
                <div className="flex items-start gap-3">
                  <PersonAvatar name={item.tenancy.tenantName} />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-ink">{item.tenancy.tenantName}</h3>
                    <p className="truncate text-xs text-ink-500">{item.tenancy.tenantEmail}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone={statusTone(item.tenancy.status)}>{item.tenancy.status}</Badge>
                      <Badge tone="info">{formatZAR(item.tenancy.rent)}/mo</Badge>
                    </div>
                    <p className="mt-3 text-xs text-ink-500">{item.propertyTitle}</p>
                  </div>
                </div>
              </button>
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
