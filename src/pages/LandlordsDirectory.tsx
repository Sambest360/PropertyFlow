import { Fragment, useMemo, useState } from 'react'
import { Pager, usePaged } from '../components/Pager'
import { Link } from 'react-router-dom'
import { ChevronDown, UserPlus } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAgencyScope, useAuth } from '../context/AuthContext'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import { RequirePermission } from '../components/RequirePermission'
import { VerificationStatusBadge } from '../components/auth/VerificationBanner'
import {
  ClearFiltersButton,
  DirectoryEmpty,
  DirectoryToolbar,
  PersonAvatar,
  useDirectoryView,
} from '../components/directory/DirectoryToolbar'
import { DirectoryStatGrid } from '../components/directory/DirectoryStats'
import { directoryResultLabel } from '../components/directory/DirectoryFilters'
import { withReturnTo } from '../lib/returnTo'
import { Badge, Button, PageHeader, cn } from '../components/ui'
import type { AppUser, PropertyAsset } from '../types/domain'
import { isLandlordPortfolio } from '../lib/agencyKinds'
import { formatZAR } from '../data/seed'
import { OwnerStatementDownloadPanel } from '../components/ownerStatement/OwnerStatementDownloadPanel'
import { RentRollAuditPackPanel } from '../components/rentRoll/RentRollAuditPackPanel'
import { usePortalHydrating } from '../components/PortalHydrationGate'
import { DataTableSkeleton } from '../components/loading/PageSkeleton'

const ICON_STROKE = 1.6
const VIEW_KEY = 'propertyflow-landlords-view'

type PortfolioLandlord = {
  user: AppUser
  /** "Self-managed" for a private landlord's own portfolio, else the agency name. */
  agencyName: string
  selfManaged: boolean
  properties: PropertyAsset[]
  propertyCount: number
  occupied: number
  monthlyRent: number
}

type AttentionFilter = 'all' | 'self_managed' | 'agency' | 'awaiting' | 'with_properties' | 'inactive'

