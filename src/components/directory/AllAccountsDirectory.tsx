import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, UserPlus } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAgencyScope, useAuth } from '../../context/AuthContext'
import { VerificationStatusBadge } from '../auth/VerificationBanner'
import { ImpersonateUserButton } from '../admin/ImpersonateUserButton'
import {
  ClearFiltersButton,
  DirectoryEmpty,
  DirectoryToolbar,
  PersonAvatar,
} from './DirectoryToolbar'
import { DirectoryStatGrid } from './DirectoryStats'
import { DirectoryFilterSelect, directoryResultLabel } from './DirectoryFilters'
import { Badge, Button, Card, cn } from '../ui'
import { roleLabels } from '../../lib/permissions'
import { usePrefersReducedMotion } from '../../hooks/useScrollMotion'
import { withReturnTo } from '../../lib/returnTo'
import type { AppUser, Role } from '../../types/domain'

const ICON_STROKE = 1.6

const ALL_ROLES: Role[] = [
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
  'landlord',
  'tenant',
  'contractor',
]

type StatusFilter = 'all' | 'active' | 'inactive' | 'overdue' | 'pending_verification'

type PortfolioRow = {
  user: AppUser
  agencyName: string
  hint: string
  hintTone: 'success' | 'danger' | 'warning' | 'neutral' | 'info'
  overdue: boolean
}

