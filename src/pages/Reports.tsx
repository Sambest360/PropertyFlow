import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Download, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { ResponsiveDataList } from '../components/data/ResponsiveDataList'
import {
  AgentOverviewCard,
  CollectionsDonutCard,
  OccupancyStrip,
  OpenPipelineChart,
  PortfolioPerformanceSummary,
  PropertiesBySuburbChart,
} from '../components/reports/ReportCharts'
import {
  ReportSectionCard,
  ReportTabBar,
  ReportsPageHeader,
  firstName,
  timeGreeting,
} from '../components/reports/ReportShell'
import { Button, Select, cn } from '../components/ui'
import { formatZAR } from '../data/seed'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import { buildReportMetrics, type ReportTab } from '../lib/reportMetrics'
import { RentRollAuditPackPanel } from '../components/rentRoll/RentRollAuditPackPanel'

type Audience = 'platform' | 'agency' | 'owner'

const AGENCY_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'overview', label: 'General report' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'team', label: 'Team report' },
  { id: 'collections', label: 'Collections' },
  { id: 'operations', label: 'Operations' },
]

const PLATFORM_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'overview', label: 'General report' },
  { id: 'sales', label: 'Sales / leads' },
  { id: 'occupancy', label: 'Occupancy' },
  { id: 'payments', label: 'Payments' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'agents', label: 'Agents' },
]

