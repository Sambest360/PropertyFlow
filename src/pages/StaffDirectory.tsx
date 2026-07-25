import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAgencyScope } from '../context/AuthContext'
import { roleLabels } from '../lib/permissions'
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
import { Badge, PageHeader, Select, cn } from '../components/ui'
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
  const { scopeAgency, agencyId } = useAgencyScope()
  const reducedMotion = usePrefersReducedMotion()
  const [view, setView] = useDirectoryView(VIEW_KEY)
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [attention, setAttention] = useState<AttentionFilter>('all')
  const [sort, setSort] = useState('name')
  const navigate = useNavigate()
  const openPerson = (id: string) => {
    navigate(`/workspace/people/staff/${encodeURIComponent(id)}`)
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

  const resultLabel =
    filtered.length === portfolio.length
      ? `${filtered.length} ${filtered.length === 1 ? 'person' : 'people'}`
      : `${filtered.length} of ${portfolio.length} people`

  return (
    <RequirePermission permission="users.manage">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Team"
          subtitle="Staff and agents — roles, workload, and contact details."
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DirectoryStatCard
            label="On roster"
            value={counts.total}
            hint="All team members"
            active={attention === 'all'}
            onClick={() => setAttention('all')}
          />
          <DirectoryStatCard
            label="Active"
            value={counts.active}
            hint="Can take work"
            active={attention === 'active'}
            onClick={() => setAttention(attention === 'active' ? 'all' : 'active')}
          />
          <DirectoryStatCard
            label="Inactive"
            value={counts.inactive}
            hint="Disabled accounts"
            active={attention === 'inactive'}
            onClick={() => setAttention(attention === 'inactive' ? 'all' : 'inactive')}
            highlight={counts.inactive > 0}
          />
          <DirectoryStatCard
            label="Heavy load"
            value={counts.loaded}
            hint="3+ open leads"
            active={attention === 'loaded'}
            onClick={() => setAttention(attention === 'loaded' ? 'all' : 'loaded')}
          />
        </section>

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
              <Select
                className="min-h-11"
                value={attention}
                onChange={(e) => setAttention(e.target.value as AttentionFilter)}
                aria-label="Focus"
              >
                <option value="all">Everyone</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
                <option value="loaded">Heavy workload (3+ leads)</option>
              </Select>
              <Select
                className="min-h-11"
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
              </Select>
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
          <div className="overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.14)]">
            <div className="hidden items-center gap-3 border-b border-primary-50 bg-primary-50/40 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400 xl:flex">
              <span className="w-1.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-[1.4]">Person</span>
              <span className="w-36 shrink-0">Role</span>
              <span className="min-w-0 flex-1">Agency</span>
              <span className="w-16 shrink-0 text-right">Closed</span>
              <span className="w-16 shrink-0 text-right">Leads</span>
              <span className="w-16 shrink-0 text-right">Props</span>
              <span className="w-4 shrink-0" aria-hidden />
            </div>
            <ul>
              {filtered.map((item, index) => (
                <li key={item.user.id} className={cn(index > 0 && 'border-t border-primary-50')}>
                  <button
                    type="button"
                    onClick={() => openPerson(item.user.id)}
                    className={cn(
                      'flex w-full min-h-12 cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors duration-200 hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-5',
                      reducedMotion && 'transition-none',
                    )}
                  >
                    <span
                      className={cn(
                        'h-8 w-1.5 shrink-0 rounded-full',
                        item.user.active ? 'bg-emerald-500' : 'bg-ink-300',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 xl:flex-[1.4]">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-ink">
                          {item.user.name}
                        </span>
                        {!item.user.active && <Badge tone="warning">Inactive</Badge>}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-500">
                        {item.user.email}
                        <span className="xl:hidden">
                          {' '}
                          · {roleLabels[item.user.role]} · {item.openLeads} leads
                        </span>
                      </span>
                    </span>
                    <span className="hidden w-36 shrink-0 truncate text-sm text-ink-600 xl:block">
                      {roleLabels[item.user.role]}
                    </span>
                    <span className="hidden min-w-0 flex-1 truncate text-sm text-ink-500 xl:block">
                      {item.agencyName}
                    </span>
                    <span className="hidden w-16 shrink-0 text-right tabular text-sm font-semibold text-ink xl:block">
                      {item.closedDeals}
                    </span>
                    <span className="hidden w-16 shrink-0 text-right tabular text-sm font-semibold text-ink xl:block">
                      {item.openLeads}
                    </span>
                    <span className="hidden w-16 shrink-0 text-right tabular text-sm font-semibold text-ink xl:block">
                      {item.assignedProperties}
                    </span>
                    <span className="tabular text-sm font-semibold text-ink xl:hidden">
                      {item.openLeads}
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-ink-300"
                      strokeWidth={ICON_STROKE}
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <button
                key={item.user.id}
                type="button"
                onClick={() => openPerson(item.user.id)}
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
