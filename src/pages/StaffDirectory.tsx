import { useMemo, useState, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, UserPlus } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAgencyScope, useAuth } from '../context/AuthContext'
import { roleLabels } from '../lib/permissions'
import { withReturnTo } from '../lib/returnTo'
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
import { Badge, Button, PageHeader, cn } from '../components/ui'
import type { AppUser } from '../types/domain'

const ICON_STROKE = 1.6
const VIEW_KEY = 'propertyflow-staff-view'

const STAFF_ROLES = ['client_admin', 'agent_admin', 'ground_agent', 'agent', 'super_admin'] as const

type PortfolioStaff = {
  user: AppUser
  agencyName: string
  closedDeals: number
  openLeads: number
  assignedProperties: number
}

type AttentionFilter = 'all' | 'active' | 'inactive' | 'loaded'

export default function StaffDirectory() {
  const { state } = useStore()
  const { has } = useAuth()
  const { scopeAgency, agencyId } = useAgencyScope()
  const reducedMotion = usePrefersReducedMotion()
  const [view, setView] = useDirectoryView(VIEW_KEY)
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [attention, setAttention] = useState<AttentionFilter>('all')
  const [sort, setSort] = useState('name')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const isPlatform = has('platform.manage')
  const addPersonHref = withReturnTo(
    !isPlatform && agencyId
      ? `/workspace/admin/users/new?intent=team&agencyId=${agencyId}`
      : '/workspace/admin/users/new?intent=team',
    '/workspace/people/staff',
  )

  const toggleExpand = (item: PortfolioStaff) => {
    setExpandedId((id) => (id === item.user.id ? null : item.user.id))
  }

  const portfolio: PortfolioStaff[] = useMemo(() => {
    return state.users
      .filter((u) => {
        if (!STAFF_ROLES.includes(u.role as (typeof STAFF_ROLES)[number])) return false
        if (u.role === 'super_admin') return true
        return scopeAgency(u.agencyId)
      })
      .map((user) => {
        const agency = state.agencies.find((a) => a.id === user.agencyId)
        const closedDeals = state.leads.filter(
          (l) => l.agentId === user.id && ['Lease Signed', 'Sale Completed'].includes(l.stage),
        ).length
        const openLeads = state.leads.filter(
          (l) =>
            l.agentId === user.id && !['Lease Signed', 'Sale Completed', 'Rejected'].includes(l.stage),
        ).length
        const assignedProperties = state.properties.filter((p) => p.agentId === user.id).length
        return {
          user,
          agencyName: agency?.name ?? (user.role === 'super_admin' ? 'Platform' : agencyId ?? '—'),
          closedDeals,
          openLeads,
          assignedProperties,
        }
      })
  }, [state.users, state.agencies, state.leads, state.properties, scopeAgency, agencyId])

  const counts = useMemo(() => {
    const active = portfolio.filter((p) => p.user.active).length
    const inactive = portfolio.filter((p) => !p.user.active).length
    const loaded = portfolio.filter((p) => p.openLeads >= 3).length
    return { active, inactive, loaded, total: portfolio.length }
  }, [portfolio])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let rows = portfolio.filter((item) => {
      if (roleFilter !== 'all' && item.user.role !== roleFilter) return false
      if (attention === 'active' && !item.user.active) return false
      if (attention === 'inactive' && item.user.active) return false
      if (attention === 'loaded' && item.openLeads < 3) return false
      if (!needle) return true
      const hay = [item.user.name, item.user.email, item.user.phone, item.agencyName, roleLabels[item.user.role]]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
    rows = [...rows].sort((a, b) => {
      if (sort === 'deals') return b.closedDeals - a.closedDeals
      if (sort === 'leads') return b.openLeads - a.openLeads
      if (sort === 'role') return a.user.role.localeCompare(b.user.role)
      return a.user.name.localeCompare(b.user.name)
    })
    return rows
  }, [portfolio, q, roleFilter, attention, sort])

  const filtersActive = Boolean(q.trim()) || roleFilter !== 'all' || attention !== 'all'
  const clearFilters = () => {
    setQ('')
    setRoleFilter('all')
    setAttention('all')
  }

  const resultLabel = directoryResultLabel(
    filtered.length,
    portfolio.length,
    'person',
    'people',
  )

  return (
    <RequirePermission permission="users.manage">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Team"
          subtitle="Your staff and agents — roles, workload, and contact details."
          actions={
            has('users.manage') ? (
              <Link to={addPersonHref}>
                <Button className="min-h-11 cursor-pointer">
                  <UserPlus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  Add team member
                </Button>
              </Link>
            ) : null
          }
        />

        <DirectoryStatGrid<AttentionFilter>
          allId="all"
          value={attention}
          onChange={setAttention}
          options={[
            { id: 'all', label: 'All', value: counts.total, hint: 'Team members' },
            { id: 'active', label: 'Active', value: counts.active, hint: 'Can take work' },
            {
              id: 'inactive',
              label: 'Inactive',
              value: counts.inactive,
              hint: 'Disabled accounts',
              highlight: counts.inactive > 0,
            },
            { id: 'loaded', label: 'Heavy load', value: counts.loaded, hint: '3+ open leads' },
          ]}
        />

        <DirectoryToolbar
          query={q}
          onQueryChange={setQ}
          searchPlaceholder="Filter by name, email, phone, role, or agency…"
          searchLabel="Filter team"
          view={view}
          onViewChange={setView}
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: 'name', label: 'Sort: Name' },
            { value: 'role', label: 'Sort: Role' },
            { value: 'deals', label: 'Sort: Closed deals' },
            { value: 'leads', label: 'Sort: Open leads' },
          ]}
          resultLabel={resultLabel}
          reducedMotion={reducedMotion}
          filters={
            <>
              <DirectoryFilterSelect
                value={attention}
                onChange={(e) => setAttention(e.target.value as AttentionFilter)}
                aria-label="Focus"
              >
                <option value="all">Everyone</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
                <option value="loaded">Heavy workload (3+ leads)</option>
              </DirectoryFilterSelect>
              <DirectoryFilterSelect
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                aria-label="Filter by role"
              >
                <option value="all">All roles</option>
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r] ?? r}
                  </option>
                ))}
              </DirectoryFilterSelect>
            </>
          }
        />

        {portfolio.length === 0 ? (
          <DirectoryEmpty title="No team members in scope" />
        ) : filtered.length === 0 ? (
          <DirectoryEmpty
            title="No people match these filters"
            action={<ClearFiltersButton onClick={clearFilters} reducedMotion={reducedMotion} />}
          />
        ) : view === 'list' ? (
          <TeamListView
            items={filtered}
            expandedId={expandedId}
            onToggle={toggleExpand}
            reducedMotion={reducedMotion}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <Link
                key={item.user.id}
                to={`/workspace/people/staff/${encodeURIComponent(item.user.id)}`}
                className={cn(
                  'cursor-pointer rounded-[1.25rem] border border-primary-100/80 bg-white p-4 text-left shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] transition-shadow duration-200 hover:shadow-[0_14px_28px_-16px_rgba(15,39,68,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  reducedMotion && 'transition-none',
                )}
              >
                <div className="flex items-start gap-3">
                  <PersonAvatar name={item.user.name} />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-ink">{item.user.name}</h3>
                    <p className="text-sm text-ink-500">{roleLabels[item.user.role]}</p>
                    <Badge tone="neutral" className="mt-1">
                      {item.agencyName}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-primary-50 pt-3 text-center">
                  <div>
                    <p className="tabular text-lg font-semibold text-ink">{item.closedDeals}</p>
                    <p className="text-[10px] text-ink-400">Closed</p>
                  </div>
                  <div>
                    <p className="tabular text-lg font-semibold text-ink">{item.openLeads}</p>
                    <p className="text-[10px] text-ink-400">Leads</p>
                  </div>
                  <div>
                    <p className="tabular text-lg font-semibold text-ink">{item.assignedProperties}</p>
                    <p className="text-[10px] text-ink-400">Properties</p>
                  </div>
                </div>
                <span className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary">
                  Open person
                  <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                </span>
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

function TeamListView({
  items,
  expandedId,
  onToggle,
  reducedMotion,
}: {
  items: PortfolioStaff[]
  expandedId: string | null
  onToggle: (item: PortfolioStaff) => void
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
                <th className="px-4 py-3 font-semibold">Person</th>
                <th className="px-3 py-3 font-semibold">Role</th>
                <th className="px-3 py-3 font-semibold">Agency</th>
                <th className="px-3 py-3 font-semibold text-right">Closed</th>
                <th className="px-3 py-3 font-semibold text-right">Leads</th>
                <th className="px-4 py-3 font-semibold text-right">Props</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const expanded = expandedId === item.user.id
                return (
                  <Fragment key={item.user.id}>
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
                          aria-label={expanded ? 'Collapse team member' : 'Expand team member'}
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
                              item.user.active ? 'bg-emerald-500' : 'bg-ink-300',
                            )}
                            aria-hidden
                          />
                          <PersonAvatar name={item.user.name} />
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate font-semibold text-ink group-hover:text-primary">
                                {item.user.name}
                              </span>
                              {!item.user.active && <Badge tone="warning">Inactive</Badge>}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-ink-500">
                              {item.user.email}
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
                          {roleLabels[item.user.role]}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="w-full min-h-11 cursor-pointer truncate text-left text-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {item.agencyName}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="w-full cursor-pointer text-right tabular font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {item.closedDeals}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="w-full cursor-pointer text-right tabular font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {item.openLeads}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="w-full cursor-pointer text-right tabular font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {item.assignedProperties}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-primary-100 bg-primary-50/60">
                        <td colSpan={7} className="px-4 py-4 sm:px-5">
                          <TeamExpansion item={item} reducedMotion={reducedMotion} />
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
          const expanded = expandedId === item.user.id
          return (
            <li
              key={item.user.id}
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
                <PersonAvatar name={item.user.name} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-ink">{item.user.name}</span>
                  <span className="mt-1 block truncate text-xs text-ink-500">
                    {roleLabels[item.user.role]} · {item.openLeads} leads
                  </span>
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
                  <TeamExpansion item={item} reducedMotion={reducedMotion} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function TeamExpansion({
  item,
  reducedMotion,
}: {
  item: PortfolioStaff
  reducedMotion?: boolean
}) {
  const detailTo = `/workspace/people/staff/${encodeURIComponent(item.user.id)}`
  const metaRows: Array<{ label: string; value: string }> = [
    { label: 'Email', value: item.user.email },
    { label: 'Phone', value: item.user.phone || '—' },
    { label: 'Role', value: roleLabels[item.user.role] ?? item.user.role },
    { label: 'Agency', value: item.agencyName },
    { label: 'Status', value: item.user.active ? 'Active' : 'Inactive' },
    { label: 'Closed deals', value: String(item.closedDeals) },
    { label: 'Open leads', value: String(item.openLeads) },
    { label: 'Properties', value: String(item.assignedProperties) },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-3">
          <PersonAvatar name={item.user.name} />
          <div className="min-w-0">
            <p className="font-display text-2xl font-semibold tracking-tight text-ink">
              {item.user.name}
            </p>
            <p className="truncate text-sm text-ink-500">{item.user.id}</p>
          </div>
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
              Open person
              <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            </Button>
          </Link>
          <ImpersonateUserButton target={item.user} />
        </div>
      </div>
    </div>
  )
}