const OWNER_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'overview', label: 'General report' },
  { id: 'occupancy', label: 'Occupancy' },
  { id: 'payments', label: 'Payments' },
]

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function Reports() {
  const { state } = useStore()
  const { has, role, agencyName, user } = useAuth()
  const { agencyId, scopeAgency, allowedPropertyIds, agencyWide } = usePropertyScope()
  const reducedMotion = usePrefersReducedMotion()
  const isPlatform = has('platform.manage')

  const audience: Audience = isPlatform
    ? 'platform'
    : role === 'landlord'
      ? 'owner'
      : 'agency'

  const tabs = audience === 'platform' ? PLATFORM_TABS : audience === 'owner' ? OWNER_TABS : AGENCY_TABS
  const [tab, setTab] = useState<ReportTab>('overview')
  const [agencyFilter, setAgencyFilter] = useState(isPlatform ? 'all' : agencyId ?? 'all')

  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id

  const metrics = useMemo(() => {
    const filterId = isPlatform ? (agencyFilter === 'all' ? null : agencyFilter) : agencyId
    return buildReportMetrics(
      state,
      filterId,
      scopeAgency,
      agencyWide && !isPlatform ? null : allowedPropertyIds,
    )
  }, [state, isPlatform, agencyFilter, agencyId, scopeAgency, allowedPropertyIds, agencyWide])

  const subtitle =
    audience === 'agency'
      ? `Insights into portfolio performance, pipeline health, and collections${agencyName ? ` for ${agencyName}` : ''}.`
      : audience === 'owner'
        ? 'Occupancy and rent collection for your portfolio.'
        : 'Platform-wide metrics — filter by agency or view totals.'

  const exportCurrent = () => {
    if (activeTab === 'payments' || activeTab === 'collections') {
      downloadCsv('outstanding-payments.csv', [
        ['ID', 'Party', 'Amount', 'Status', 'Due'],
        ...metrics.outstandingPayments.map((p) => [
          p.id,
          p.partyName,
          String(p.amount),
          p.status,
          p.dueDate,
        ]),
      ])
      return
    }
    if (activeTab === 'agents' || activeTab === 'team') {
      downloadCsv('team-performance.csv', [
        ['Agent', 'Closed', 'Open leads', 'Properties', 'Viewings', 'Open tickets'],
        ...metrics.agentRows.map((r) => [
          r.name,
          String(r.closed),
          String(r.openLeads),
          String(r.properties),
          String(r.viewings),
          String(r.openTickets),
        ]),
      ])
      return
    }
    downloadCsv('report-kpis.csv', [
      ['Metric', 'Value'],
      ['Properties', String(metrics.kpis.properties)],
      ['Occupancy %', String(metrics.kpis.occupancyPct)],
      ['Vacant units', String(metrics.kpis.vacantUnits)],
      ['Open leads', String(metrics.kpis.openLeads)],
      ['Closed deals', String(metrics.kpis.closedDeals)],
      ['Conversion %', String(metrics.kpis.conversionPct)],
      ['Collection %', String(metrics.kpis.collectionPct)],
      ['Overdue total', String(metrics.kpis.overdueTotal)],
      ['Paid total', String(metrics.kpis.paidTotal)],
      ['Awaiting applications', String(metrics.kpis.awaitingApps)],
      ['Scheduled viewings', String(metrics.kpis.scheduledViewings)],
      ['Open tickets', String(metrics.kpis.openTickets)],
      ['High priority tickets', String(metrics.kpis.highPriorityTickets)],
    ])
  }

  const showPipeline =
    activeTab === 'overview' ||
    activeTab === 'pipeline' ||
    activeTab === 'sales'
  const showTeam = activeTab === 'overview' || activeTab === 'team' || activeTab === 'agents'
  const showCollections =
    activeTab === 'overview' ||
    activeTab === 'collections' ||
    activeTab === 'payments'
  const showOps =
    activeTab === 'overview' ||
    activeTab === 'operations' ||
    activeTab === 'maintenance'
  const showOccupancy =
    activeTab === 'overview' || activeTab === 'occupancy'

  return (
    <RequirePermission permission="reports.view">
      <div
        className={cn(
          'animate-fade-in space-y-6',
          !reducedMotion && 'motion-safe:space-y-6',
        )}
      >
        <ReportsPageHeader
          greeting={`${timeGreeting()}, ${firstName(user.name)}`}
          subtitle={subtitle}
          actions={
            <>
              {isPlatform ? (
                <Select
                  className="min-h-11 cursor-pointer"
                  value={agencyFilter}
                  onChange={(e) => setAgencyFilter(e.target.value)}
                  aria-label="Agency filter"
                >
                  <option value="all">All agencies</option>
                  {state.agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              ) : null}
              <Button
                variant="secondary"
                className="min-h-11 cursor-pointer"
                onClick={exportCurrent}
              >
                <Download className="h-4 w-4" strokeWidth={1.6} aria-hidden />
                Download report
              </Button>
              <Button className="min-h-11 cursor-pointer">
                <Sparkles className="h-4 w-4" strokeWidth={1.6} aria-hidden />
                Insights
              </Button>
            </>
          }
        />

        <ReportTabBar tabs={tabs} active={activeTab} onChange={(id) => setTab(id)} />

        {activeTab === 'overview' ? (
          <>
            <div className="grid gap-5 xl:grid-cols-5">
              <div className="xl:col-span-3">
                <PortfolioPerformanceSummary metrics={metrics} />
              </div>
              <div className="xl:col-span-2">
                <OpenPipelineChart metrics={metrics} />
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
              {audience !== 'owner' ? <AgentOverviewCard metrics={metrics} /> : null}
              <PropertiesBySuburbChart metrics={metrics} />
              <CollectionsDonutCard metrics={metrics} />
            </div>

            {showOccupancy ? <OccupancyStrip metrics={metrics} /> : null}
          </>
        ) : null}

        {activeTab !== 'overview' && showOccupancy && (
          <OccupancyStrip metrics={metrics} />
        )}

        {showOccupancy && agencyId ? (
          <RentRollAuditPackPanel
            agencyId={agencyId}
            agencyName={agencyName || 'Agency'}
            landlordUserId={audience === 'owner' ? user.id : null}
            landlordName={audience === 'owner' ? user.name : null}
            includeOwnerStatements={audience !== 'owner'}
          />
        ) : null}

        {showPipeline && activeTab !== 'overview' && (
          <div className="grid gap-5 xl:grid-cols-2">
            {audience !== 'owner' ? (
              <ReportSectionCard title="Leads by stage" subtitle="Where the pipeline is concentrated.">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.leadsByStage} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-primary-100" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="stage" type="category" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        name="Leads"
                        fill="var(--color-primary, #0B63C8)"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ReportSectionCard>
            ) : null}

            <ReportSectionCard
              title="Rent collected vs overdue"
              subtitle="Month-by-month collection health."
              className={cn(audience === 'owner' && 'xl:col-span-2')}
            >
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.revenueByMonth}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-primary-100" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="paid"
                      name="Paid"
                      fill="var(--color-primary, #0B63C8)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="overdue"
                      name="Overdue"
                      fill="var(--color-accent, #F04332)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ReportSectionCard>

            {audience === 'agency' && (activeTab === 'pipeline' || activeTab === 'sales') ? (
              <ReportSectionCard
                title="Viewings & applications"
                subtitle="Field activity and application queue."
                className="xl:col-span-2"
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MiniKpi label="Scheduled viewings" value={String(metrics.kpis.scheduledViewings)} />
                  <MiniKpi label="Completed viewings" value={String(metrics.kpis.completedViewings)} />
                  <MiniKpi label="No-shows" value={String(metrics.kpis.noShowViewings)} />
                  <MiniKpi
                    label="Apps awaiting"
                    value={String(metrics.kpis.awaitingApps)}
                    highlight={metrics.kpis.awaitingApps > 0}
                  />
                </div>
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.viewingsByStatus}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-primary-100" />
                      <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        name="Viewings"
                        fill="var(--color-primary, #0B63C8)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                  <Link className="font-semibold text-primary hover:underline" to="/workspace/sales/crm">
                    Open CRM
                  </Link>
                  <Link className="font-semibold text-primary hover:underline" to="/workspace/sales/viewings">
                    Viewings
                  </Link>
                  <Link
                    className="font-semibold text-primary hover:underline"
                    to="/workspace/sales/applications"
                  >
                    Applications
                  </Link>
                </div>
              </ReportSectionCard>
            ) : null}
          </div>
        )}

        {showTeam && audience !== 'owner' && activeTab !== 'overview' && (
          <ReportSectionCard
            title={audience === 'agency' ? 'Team performance' : 'Agent performance'}
            subtitle="Closed deals, pipeline, properties, viewings, and tickets per agent."
          >
            <ResponsiveDataList
              embedded
              rows={metrics.agentRows}
              rowKey={(r) => r.id}
              columns={[
                {
                  key: 'agent',
                  header: 'Agent',
                  render: (r) => <span className="font-medium text-ink">{r.name}</span>,
                },
                {
                  key: 'closed',
                  header: 'Closed',
                  headerClassName: 'text-right',
                  cellClassName: 'text-right tabular',
                  render: (r) => r.closed,
                },
                {
                  key: 'leads',
                  header: 'Open leads',
                  headerClassName: 'text-right',
                  cellClassName: 'text-right tabular',
                  render: (r) => r.openLeads,
                },
                {
                  key: 'properties',
                  header: 'Properties',
                  headerClassName: 'text-right',
                  cellClassName: 'text-right tabular',
                  render: (r) => r.properties,
                },
                ...(audience === 'agency'
                  ? [
                      {
                        key: 'viewings',
                        header: 'Viewings',
                        headerClassName: 'text-right',
                        cellClassName: 'text-right tabular',
                        render: (r: (typeof metrics.agentRows)[0]) => r.viewings,
                      },
                      {
                        key: 'tickets',
                        header: 'Open tickets',
                        headerClassName: 'text-right',
                        cellClassName: 'text-right tabular',
                        render: (r: (typeof metrics.agentRows)[0]) => r.openTickets,
                      },
                    ]
                  : []),
              ]}
              renderMobileCard={(r) => (
                <div className="rounded-xl border border-primary-100 p-4">
                  <p className="font-semibold text-ink">{r.name}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-ink-400">Closed</dt>
                      <dd className="tabular font-semibold">{r.closed}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-400">Open leads</dt>
                      <dd className="tabular font-semibold">{r.openLeads}</dd>
                    </div>
                  </dl>
                </div>
              )}
              empty={<p className="py-6 text-center text-ink-400">No agents in scope</p>}
            />
          </ReportSectionCard>
        )}

        {showCollections && activeTab !== 'overview' && (
          <ReportSectionCard
            title={audience === 'agency' ? 'Arrears & due rent' : 'Outstanding payments'}
            subtitle={`Collection rate ${metrics.kpis.collectionPct}% · overdue ${formatZAR(metrics.kpis.overdueTotal)}`}
            action={
              audience === 'agency' ? (
                <Link
                  className="text-sm font-semibold text-primary hover:underline"
                  to="/workspace/operations/payments"
                >
                  Open payments
                </Link>
              ) : null
            }
          >
            <ResponsiveDataList
              embedded
              minTableWidth="36rem"
              rows={metrics.outstandingPayments}
              rowKey={(p) => p.id}
              columns={[
                {
                  key: 'party',
                  header: 'Party',
                  render: (p) => <span className="font-medium text-ink">{p.partyName}</span>,
                },
                { key: 'status', header: 'Status', render: (p) => p.status },
                {
                  key: 'due',
                  header: 'Due',
                  cellClassName: 'tabular',
                  render: (p) => p.dueDate,
                },
                {
                  key: 'amount',
                  header: 'Amount',
                  headerClassName: 'text-right',
                  cellClassName: 'text-right tabular',
                  render: (p) => formatZAR(p.amount),
                },
                {
                  key: 'link',
                  header: '',
                  cellClassName: 'text-right',
                  render: (p) => (
                    <Link
                      className="font-semibold text-primary hover:underline"
                      to={`/workspace/operations/payments/${p.id}`}
                    >
                      Open
                    </Link>
                  ),
                },
              ]}
              renderMobileCard={(p) => (
                <div className="rounded-xl border border-primary-100 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">{p.partyName}</p>
                      <p className="text-xs text-ink-500">
                        {p.status} · due {p.dueDate}
                      </p>
                    </div>
                    <p className="tabular font-semibold text-ink">{formatZAR(p.amount)}</p>
                  </div>
                </div>
              )}
              empty={
                <p className="py-6 text-center text-ink-400">No outstanding payments in scope</p>
              }
            />
          </ReportSectionCard>
        )}

        {showOps && audience !== 'owner' && activeTab !== 'overview' && (
          <ReportSectionCard
            title={audience === 'agency' ? 'Maintenance workload' : 'Tickets by status'}
            subtitle={`${metrics.kpis.openTickets} open · ${metrics.kpis.highPriorityTickets} high priority`}
            action={
              audience === 'agency' ? (
                <Link
                  className="text-sm font-semibold text-primary hover:underline"
                  to="/workspace/operations/maintenance"
                >
                  Open maintenance
                </Link>
              ) : null
            }
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.ticketsByStatus}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-primary-100" />
                  <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    name="Tickets"
                    fill="var(--color-accent, #F04332)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ReportSectionCard>
        )}
      </div>
    </RequirePermission>
  )
}

function MiniKpi({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-primary-100 bg-primary-50/30 p-4',
        highlight && 'border-accent-100 bg-accent-50/40',
      )}
    >
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 tabular text-xl font-semibold text-ink">{value}</p>
    </div>
  )
}