/** Full account directory — landlords, tenants, contractors, and staff. */
export function AllAccountsDirectory() {
  const { state } = useStore()
  const { has, role } = useAuth()
  const { scopeAgency } = useAgencyScope()
  const reducedMotion = usePrefersReducedMotion()
  const isPlatform = has('platform.manage')
  const [params, setParams] = useSearchParams()

  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [agencyFilter, setAgencyFilter] = useState('all')
  const statusParam = params.get('status')
  const [status, setStatusState] = useState<StatusFilter>(() =>
    statusParam === 'pending_verification' ||
    statusParam === 'active' ||
    statusParam === 'inactive' ||
    statusParam === 'overdue'
      ? statusParam
      : 'all',
  )

  const setStatus = (next: StatusFilter) => {
    setStatusState(next)
    const sp = new URLSearchParams(params)
    sp.set('scope', 'all')
    if (next === 'all') sp.delete('status')
    else sp.set('status', next)
    setParams(sp, { replace: true })
  }

  const addUserHref = withReturnTo('/workspace/admin/users/new', '/workspace/people/staff?scope=all')

  const agencyName = useMemo(
    () => Object.fromEntries(state.agencies.map((a) => [a.id, a.name])),
    [state.agencies],
  )

  const portfolio: PortfolioRow[] = useMemo(() => {
    return state.users
      .filter((u) => {
        if (u.role === 'super_admin') return isPlatform
        if (!scopeAgency(u.agencyId)) return false
        if (isPlatform && agencyFilter !== 'all') {
          if (agencyFilter === 'platform') return !u.agencyId
          return u.agencyId === agencyFilter
        }
        return true
      })
      .map((user) => {
        const openLeads = state.leads.filter(
          (l) =>
            l.agentId === user.id && !['Lease Signed', 'Sale Completed', 'Rejected'].includes(l.stage),
        ).length
        const assignedProperties = state.properties.filter((p) => p.agentId === user.id).length
        const tenantPayments = state.payments.filter((p) => p.partyUserId === user.id)
        const overdue = tenantPayments.some((p) => p.status === 'Overdue')
        const due = tenantPayments.some((p) => p.status === 'Due')

        let hint = '—'
        let hintTone: PortfolioRow['hintTone'] = 'neutral'
        if (user.role === 'tenant') {
          if (overdue) {
            hint = 'Overdue'
            hintTone = 'danger'
          } else if (due) {
            hint = 'Payment due'
            hintTone = 'warning'
          } else if (tenantPayments.some((p) => p.status === 'Paid')) {
            hint = 'Paid up'
            hintTone = 'success'
          } else {
            hint = 'No payments'
          }
        } else if (openLeads > 0) {
          hint = `${openLeads} open leads`
          hintTone = 'info'
        } else if (assignedProperties > 0) {
          hint = `${assignedProperties} properties`
          hintTone = 'info'
        }

        return {
          user,
          agencyName: user.agencyId ? agencyName[user.agencyId] ?? user.agencyId : 'Platform',
          hint,
          hintTone,
          overdue,
        }
      })
  }, [
    state.users,
    state.leads,
    state.properties,
    state.payments,
    scopeAgency,
    isPlatform,
    agencyFilter,
    agencyName,
  ])

  const counts = useMemo(
    () => ({
      all: portfolio.length,
      active: portfolio.filter((p) => p.user.active).length,
      inactive: portfolio.filter((p) => !p.user.active).length,
      overdue: portfolio.filter((p) => p.overdue).length,
      pending_verification: portfolio.filter((p) => p.user.verification?.status === 'pending').length,
    }),
    [portfolio],
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return portfolio
      .filter((item) => {
        if (roleFilter !== 'all' && item.user.role !== roleFilter) return false
        if (status === 'active' && !item.user.active) return false
        if (status === 'inactive' && item.user.active) return false
        if (status === 'overdue' && !item.overdue) return false
        if (status === 'pending_verification' && item.user.verification?.status !== 'pending')
          return false
        if (!needle) return true
        const hay = [item.user.name, item.user.email, item.agencyName, roleLabels[item.user.role]]
          .join(' ')
          .toLowerCase()
        return hay.includes(needle)
      })
      .sort((a, b) => a.user.name.localeCompare(b.user.name))
  }, [portfolio, q, roleFilter, status])

  const filtersActive =
    Boolean(q.trim()) ||
    roleFilter !== 'all' ||
    status !== 'all' ||
    (isPlatform && agencyFilter !== 'all')
  const activeFilterCount =
    (roleFilter !== 'all' ? 1 : 0) +
    (status !== 'all' ? 1 : 0) +
    (isPlatform && agencyFilter !== 'all' ? 1 : 0)

  function clearFilters() {
    setQ('')
    setRoleFilter('all')
    setStatus('all')
    setAgencyFilter('all')
  }

  const resultLabel = directoryResultLabel(filtered.length, portfolio.length, 'account', 'accounts')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-end gap-2">
        {has('users.manage') ? (
          <Link to={addUserHref}>
            <Button className="min-h-11 cursor-pointer">
              <UserPlus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Add account
            </Button>
          </Link>
        ) : null}
      </div>

      <DirectoryStatGrid<StatusFilter>
        allId="all"
        value={status}
        onChange={setStatus}
        options={[
          { id: 'all', label: 'All', value: counts.all, hint: 'Accounts in scope' },
          { id: 'active', label: 'Active', value: counts.active, hint: 'Can sign in' },
          {
            id: 'pending_verification',
            label: 'Pending',
            value: counts.pending_verification,
            hint: 'Landlord / contractor docs',
            highlight: counts.pending_verification > 0,
          },
          {
            id: 'inactive',
            label: 'Disabled',
            value: counts.inactive,
            hint: 'Access revoked',
            highlight: counts.inactive > 0,
          },
          {
            id: 'overdue',
            label: 'Overdue',
            value: counts.overdue,
            hint: 'Tenant payments',
            highlight: counts.overdue > 0,
          },
        ]}
      />

      <DirectoryToolbar
        query={q}
        onQueryChange={setQ}
        searchPlaceholder="Search accounts…"
        searchLabel="Search accounts"
        showViewToggle={false}
        resultLabel={resultLabel}
        reducedMotion={reducedMotion}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        filters={
          <>
            <DirectoryFilterSelect
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              aria-label="Account status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="pending_verification">Pending verification</option>
              <option value="inactive">Disabled only</option>
              <option value="overdue">Overdue payments</option>
            </DirectoryFilterSelect>
            <DirectoryFilterSelect
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter by role"
            >
              <option value="all">All roles</option>
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </DirectoryFilterSelect>
            {isPlatform ? (
              <DirectoryFilterSelect
                value={agencyFilter}
                onChange={(e) => setAgencyFilter(e.target.value)}
                aria-label="Filter by agency"
              >
                <option value="all">All agencies</option>
                <option value="platform">Platform</option>
                {state.agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </DirectoryFilterSelect>
            ) : null}
          </>
        }
      />

      {portfolio.length === 0 ? (
        <DirectoryEmpty title="No accounts in scope" />
      ) : filtered.length === 0 ? (
        <DirectoryEmpty
          title="No accounts match"
          action={<ClearFiltersButton onClick={clearFilters} reducedMotion={reducedMotion} />}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-primary-50" role="list">
            {filtered.map((item) => (
              <li key={item.user.id}>
                <div className="flex items-center gap-1">
                  <Link
                    to={`/workspace/admin/users/${item.user.id}`}
                    className={cn(
                      'flex min-h-14 flex-1 cursor-pointer items-center gap-3 px-4 py-3 hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-5',
                      !reducedMotion && 'transition-colors duration-200',
                    )}
                  >
                    <PersonAvatar name={item.user.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{item.user.name}</p>
                        <Badge tone={item.user.active ? 'success' : 'danger'}>
                          {item.user.active ? 'Active' : 'Disabled'}
                        </Badge>
                        <VerificationStatusBadge user={item.user} />
                      </div>
                      <p className="truncate text-sm text-ink-500">
                        {roleLabels[item.user.role]}
                        {isPlatform ? ` · ${item.agencyName}` : ''}
                        {' · '}
                        {item.user.email}
                      </p>
                      {item.hint !== '—' ? (
                        <Badge tone={item.hintTone} className="mt-1.5 sm:hidden">
                          {item.hint}
                        </Badge>
                      ) : null}
                    </div>
                    {item.hint !== '—' ? (
                      <Badge tone={item.hintTone} className="hidden shrink-0 sm:inline-flex">
                        {item.hint}
                      </Badge>
                    ) : null}
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-ink-400"
                      strokeWidth={ICON_STROKE}
                      aria-hidden
                    />
                  </Link>
                  <ImpersonateUserButton
                    target={item.user}
                    variant="compact"
                    className="mr-3 shrink-0"
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {filtersActive && filtered.length > 0 ? (
        <div className="flex justify-end">
          <ClearFiltersButton onClick={clearFilters} reducedMotion={reducedMotion} />
        </div>
      ) : null}

      <p className="text-xs text-ink-500">Signed in as {roleLabels[role]}.</p>
    </div>
  )
}
