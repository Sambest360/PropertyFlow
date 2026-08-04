import { useMemo, useState, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { usePropertyScope } from '../context/AuthContext'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import { RequirePermission } from '../components/RequirePermission'
import { ImpersonateUserButton } from '../components/admin/ImpersonateUserButton'
import {
  ClearFiltersButton,
  DirectoryEmpty,
  DirectoryToolbar,
  PersonAvatar,
  useDirectoryView,
} from '../components/directory/DirectoryToolbar'
import { DirectoryStatGrid } from '../components/directory/DirectoryStats'
import { DirectoryFilterSelect, directoryResultLabel } from '../components/directory/DirectoryFilters'
import { Badge, Button, PageHeader, cn, statusTone } from '../components/ui'
import { formatZAR } from '../data/seed'
import type { Tenancy } from '../types/domain'

const ICON_STROKE = 1.6
const VIEW_KEY = 'propertyflow-occupants-view'

type PortfolioTenant = {
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
  const { dealVisible } = usePropertyScope()
  const reducedMotion = usePrefersReducedMotion()
  const [view, setView] = useDirectoryView(VIEW_KEY)
  const [q, setQ] = useState('')
  const [attention, setAttention] = useState<AttentionFilter>('all')
  const [sort, setSort] = useState('name')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggleExpand = (item: PortfolioTenant) => {
    setExpandedId((id) => (id === item.tenancy.id ? null : item.tenancy.id))
  }

  const portfolio: PortfolioTenant[] = useMemo(() => {
    return state.tenancies
      .filter((t) => dealVisible(t))
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
  }, [state.tenancies, state.properties, state.users, dealVisible])

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

  const resultLabel = directoryResultLabel(
    filtered.length,
    portfolio.length,
    'tenant',
    'tenants',
  )

  return (
    <RequirePermission permission="occupants.view">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Tenants"
          subtitle="People with an active or ending lease — rent, property, and status at a glance."
        />

        <DirectoryStatGrid<AttentionFilter>
          allId="all"
          value={attention}
          onChange={setAttention}
          options={[
            { id: 'all', label: 'All', value: counts.total, hint: 'Tenants in scope' },
            { id: 'active', label: 'Active', value: counts.active, hint: 'Current leases' },
            {
              id: 'ending',
              label: 'Ending soon',
              value: counts.ending,
              hint: 'Within 60 days',
              highlight: counts.ending > 0,
            },
            { id: 'pending', label: 'Pending', value: counts.pending, hint: 'Incoming / move-in' },
          ]}
        />

        <DirectoryToolbar
          query={q}
          onQueryChange={setQ}
          searchPlaceholder="Filter by name, email, property, or agent…"
          searchLabel="Filter tenants"
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
            <DirectoryFilterSelect
              value={attention}
              onChange={(e) => setAttention(e.target.value as AttentionFilter)}
              aria-label="Focus"
            >
              <option value="all">All tenants</option>
              <option value="active">Active leases</option>
              <option value="ending">Ending ≤ 60 days</option>
              <option value="pending">Pending / incoming</option>
            </DirectoryFilterSelect>
          }
        />

        {portfolio.length === 0 ? (
          <DirectoryEmpty
            title="No tenants in your scope yet"
            hint="Tenants appear when a lease becomes active."
          />
        ) : filtered.length === 0 ? (
          <DirectoryEmpty
            title="No tenants match these filters"
            action={<ClearFiltersButton onClick={clearFilters} reducedMotion={reducedMotion} />}
          />
        ) : view === 'list' ? (
          <TenantsListView
            items={filtered}
            expandedId={expandedId}
            onToggle={toggleExpand}
            reducedMotion={reducedMotion}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <Link
                key={item.tenancy.id}
                to={`/workspace/people/tenants/${encodeURIComponent(item.tenancy.id)}`}
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
                    <span className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary">
                      Open tenant
                      <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                    </span>
                  </div>
                </div>
              </Link>
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

function TenantsListView({
  items,
  expandedId,
  onToggle,
  reducedMotion,
}: {
  items: PortfolioTenant[]
  expandedId: string | null
  onToggle: (item: PortfolioTenant) => void
  reducedMotion?: boolean
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] md:block">
        <div className="max-h-[min(78vh,56rem)] overflow-auto scrollbar-thin">
          <table className="w-full min-w-3xl border-collapse text-left text-sm">
            <thead className="sticky top-0 z-1 bg-white/95 backdrop-blur-md">
              <tr className="border-b border-primary-100 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                <th className="w-10 px-3 py-3" aria-hidden />
                <th className="px-4 py-3 font-semibold">Tenant</th>
                <th className="px-3 py-3 font-semibold">Property</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Agent</th>
                <th className="px-4 py-3 font-semibold text-right">Rent</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const endingSoon = (() => {
                  const d = daysUntil(item.tenancy.endDate)
                  return d != null && d >= 0 && d <= 60
                })()
                const expanded = expandedId === item.tenancy.id
                return (
                  <Fragment key={item.tenancy.id}>
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
                          aria-label={expanded ? 'Collapse tenant details' : 'Expand tenant details'}
                          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl text-ink-400 transition-colors duration-200 hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                              endingSoon ? 'bg-accent' : 'bg-primary',
                            )}
                            aria-hidden
                          />
                          <PersonAvatar name={item.tenancy.tenantName} />
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate font-semibold text-ink group-hover:text-primary">
                                {item.tenancy.tenantName}
                              </span>
                              {endingSoon && <Badge tone="warning">Ending</Badge>}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-ink-500">
                              {item.tenancy.tenantEmail}
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
                          <Badge tone={statusTone(item.tenancy.status)}>{item.tenancy.status}</Badge>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="w-full min-h-11 cursor-pointer truncate text-left text-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {item.agentName ?? 'Unassigned'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="w-full cursor-pointer text-right tabular font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {formatZAR(item.tenancy.rent)}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-primary-100 bg-primary-50/60">
                        <td colSpan={6} className="px-4 py-4 sm:px-5">
                          <TenantExpansion item={item} reducedMotion={reducedMotion} />
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
          const expanded = expandedId === item.tenancy.id
          return (
            <li
              key={item.tenancy.id}
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
                <PersonAvatar name={item.tenancy.tenantName} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-ink">{item.tenancy.tenantName}</span>
                  <span className="mt-1 block truncate text-xs text-ink-500">
                    {item.propertyTitle} · {item.tenancy.status}
                  </span>
                </span>
                <span className="shrink-0 tabular text-sm font-semibold text-ink">
                  {formatZAR(item.tenancy.rent)}
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
                  <TenantExpansion item={item} reducedMotion={reducedMotion} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function TenantExpansion({
  item,
  reducedMotion,
}: {
  item: PortfolioTenant
  reducedMotion?: boolean
}) {
  const { state } = useStore()
  const t = item.tenancy
  const tenantUser =
    (t.tenantUserId ? state.users.find((u) => u.id === t.tenantUserId) : null) ??
    state.users.find(
      (u) =>
        u.role === 'tenant' &&
        u.email.toLowerCase() === t.tenantEmail.toLowerCase(),
    )
  const detailTo = `/workspace/people/tenants/${encodeURIComponent(t.id)}`
  const metaRows: Array<{ label: string; value: string }> = [
    { label: 'Email', value: t.tenantEmail },
    { label: 'Property', value: item.propertyTitle },
    { label: 'Area', value: item.propertyArea },
    { label: 'Status', value: t.status },
    { label: 'Rent', value: `${formatZAR(t.rent)}/mo` },
    { label: 'Start', value: t.startDate },
    { label: 'End', value: t.endDate || '—' },
    { label: 'Agent', value: item.agentName ?? 'Unassigned' },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-3">
          <PersonAvatar name={t.tenantName} />
          <div className="min-w-0">
            <p className="font-display text-2xl font-semibold tracking-tight text-ink">{t.tenantName}</p>
            <p className="truncate text-sm text-ink-500">{t.id}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Badge tone={statusTone(t.status)}>{t.status}</Badge>
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
        <div
          className={cn(
            'mt-4 flex flex-wrap gap-2 border-t border-primary-100/80 pt-4',
            reducedMotion && 'transition-none',
          )}
        >
          <Link to={detailTo} className="inline-flex">
            <Button className="min-h-11 cursor-pointer gap-2 rounded-2xl">
              Open tenant
              <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            </Button>
          </Link>
          <Link
            to={`/workspace/properties/${encodeURIComponent(t.propertyId)}`}
            className="inline-flex"
          >
            <Button variant="secondary" className="min-h-11 rounded-2xl">
              Property
            </Button>
          </Link>
          {tenantUser ? <ImpersonateUserButton target={tenantUser} /> : null}
        </div>
      </div>
    </div>
  )
}