export default function LandlordsDirectory() {
  const dataLoading = usePortalHydrating()
  const { state } = useStore()
  const { has } = useAuth()
  const { scopeAgency, agencyId } = useAgencyScope()
  const reducedMotion = usePrefersReducedMotion()
  const [view, setView] = useDirectoryView(VIEW_KEY)
  const [q, setQ] = useState('')
  const [attention, setAttention] = useState<AttentionFilter>('all')
  const [sort, setSort] = useState('name')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const canAddLandlord = has('users.manage') || has('roles.assign')
  const canDownloadStatement =
    has('trust.view') || has('payments.view') || has('documents.view') || has('trust.view_own_statement')
  const addLandlordHref = withReturnTo(
    agencyId
      ? `/workspace/admin/users/new?intent=landlord&agencyId=${encodeURIComponent(agencyId)}`
      : '/workspace/admin/users/new?intent=landlord',
    '/workspace/people/landlords',
  )

  const portfolio: PortfolioLandlord[] = useMemo(() => {
    return state.users
      .filter((u) => u.role === 'landlord' && scopeAgency(u.agencyId))
      .map((user) => {
        const agency = state.agencies.find((a) => a.id === user.agencyId)
        const selfManaged = !agency || isLandlordPortfolio(agency)
        const properties = state.properties.filter((p) => p.landlordId === user.id && !p.deletedAt)
        const ids = new Set(properties.map((p) => p.id))
        const live = state.tenancies.filter((t) => ids.has(t.propertyId) && t.status !== 'Ended')
        return {
          user,
          agencyName: selfManaged ? 'Self-managed' : agency!.name,
          selfManaged,
          properties,
          propertyCount: properties.length,
          occupied: new Set(live.map((t) => t.propertyId)).size,
          monthlyRent: live.reduce((n, t) => n + (t.rent || 0), 0),
        }
      })
  }, [state.users, state.agencies, state.properties, state.tenancies, scopeAgency])

  const counts = useMemo(() => {
    const inactive = portfolio.filter((p) => !p.user.active).length
    const withProperties = portfolio.filter((p) => p.propertyCount > 0).length
    const selfManaged = portfolio.filter((p) => p.selfManaged).length
    const awaiting = portfolio.filter((p) => p.user.verification?.status === 'pending').length
    return { inactive, withProperties, selfManaged, agency: portfolio.length - selfManaged, awaiting, total: portfolio.length }
  }, [portfolio])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let rows = portfolio.filter((item) => {
      if (attention === 'self_managed' && !item.selfManaged) return false
      if (attention === 'agency' && item.selfManaged) return false
      if (attention === 'awaiting' && item.user.verification?.status !== 'pending') return false
      if (attention === 'inactive' && item.user.active) return false
      if (attention === 'with_properties' && item.propertyCount === 0) return false
      if (!needle) return true
      const hay = [item.user.name, item.user.email, item.user.phone, item.agencyName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })

    rows = [...rows].sort((a, b) => {
      if (sort === 'properties') return b.propertyCount - a.propertyCount
      if (sort === 'rent') return b.monthlyRent - a.monthlyRent
      if (sort === 'email') return (a.user.email ?? '').localeCompare(b.user.email ?? '')
      return a.user.name.localeCompare(b.user.name)
    })
    return rows
  }, [portfolio, q, attention, sort])

  // Long lists show a page at a time.

  const paged = usePaged(filtered)

  const resultLabel = directoryResultLabel(filtered.length, portfolio.length, 'landlord', 'landlords')

  const clearFilters = () => {
    setQ('')
    setAttention('all')
  }
  const activeFilterCount = (attention !== 'all' ? 1 : 0) + (sort !== 'name' ? 1 : 0)

  return (
    <RequirePermission anyOf={['users.manage', 'assets.manage']}>
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Landlords"
          subtitle="Property owners: private landlords who manage their own properties, and owners whose properties an agency manages. Landlords are not agencies, so they are listed here and not under Agencies."
          actions={
            canAddLandlord ? (
              <Link to={addLandlordHref}>
                <Button className="min-h-11 cursor-pointer">
                  <UserPlus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  Add landlord
                </Button>
              </Link>
            ) : undefined
          }
        />

        {!canAddLandlord ? (
          <div className="rounded-2xl border border-primary-100 bg-primary-50/50 px-4 py-3 text-sm text-ink-600">
            Need a new landlord on file? Add their details on the property wizard (Assignment step), or ask your office
            admin to add them here.
          </div>
        ) : null}

        <DirectoryStatGrid<AttentionFilter>
          allId="all"
          value={attention}
          onChange={setAttention}
          options={[
            { id: 'all', label: 'All', value: counts.total, hint: 'Landlords' },
            { id: 'self_managed', label: 'Self-managed', value: counts.selfManaged, hint: 'Manage their own properties' },
            { id: 'agency', label: 'With an agency', value: counts.agency, hint: 'An agency manages for them' },
            {
              id: 'awaiting',
              label: 'To verify',
              value: counts.awaiting,
              hint: 'Waiting for document checks',
              highlight: counts.awaiting > 0,
            },
            { id: 'with_properties', label: 'With properties', value: counts.withProperties, hint: 'At least one property' },
          ]}
        />

        <DirectoryToolbar
          query={q}
          onQueryChange={setQ}
          searchPlaceholder="Search landlords…"
          searchLabel="Filter landlords"
          view={view}
          onViewChange={setView}
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: 'name', label: 'Name' },
            { value: 'email', label: 'Email' },
            { value: 'properties', label: 'Property count' },
            { value: 'rent', label: 'Monthly rent' },
          ]}
          resultLabel={resultLabel}
          reducedMotion={reducedMotion}
          activeFilterCount={activeFilterCount}
          onClearFilters={clearFilters}
        />

        {dataLoading ? (
          <DataTableSkeleton />
        ) : portfolio.length === 0 ? (
          <DirectoryEmpty
            title="No landlords yet"
            hint="That is fine — agency-owned properties do not need one. Add a landlord when you manage stock on behalf of a private owner."
            action={
              canAddLandlord ? (
                <Link to={addLandlordHref}>
                  <Button className="cursor-pointer">
                    <UserPlus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                    Add landlord
                  </Button>
                </Link>
              ) : undefined
            }
          />
        ) : filtered.length === 0 ? (
          <DirectoryEmpty
            title="No landlords match these filters"
            action={<ClearFiltersButton onClick={clearFilters} reducedMotion={reducedMotion} />}
          />
        ) : view === 'list' ? (
          <div className="overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
                <thead className="bg-white">
                  <tr className="border-b border-primary-100 text-xs font-semibold text-ink-400">
                    <th className="w-12 px-3 py-3" aria-hidden />
                    <th className="px-4 py-3">Landlord</th>
                    <th className="px-3 py-3">Managed by</th>
                    <th className="px-3 py-3">Properties</th>
                    <th className="px-3 py-3">Verification</th>
                    <th className="px-4 py-3 text-right">Rent / month</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.pageItems.map((item) => {
                    const open = expandedId === item.user.id
                    return (
                      <Fragment key={item.user.id}>
                        <tr className={cn('border-b border-primary-50', open && 'border-b-0 bg-primary-50')}>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setExpandedId(open ? null : item.user.id)}
                              aria-expanded={open}
                              aria-label={open ? 'Hide landlord details' : 'Show landlord details'}
                              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink-400 hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180', reducedMotion && 'transition-none')} strokeWidth={ICON_STROKE} aria-hidden />
                            </button>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-3">
                              <PersonAvatar name={item.user.name} />
                              <span className="min-w-0">
                                <span className="block truncate font-semibold text-ink">{item.user.name}</span>
                                <span className="block truncate text-xs text-ink-500">{item.user.email}{item.user.phone ? ` · ${item.user.phone}` : ''}</span>
                              </span>
                              {!item.user.active ? <Badge tone="danger">Disabled</Badge> : null}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={item.selfManaged ? 'brand' : 'neutral'}>{item.agencyName}</Badge>
                          </td>
                          <td className="px-3 py-2 tabular-nums text-ink-600">
                            {item.propertyCount}
                            {item.propertyCount ? <span className="text-xs text-ink-400"> ({item.occupied} let)</span> : null}
                          </td>
                          <td className="px-3 py-2">
                            <VerificationStatusBadge user={item.user} />
                          </td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink">{item.monthlyRent ? formatZAR(item.monthlyRent) : '—'}</td>
                        </tr>
                        {open ? (
                          <tr className="border-b border-primary-100 bg-primary-50/60">
                            <td colSpan={6} className="px-4 py-4 sm:px-5">
                              <LandlordExpansion item={item} canDownloadStatement={canDownloadStatement} canManageUsers={canAddLandlord} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pager {...paged} />
          </div>
        ) : (
          <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {paged.pageItems.map((item) => (
              <div
                key={item.user.id}
                className={cn(
                  'rounded-[1.25rem] border border-primary-100/80 bg-white p-4 shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)]',
                  reducedMotion && 'transition-none',
                )}
              >
                <div className="flex items-start gap-3">
                  <PersonAvatar name={item.user.name} />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-ink">{item.user.name}</h3>
                    <p className="text-sm text-ink-500">{item.user.email}</p>
                    {item.user.phone ? <p className="text-sm text-ink-500">{item.user.phone}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone={item.selfManaged ? 'brand' : 'neutral'}>{item.agencyName}</Badge>
                      <VerificationStatusBadge user={item.user} />
                    </div>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-primary-50 pt-3 text-center">
                  <div>
                    <dt className="text-xs text-ink-400">Properties</dt>
                    <dd className="font-semibold tabular-nums text-ink">{item.propertyCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-400">Let</dt>
                    <dd className="font-semibold tabular-nums text-ink">{item.occupied}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-400">Rent / month</dt>
                    <dd className="font-semibold tabular-nums text-ink">{item.monthlyRent ? formatZAR(item.monthlyRent) : '—'}</dd>
                  </div>
                </dl>
                {canAddLandlord ? (
                  <Link to={`/workspace/admin/users/${encodeURIComponent(item.user.id)}`} className="mt-3 inline-flex min-h-9 items-center text-sm font-semibold text-primary hover:underline">
                    Open profile
                  </Link>
                ) : null}
                {canDownloadStatement && item.user.agencyId ? (
                  <>
                    <OwnerStatementDownloadPanel
                      landlordUserId={item.user.id}
                      landlordName={item.user.name}
                      agencyId={item.user.agencyId}
                      agencyName={item.agencyName}
                      storeDocument
                      compact
                    />
                    <RentRollAuditPackPanel
                      agencyId={item.user.agencyId}
                      agencyName={item.agencyName}
                      landlordUserId={item.user.id}
                      landlordName={item.user.name}
                      compact
                      includeOwnerStatements={false}
                    />
                  </>
                ) : null}
              </div>
            ))}
          </div>
          <Pager {...paged} />
          </>
        )}
      </div>
    </RequirePermission>
  )
}

function LandlordExpansion({
  item,
  canDownloadStatement,
  canManageUsers,
}: {
  item: PortfolioLandlord
  canDownloadStatement: boolean
  canManageUsers: boolean
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <h3 className="text-sm font-semibold text-ink">Properties</h3>
        {item.properties.length ? (
          <ul className="mt-2 space-y-1">
            {item.properties.slice(0, 8).map((p) => (
              <li key={p.id}>
                <Link to={`/workspace/properties/${encodeURIComponent(p.id)}`} className="inline-flex min-h-9 items-center gap-2 text-sm text-ink-600 hover:text-primary">
                  {p.title}
                  <Badge tone={p.status === 'Rented' ? 'success' : 'neutral'}>{p.status}</Badge>
                </Link>
              </li>
            ))}
            {item.properties.length > 8 ? <li className="text-xs text-ink-500">and {item.properties.length - 8} more</li> : null}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-500">No properties linked yet.</p>
        )}
        {canManageUsers ? (
          <Link to={`/workspace/admin/users/${encodeURIComponent(item.user.id)}`} className="mt-3 inline-flex min-h-9 items-center text-sm font-semibold text-primary hover:underline">
            Open profile
          </Link>
        ) : null}
      </div>
      {canDownloadStatement && item.user.agencyId ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">Statements</h3>
          <OwnerStatementDownloadPanel
            landlordUserId={item.user.id}
            landlordName={item.user.name}
            agencyId={item.user.agencyId}
            agencyName={item.agencyName}
            storeDocument
            compact
          />
          <RentRollAuditPackPanel
            agencyId={item.user.agencyId}
            agencyName={item.agencyName}
            landlordUserId={item.user.id}
            landlordName={item.user.name}
            compact
            includeOwnerStatements={false}
          />
        </div>
      ) : null}
    </div>
  )
}
