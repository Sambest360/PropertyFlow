/**
 * Admin dashboard: platform-wide for super admins, own agency for agency
 * administrators. Every figure comes from GET /api/admin/dashboard
 * (server/adminDashboard.ts), which decides the scope and leaves out the
 * sections the viewer may not see; this page only renders what came back.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { isApiEnabled } from '../../lib/api/config'
import { canOpenAdminDashboard, type DashboardSectionId } from '../../lib/adminDashboardAccess'
import { roleLabels } from '../../lib/permissions'
import {
  DashboardApiError,
  fetchAdminDashboard,
  type AttentionItem,
  type DashboardPayload,
  type HealthInfo,
  type TrendPoint,
} from '../../lib/api/adminDashboardApi'
import type { Role } from '../../types/domain'
import { seriesFor } from '../../lib/adminDashboardTrends'
import { Button, EmptyState, cn } from '../../components/ui'
import {
  BarList,
  DashboardSkeleton,
  Metric,
  Panel,
  Segmented,
  TrendCard,
  fmtInt,
  fmtZar,
  fmtZarShort,
  pctChange,
  timeAgo,
} from '../../components/admin/dashboard/DashboardWidgets'
import { AgencyTable } from '../../components/admin/dashboard/AgencyTable'
import { ActivityFeed } from '../../components/admin/dashboard/ActivityFeed'
import { AccessPanel } from '../../components/admin/dashboard/AccessPanel'

type Tab = 'overview' | 'agencies' | 'activity' | 'access'
const TABS: Array<{ id: Tab; label: string; needs?: DashboardSectionId }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'agencies', label: 'Agencies', needs: 'agencies' },
  { id: 'activity', label: 'Activity', needs: 'activity' },
  { id: 'access', label: 'Access', needs: 'access' },
]

const ROLE_ORDER: Role[] = ['super_admin', 'client_admin', 'agent_admin', 'ground_agent', 'landlord', 'tenant', 'contractor']
const APP_STATUS: Array<[string, string]> = [
  ['SUBMITTED', 'Submitted'],
  ['UNDER_REVIEW', 'Under review'],
  ['CREDIT_CHECK', 'Credit check'],
  ['APPROVED', 'Approved'],
  ['LEASED', 'Leased'],
  ['REJECTED', 'Declined'],
  ['WITHDRAWN', 'Withdrawn'],
]
const PRIORITIES: Array<[string, string]> = [
  ['EMERGENCY', 'Emergency'],
  ['URGENT', 'Urgent'],
  ['HIGH', 'High'],
  ['MEDIUM', 'Medium'],
  ['LOW', 'Low'],
]

function useDashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [error, setError] = useState<{ message: string; status: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchAdminDashboard())
      setError(null)
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : String(e), status: e instanceof DashboardApiError ? e.status : 0 })
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  return { data, error, loading, reload: load }
}


export default function AdminDashboardPage() {
  const { user, has } = useAuth()
  const [params, setParams] = useSearchParams()
  if (!canOpenAdminDashboard(user?.role)) return <Navigate to="/workspace" replace />
  if (!isApiEnabled) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <EmptyState
          title="Admin dashboard needs the API"
          description="Every figure here is read live from the server, and the API is switched off in this build (VITE_ENABLE_API). No sample numbers are shown."
        />
      </div>
    )
  }
  return <DashboardBody tab={(params.get('tab') as Tab) || 'overview'} onTab={(t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })} canEditPeople={has('users.manage')} />
}

function DashboardBody({ tab, onTab, canEditPeople }: { tab: Tab; onTab: (t: Tab) => void; canEditPeople: boolean }) {
  const { data, error, loading, reload } = useDashboard()
  const [, force] = useState(0)
  // Keep "updated 2m ago" honest without refetching.
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const sections = useMemo(() => new Set(data?.sections ?? []), [data])
  const tabs = TABS.filter((t) => !t.needs || sections.has(t.needs))
  const active = tabs.some((t) => t.id === tab) ? tab : 'overview'
  const platform = data?.scope.kind === 'platform'
  const title = !data ? 'Admin dashboard' : platform ? 'Platform overview' : `${data.scope.agencyName ?? 'Agency'} overview`

  return (
    <div className="mx-auto max-w-[1400px] pb-10">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {data ? (
              <>
                {platform ? 'All agencies' : 'Your agency only'} · {roleLabels[data.viewerRole]} view ·{' '}
                <span title={new Date(data.generatedAt).toLocaleString('en-ZA')}>updated {timeAgo(data.generatedAt)}</span>
              </>
            ) : (
              'Loading live figures…'
            )}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void reload()} disabled={loading} className="self-start sm:self-auto">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin motion-reduce:animate-none')} aria-hidden />
          Refresh
        </Button>
      </div>

      {data && tabs.length > 1 ? (
        <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-primary-100" aria-label="Dashboard views">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              aria-current={active === t.id ? 'page' : undefined}
              className={cn(
                '-mb-px min-h-10 shrink-0 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                active === t.id ? 'border-primary text-ink' : 'border-transparent text-ink-500 hover:text-ink',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      ) : null}

      {error && !data ? (
        <ErrorState status={error.status} message={error.message} onRetry={() => void reload()} />
      ) : !data ? (
        <DashboardSkeleton />
      ) : (
        <>
          {error ? (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Refresh failed ({error.message}). Showing figures from {timeAgo(data.generatedAt)}.
            </p>
          ) : null}
          {active === 'overview' ? <Overview data={data} onTab={onTab} /> : null}
          {active === 'agencies' && data.agencies ? (
            <Panel title="Agencies" meta="Counts per agency. Select a column to sort; open an agency for its details.">
              <AgencyTable rows={data.agencies} />
            </Panel>
          ) : null}
          {active === 'activity' && data.activity ? (
            <Panel title="Activity" meta={`The latest ${data.activity.length} important events${platform ? ' across all agencies' : ''}.`}>
              <ActivityFeed items={data.activity} showAgency={platform} filterable />
            </Panel>
          ) : null}
          {active === 'access' ? <AccessPanel platform={platform} canEdit={canEditPeople} /> : null}
        </>
      )}
    </div>
  )
}

function ErrorState({ status, message, onRetry }: { status: number; message: string; onRetry: () => void }) {
  const denied = status === 403 || status === 401
  return (
    <div className="rounded-2xl border border-primary-100 bg-white px-6 py-10 text-center">
      <AlertTriangle className="mx-auto h-6 w-6 text-amber-600" aria-hidden />
      <p className="mt-3 font-medium text-ink">{denied ? 'You do not have access to this dashboard' : 'The dashboard could not load'}</p>
      <p className="mt-1 text-sm text-ink-500">{message}</p>
      {!denied ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}

function Overview({ data, onTab }: { data: DashboardPayload; onTab: (t: Tab) => void }) {
  const k = data.kpis
  const s = new Set(data.sections)
  const platform = data.scope.kind === 'platform'
  const [days, setDays] = useState<'30' | '90'>('30')
  const range = Number(days)

  const trendCards: Array<{ key: keyof Omit<TrendPoint, 'date'>; title: string; section: DashboardSectionId; href: string; money?: boolean }> = [
    { key: 'leads', title: 'New leads', section: 'leads', href: '/workspace/sales/crm' },
    { key: 'applications', title: 'Applications submitted', section: 'applications', href: '/workspace/sales/applications' },
    { key: 'paymentsAmount', title: 'Payments recorded', section: 'payments', href: '/workspace/operations/payments', money: true },
    { key: 'users', title: 'New accounts', section: 'people', href: platform ? '/workspace/admin/all-users' : '/workspace/admin/users' },
  ]
  const visibleTrends = trendCards.filter((t) => s.has(t.section))

  return (
    <div className="space-y-5">
      <KpiStrip data={data} />

      {visibleTrends.length ? (
        <section aria-label="Trends">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold text-ink">Trends</h2>
            <Segmented<'30' | '90'> label="Range" value={days} onChange={setDays} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {visibleTrends.map((t) => {
              const { points, previousTotal, unit } = seriesFor(data.trends, t.key, range)
              return (
                <TrendCard
                  key={t.key}
                  title={t.title}
                  points={points}
                  previousTotal={previousTotal}
                  rangeLabel={`Last ${range} days`}
                  bucket={unit}
                  href={t.href}
                  format={t.money ? fmtZar : fmtInt}
                  formatAxis={t.money ? fmtZarShort : undefined}
                />
              )
            })}
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-5 md:grid-cols-2 lg:col-span-2">
          {k.payments ? (
            <Panel title="Payments recorded" meta="Recorded by staff; this site takes no payments." className="md:col-span-2">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric label="Paid this month" value={fmtZarShort(k.payments.paidThisMonth.amount)} title={fmtZar(k.payments.paidThisMonth.amount)} sub={`${fmtInt(k.payments.paidThisMonth.count)} payments`} href="/workspace/operations/payments" />
                <Metric label="Due this month" value={fmtZarShort(k.payments.dueThisMonth.amount)} title={fmtZar(k.payments.dueThisMonth.amount)} sub={`${fmtInt(k.payments.dueThisMonth.count)} payments`} />
                <Metric label="Outstanding" value={fmtZarShort(k.payments.outstanding.amount)} title={fmtZar(k.payments.outstanding.amount)} sub={`${fmtInt(k.payments.outstanding.count)} open`} />
                <Metric label="Overdue" value={fmtZarShort(k.payments.overdue.amount)} title={fmtZar(k.payments.overdue.amount)} sub={`${fmtInt(k.payments.overdue.count)} payments`} tone={k.payments.overdue.count ? 'danger' : undefined} href="/workspace/operations/payments" />
              </div>
            </Panel>
          ) : null}

          {k.people ? (
            <Panel title="Users by role" meta={`${fmtInt(k.people.total)} accounts · ${fmtInt(k.people.new30)} new in 30 days`}>
              <BarList rows={ROLE_ORDER.filter((r) => platform || r !== 'super_admin').map((r) => ({ label: roleLabels[r], value: k.people?.byRole[r] ?? 0 }))} />
            </Panel>
          ) : null}

          {k.applications ? (
            <Panel title="Applications by status" meta={`${fmtInt(k.applications.open)} open · ${fmtInt(k.applications.stale)} waiting over ${k.applications.staleAfterDays} days`}>
              <BarList rows={APP_STATUS.map(([key, label]) => ({ label, value: k.applications?.byStatus[key] ?? 0 }))} />
            </Panel>
          ) : null}

          {k.listings ? (
            <Panel title="Published listings" meta={`${fmtInt(k.listings.published)} live on the marketplace`}>
              <BarList
                rows={[
                  { label: 'To rent', value: k.listings.toRent },
                  { label: 'For sale', value: k.listings.forSale },
                  { label: 'Featured', value: k.listings.featured },
                  { label: 'No photos', value: k.listings.noPhotos, tone: 'warning' },
                  { label: 'Drafts', value: k.listings.drafts },
                ]}
              />
            </Panel>
          ) : null}

          {k.leads ? (
            <Panel title="Leads by stage" meta={`${fmtInt(k.leads.total)} total · last 30 days: ${fmtInt(k.leads.rent30)} rent, ${fmtInt(k.leads.buy30)} buy`}>
              <BarList rows={k.leads.byStage.map((r) => ({ label: r.stage, value: r.count }))} emptyText="No leads yet." />
            </Panel>
          ) : null}

          {k.leases ? (
            <Panel title="Leases" meta={`${fmtInt(k.leases.active)} active · rent roll ${fmtZar(k.leases.monthlyRentRoll)} a month`}>
              <div className="mb-4 grid grid-cols-3 gap-3">
                <Metric label="Active" value={fmtInt(k.leases.active)} href="/workspace/people/leases" />
                <Metric label="On notice" value={fmtInt(k.leases.notice)} />
                <Metric label="Pending" value={fmtInt(k.leases.pending)} />
              </div>
              <p className="mb-2 text-xs text-ink-500">Ending in the next…</p>
              <BarList
                rows={[
                  { label: '0–30 days', value: k.leases.expiring.d30, tone: 'warning' },
                  { label: '31–60 days', value: k.leases.expiring.d60 },
                  { label: '61–90 days', value: k.leases.expiring.d90 },
                ]}
                emptyText="No leases end in the next 90 days."
              />
            </Panel>
          ) : null}

          {k.maintenance ? (
            <Panel title="Open maintenance" meta={`${fmtInt(k.maintenance.open)} open · ${fmtInt(k.maintenance.slaBreached)} past SLA`}>
              <BarList
                rows={PRIORITIES.map(([key, label]) => ({
                  label,
                  value: k.maintenance?.byPriority[key] ?? 0,
                  tone: key === 'EMERGENCY' || key === 'URGENT' ? ('danger' as const) : undefined,
                }))}
                emptyText="No open tickets."
              />
            </Panel>
          ) : null}

          {k.viewings ? (
            <Panel title="Viewings">
              <div className="grid grid-cols-2 gap-4">
                <Metric label="Held, last 7 days" value={fmtInt(k.viewings.last7)} href="/workspace/sales/viewings" />
                <Metric label="Held, last 30 days" value={fmtInt(k.viewings.last30)} />
                <Metric label="Booked, next 7 days" value={fmtInt(k.viewings.next7)} />
                <Metric label="No-shows, 30 days" value={fmtInt(k.viewings.noShow30)} tone={k.viewings.noShow30 ? 'warning' : undefined} />
              </div>
            </Panel>
          ) : null}

          {data.agencies ? (
            <Panel
              title="Agencies with the most overdue"
              className="md:col-span-2"
              action={
                <button type="button" onClick={() => onTab('agencies')} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
                  All {fmtInt(data.agencies.length)} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              }
            >
              <AgencyTable rows={data.agencies} compact />
            </Panel>
          ) : null}
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <AttentionPanel items={data.attention} />
          {data.health ? <HealthPanel health={data.health} /> : null}
          {data.activity ? (
            <Panel
              title="Recent activity"
              action={
                <button type="button" onClick={() => onTab('activity')} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
                  View all <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              }
            >
              <ActivityFeed items={data.activity} limit={8} showAgency={platform} />
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function KpiStrip({ data }: { data: DashboardPayload }) {
  const k = data.kpis
  const tiles: ReactNode[] = []
  const tile = (key: string, node: ReactNode) =>
    tiles.push(
      <div key={key} className="min-w-0 rounded-2xl border border-primary-100 bg-white p-4">
        {node}
      </div>,
    )
  const platform = data.scope.kind === 'platform'
  if (k.agencies) tile('agencies', <Metric label="Agencies" value={fmtInt(k.agencies.active)} sub={`${fmtInt(k.agencies.inactive)} inactive · ${fmtInt(k.agencies.total)} total`} href="/workspace/admin/agencies" />)
  if (k.people) tile('people', <Metric label="Users" value={fmtInt(k.people.total)} sub={`+${fmtInt(k.people.new30)} in 30 days`} href={platform ? '/workspace/admin/all-users' : '/workspace/admin/users'} />)
  if (k.portfolio)
    tile(
      'portfolio',
      <Metric
        label="Occupancy"
        value={k.portfolio.occupancyRate == null ? '—' : `${k.portfolio.occupancyRate}%`}
        sub={`${fmtInt(k.portfolio.occupied)} of ${fmtInt(k.portfolio.units)} units · ${fmtInt(k.portfolio.buildings)} buildings`}
        href="/workspace/properties"
      />,
    )
  if (k.listings) tile('listings', <Metric label="Published listings" value={fmtInt(k.listings.published)} sub={`${fmtInt(k.listings.toRent)} rent · ${fmtInt(k.listings.forSale)} sale · ${fmtInt(k.listings.featured)} featured`} href="/workspace/properties" />)
  if (k.leads) {
    const change = pctChange(k.leads.last30, k.leads.prev30)
    tile('leads', <Metric label="Leads, 30 days" value={fmtInt(k.leads.last30)} delta={change == null ? null : { value: change, label: 'vs prior 30' }} sub={change == null ? `${fmtInt(k.leads.last7)} in 7 days` : undefined} href="/workspace/sales/crm" />)
  }
  if (k.applications) tile('apps', <Metric label="Open applications" value={fmtInt(k.applications.open)} sub={k.applications.stale ? <span className="text-amber-700">{fmtInt(k.applications.stale)} waiting {k.applications.staleAfterDays}+ days</span> : 'none waiting long'} href="/workspace/sales/applications" />)
  if (k.leases) tile('leases', <Metric label="Active leases" value={fmtInt(k.leases.active)} sub={`${fmtInt(k.leases.expiring.d30)} end within 30 days`} href="/workspace/people/leases" />)
  if (k.payments) tile('overdue', <Metric label="Overdue payments" value={fmtZarShort(k.payments.overdue.amount)} title={fmtZar(k.payments.overdue.amount)} tone={k.payments.overdue.count ? 'danger' : undefined} sub={`${fmtInt(k.payments.overdue.count)} payments`} href="/workspace/operations/payments" />)
  if (k.maintenance) tile('tickets', <Metric label="Open tickets" value={fmtInt(k.maintenance.open)} sub={`${fmtInt((k.maintenance.byPriority.URGENT ?? 0) + (k.maintenance.byPriority.EMERGENCY ?? 0))} urgent`} href="/workspace/operations/maintenance" />)
  if (k.viewings) tile('viewings', <Metric label="Viewings, 7 days" value={fmtInt(k.viewings.last7)} sub={`${fmtInt(k.viewings.next7)} booked next 7 days`} href="/workspace/sales/viewings" />)
  if (!tiles.length) return null
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{tiles}</div>
}

const ATTENTION_DOT: Record<AttentionItem['tone'], string> = {
  danger: 'bg-accent',
  warning: 'bg-amber-500',
  neutral: 'bg-ink-300',
}

function AttentionPanel({ items }: { items: AttentionItem[] }) {
  return (
    <Panel title="Needs attention" meta={items.length ? `${items.length} open ${items.length === 1 ? 'item' : 'items'}` : undefined} bodyClassName="px-2 py-2 sm:px-2">
      {items.length === 0 ? (
        <p className="px-3 py-4 text-sm text-ink-400">Nothing needs attention right now.</p>
      ) : (
        <ul>
          {items.map((a) => (
            <li key={a.id}>
              <Link to={a.href} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', ATTENTION_DOT[a.tone])} aria-hidden />
                <span className="min-w-0 flex-1 text-sm text-ink">{a.label}</span>
                <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
                  {fmtInt(a.count)}
                  {a.amount != null ? <span className="block text-xs font-normal text-ink-500">{fmtZarShort(a.amount)}</span> : null}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function HealthRow({ label, ok, value, hint }: { label: string; ok: boolean | null; value: ReactNode; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-ink-600">
        <span
          className={cn('h-2 w-2 rounded-full', ok === null ? 'bg-ink-300' : ok ? 'bg-emerald-600' : 'bg-accent')}
          aria-label={ok === null ? 'Unknown' : ok ? 'OK' : 'Problem'}
        />
        {label}
      </span>
      <span className="min-w-0 text-right text-ink" title={hint}>
        {value}
      </span>
    </div>
  )
}

function HealthPanel({ health }: { health: HealthInfo }) {
  const e = health.emailLog
  const backupAgeH = health.lastBackupAt ? (Date.now() - new Date(health.lastBackupAt).getTime()) / 3_600_000 : null
  return (
    <Panel title="System health" bodyClassName="divide-y divide-primary-100/70 py-1">
      <HealthRow label="API" ok value="Responding" />
      <HealthRow
        label="Database"
        ok={health.database === 'up'}
        value={health.database === 'up' ? <span className="tabular-nums">Up · {health.latencyMs ?? 0} ms</span> : 'Down'}
      />
      <HealthRow
        label="Last backup"
        ok={backupAgeH == null ? null : backupAgeH < 30}
        value={health.lastBackupAt ? timeAgo(health.lastBackupAt) : 'Not visible to the API'}
        hint={health.lastBackupAt ? new Date(health.lastBackupAt).toLocaleString('en-ZA') : health.backupDir ? `No readable db-*.dump in ${health.backupDir}` : undefined}
      />
      <HealthRow
        label="Email, 24 hours"
        ok={!e.available ? null : e.failed24h === 0}
        value={
          !e.available ? (
            'No email log yet'
          ) : (
            <span className="tabular-nums">
              {fmtInt(e.sent24h)} sent · <span className={e.failed24h ? 'text-accent-700' : undefined}>{fmtInt(e.failed24h)} failed</span>
              {e.notConfigured24h ? ` · ${fmtInt(e.notConfigured24h)} not sent (no provider)` : ''}
            </span>
          )
        }
      />
      <HealthRow label="Build" ok={null} value={<span className="font-mono text-xs">{health.commit ? health.commit.slice(0, 7) : 'unknown'}</span>} hint={health.commit ?? undefined} />
      {health.authMode ? <HealthRow label="Sign-in mode" ok={null} value={health.authMode} /> : null}
    </Panel>
  )
}
