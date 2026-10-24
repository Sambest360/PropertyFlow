import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
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
import type { AppUser } from '../types/domain'
import { OwnerStatementDownloadPanel } from '../components/ownerStatement/OwnerStatementDownloadPanel'
import { RentRollAuditPackPanel } from '../components/rentRoll/RentRollAuditPackPanel'
import { usePortalHydrating } from '../components/PortalHydrationGate'
import { DataTableSkeleton } from '../components/loading/PageSkeleton'

const ICON_STROKE = 1.6
const VIEW_KEY = 'propertyflow-landlords-view'

type PortfolioLandlord = {
  user: AppUser
  agencyName: string
  propertyCount: number
}

type AttentionFilter = 'all' | 'active' | 'inactive' | 'with_properties'

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
        const propertyCount = state.properties.filter((p) => p.landlordId === user.id).length
        return {
          user,
          agencyName: agency?.name ?? '—',
          propertyCount,
        }
      })
  }, [state.users, state.agencies, state.properties, scopeAgency])

  const counts = useMemo(() => {
    const active = portfolio.filter((p) => p.user.active).length
    const inactive = portfolio.filter((p) => !p.user.active).length
    const withProperties = portfolio.filter((p) => p.propertyCount > 0).length
    return { active, inactive, withProperties, total: portfolio.length }
  }, [portfolio])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let rows = portfolio.filter((item) => {
      if (attention === 'active' && !item.user.active) return false
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
      if (sort === 'email') return (a.user.email ?? '').localeCompare(b.user.email ?? '')
      return a.user.name.localeCompare(b.user.name)
    })
    return rows
  }, [portfolio, q, attention, sort])

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
          subtitle="Property owners linked to your agency. Landlords use My portfolio (owner portal) for assets, landlord-visible payments, maintenance, and applicant review — messaging stays with the agency."
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
            { id: 'active', label: 'Active', value: counts.active, hint: 'Can be linked' },
            {
              id: 'inactive',
              label: 'Inactive',
              value: counts.inactive,
              hint: 'Disabled accounts',
              highlight: counts.inactive > 0,
            },
            { id: 'with_properties', label: 'With stock', value: counts.withProperties, hint: 'Linked properties' },
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
            <ul className="divide-y divide-primary-50">
              {filtered.map((item) => (
                <li key={item.user.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <PersonAvatar name={item.user.name} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{item.user.name}</p>
                    <p className="text-sm text-ink-500">{item.user.email}</p>
                    {item.user.phone ? <p className="text-sm text-ink-500">{item.user.phone}</p> : null}
                  </div>
                  <Badge tone="neutral">{item.agencyName}</Badge>
                  <Badge tone={item.propertyCount > 0 ? 'info' : 'neutral'}>
                    {item.propertyCount} {item.propertyCount === 1 ? 'property' : 'properties'}
                  </Badge>
                  <VerificationStatusBadge user={item.user} />
                  {canDownloadStatement && item.user.agencyId ? (
                    <div className="w-full basis-full">
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
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
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
                      <Badge tone="neutral">{item.agencyName}</Badge>
                      <VerificationStatusBadge user={item.user} />
                    </div>
                  </div>
                </div>
                <p className="mt-4 border-t border-primary-50 pt-3 text-sm text-ink-600">
                  {item.propertyCount} linked {item.propertyCount === 1 ? 'property' : 'properties'}
                </p>
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
        )}
      </div>
    </RequirePermission>
  )
}
