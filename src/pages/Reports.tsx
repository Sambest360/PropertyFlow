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
import { Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { Button, Card, PageHeader, Select, cn } from '../components/ui'
import { formatZAR } from '../data/seed'
import { buildReportMetrics, type ReportTab } from '../lib/reportMetrics'

type Audience = 'platform' | 'agency' | 'owner'

const AGENCY_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'overview', label: 'Agency pulse' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'team', label: 'Team' },
  { id: 'collections', label: 'Collections' },
  { id: 'operations', label: 'Operations' },
]

const PLATFORM_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'sales', label: 'Sales / leads' },
  { id: 'occupancy', label: 'Occupancy' },
  { id: 'payments', label: 'Payments' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'agents', label: 'Agents' },
]

const OWNER_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
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
  const { has, role, agencyName } = useAuth()
  const { agencyId, scopeAgency, allowedPropertyIds, agencyWide } = usePropertyScope()
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

  const title =
    audience === 'agency'
      ? 'Agency reports'
      : audience === 'owner'
        ? 'Owner reports'
        : 'Reports & analytics'

  const subtitle =
    audience === 'agency'
      ? `What your office needs: pipeline, team load, collections, and ops${agencyName ? ` · ${agencyName}` : ''}.`
      : audience === 'owner'
        ? 'Occupancy and rent collection for your portfolio.'
        : 'Live metrics across agencies — filter by agency or view the platform total.'

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

  const showPulse = activeTab === 'overview' || activeTab === 'occupancy'
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

  return (
    <RequirePermission permission="reports.view">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title={title}
          subtitle={subtitle}
          actions={
            <div className="flex flex-wrap gap-2">
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
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          }
        />

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'min-h-11 cursor-pointer rounded-2xl border px-4 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                activeTab === t.id
                  ? 'border-primary bg-primary text-white'
                  : 'border-primary-100 bg-white text-ink-600 hover:border-primary-200',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {showPulse && audience === 'agency' && (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Occupancy" value={`${metrics.kpis.occupancyPct}%`} />
            <Kpi label="Vacant units" value={String(metrics.kpis.vacantUnits)} />
            <Kpi label="Active listings" value={String(metrics.kpis.activeListings)} />
            <Kpi label="Team size" value={String(metrics.kpis.teamSize)} />
            <Kpi label="Pipeline conversion" value={`${metrics.kpis.conversionPct}%`} />
            <Kpi label="Collection rate" value={`${metrics.kpis.collectionPct}%`} />
            <Kpi
              label="Apps awaiting review"
              value={String(metrics.kpis.awaitingApps)}
              highlight={metrics.kpis.awaitingApps > 0}
            />
            <Kpi
              label="High-priority tickets"
              value={String(metrics.kpis.highPriorityTickets)}
              highlight={metrics.kpis.highPriorityTickets > 0}
            />
          </section>
        )}

        {showPulse && audience !== 'agency' && (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Properties" value={String(metrics.kpis.properties)} />
            <Kpi label="Occupancy" value={`${metrics.kpis.occupancyPct}%`} />
            <Kpi label="Open leads" value={String(metrics.kpis.openLeads)} />
            <Kpi label="Closed deals" value={String(metrics.kpis.closedDeals)} />
            <Kpi label="Paid (period proxy)" value={formatZAR(metrics.kpis.paidTotal)} />
            <Kpi label="Overdue" value={formatZAR(metrics.kpis.overdueTotal)} highlight />
            <Kpi label="Open tickets" value={String(metrics.kpis.openTickets)} />
            <Kpi label="Active tenancies" value={String(metrics.kpis.activeTenancies)} />
          </section>
        )}

        {showPipeline && (
          <div className="grid gap-6 xl:grid-cols-2">
            {audience !== 'owner' ? (
              <Card className="p-5">
                <h2 className="font-display text-lg font-semibold">
                  {audience === 'agency' ? 'Leads by stage' : 'Leads by stage'}
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  {audience === 'agency'
                    ? 'Where your sales pipeline is stuck — follow up stages with the most volume.'
                    : 'Lead distribution across stages.'}
                </p>
                <div className="mt-4 h-72">
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
              </Card>
            ) : null}

            <Card className={cn('p-5', audience === 'owner' && 'xl:col-span-2')}>
              <h2 className="font-display text-lg font-semibold">
                {audience === 'agency' ? 'Rent collected vs overdue' : 'Revenue proxy (paid payments)'}
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                {audience === 'agency'
                  ? 'Month-by-month collection health for your agency.'
                  : 'Paid vs overdue totals by month.'}
              </p>
              <div className="mt-4 h-72">
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
            </Card>

            {audience === 'agency' && (activeTab === 'pipeline' || activeTab === 'overview') ? (
              <Card className="p-5 xl:col-span-2">
                <h2 className="font-display text-lg font-semibold">Viewings & applications</h2>
                <p className="mt-1 text-sm text-ink-500">
                  Field activity and application queue — typical daily focus for an agency office.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Kpi label="Scheduled viewings" value={String(metrics.kpis.scheduledViewings)} />
                  <Kpi label="Completed viewings" value={String(metrics.kpis.completedViewings)} />
                  <Kpi label="No-shows" value={String(metrics.kpis.noShowViewings)} />
                  <Kpi
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
                  <Link
                    className="font-semibold text-primary hover:underline"
                    to="/workspace/sales/viewings"
                  >
                    Viewings
                  </Link>
                  <Link
                    className="font-semibold text-primary hover:underline"
                    to="/workspace/sales/applications"
                  >
                    Applications
                  </Link>
                </div>
              </Card>
            ) : null}
          </div>
        )}

        {showTeam && audience !== 'owner' && (
          <Card className="p-5">
            <h2 className="mb-1 font-display text-lg font-semibold">
              {audience === 'agency' ? 'Team performance' : 'Agent performance'}
            </h2>
            <p className="mb-4 text-sm text-ink-500">
              {audience === 'agency'
                ? 'Closed deals, open pipeline, assigned properties, viewings, and open tickets per agent.'
                : 'Closed deals and open leads by agent.'}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="text-[11px] uppercase text-ink-400">
                  <tr>
                    <th className="py-2">Agent</th>
                    <th className="py-2 text-right">Closed</th>
                    <th className="py-2 text-right">Open leads</th>
                    <th className="py-2 text-right">Properties</th>
                    {audience === 'agency' ? (
                      <>
                        <th className="py-2 text-right">Viewings</th>
                        <th className="py-2 text-right">Open tickets</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-50">
                  {metrics.agentRows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 font-medium text-ink">{r.name}</td>
                      <td className="py-2 text-right tabular">{r.closed}</td>
                      <td className="py-2 text-right tabular">{r.openLeads}</td>
                      <td className="py-2 text-right tabular">{r.properties}</td>
                      {audience === 'agency' ? (
                        <>
                          <td className="py-2 text-right tabular">{r.viewings}</td>
                          <td className="py-2 text-right tabular">{r.openTickets}</td>
                        </>
                      ) : null}
                    </tr>
                  ))}
                  {metrics.agentRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={audience === 'agency' ? 6 : 4}
                        className="py-6 text-center text-ink-400"
                      >
                        No agents in scope
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {showCollections && (
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">
                  {audience === 'agency' ? 'Arrears & due rent' : 'Outstanding payments'}
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  {audience === 'agency'
                    ? `Collection rate ${metrics.kpis.collectionPct}% · overdue ${formatZAR(metrics.kpis.overdueTotal)} · due ${formatZAR(metrics.kpis.dueTotal)}`
                    : 'Due and overdue payment records.'}
                </p>
              </div>
              {audience === 'agency' ? (
                <Link
                  className="text-sm font-semibold text-primary hover:underline"
                  to="/workspace/operations/payments"
                >
                  Open payments
                </Link>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="text-[11px] uppercase text-ink-400">
                  <tr>
                    <th className="py-2">Party</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Due</th>
                    <th className="py-2 text-right">Amount</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-50">
                  {metrics.outstandingPayments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 font-medium text-ink">{p.partyName}</td>
                      <td className="py-2">{p.status}</td>
                      <td className="py-2 tabular">{p.dueDate}</td>
                      <td className="py-2 text-right tabular">{formatZAR(p.amount)}</td>
                      <td className="py-2 text-right">
                        <Link
                          className="font-semibold text-primary hover:underline"
                          to={`/workspace/operations/payments/${p.id}`}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {metrics.outstandingPayments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-ink-400">
                        No outstanding payments
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {showOps && audience !== 'owner' && (
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">
                  {audience === 'agency' ? 'Maintenance workload' : 'Tickets by status'}
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  {audience === 'agency'
                    ? `${metrics.kpis.openTickets} open · ${metrics.kpis.highPriorityTickets} high priority`
                    : 'Ticket distribution by status.'}
                </p>
              </div>
              {audience === 'agency' ? (
                <Link
                  className="text-sm font-semibold text-primary hover:underline"
                  to="/workspace/operations/maintenance"
                >
                  Open maintenance
                </Link>
              ) : null}
            </div>
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
          </Card>
        )}
      </div>
    </RequirePermission>
  )
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={cn('p-4', highlight && 'border-accent-100 bg-accent-50/40')}>
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 tabular text-2xl font-semibold text-ink">{value}</p>
    </Card>
  )
}
