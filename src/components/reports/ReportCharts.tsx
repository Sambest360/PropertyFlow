import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Building2,
  CircleDollarSign,
  ClipboardList,
  Handshake,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PersonAvatar } from '../directory/DirectoryToolbar'
import { Badge, cn } from '../ui'
import { formatZAR } from '../../data/seed'
import type { buildReportMetrics } from '../../lib/reportMetrics'
import {
  ReportLegendRow,
  ReportMetricTile,
  ReportSectionCard,
} from './ReportShell'

const ICON_STROKE = 1.6

type Metrics = ReturnType<typeof buildReportMetrics>

const DONUT_COLORS = {
  primary: 'var(--color-primary, #0B63C8)',
  warning: '#f59e0b',
  danger: 'var(--color-accent, #F04332)',
}

export function PortfolioPerformanceSummary({ metrics }: { metrics: Metrics }) {
  const { kpis, monthTrend } = metrics
  return (
    <ReportSectionCard
      title="Portfolio performance summary"
      subtitle="Key outcomes across listings, pipeline, and collections."
    >
      <div className="grid gap-6 sm:grid-cols-3">
        <ReportMetricTile
          label="Closed deals"
          value={String(kpis.closedDeals)}
          trend={monthTrend.paid >= 0 ? monthTrend.paid : undefined}
          icon={<Handshake className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />}
          accentClassName="bg-emerald-50 text-emerald-700"
        />
        <ReportMetricTile
          label="Open leads"
          value={String(kpis.openLeads)}
          trend={monthTrend.overdue <= 0 ? Math.abs(monthTrend.overdue) : -Math.abs(monthTrend.overdue)}
          icon={<ClipboardList className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />}
          accentClassName="bg-primary-50 text-primary"
        />
        <ReportMetricTile
          label="Active listings"
          value={String(kpis.activeListings)}
          trend={kpis.conversionPct > 0 ? kpis.conversionPct : undefined}
          icon={<Building2 className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />}
          accentClassName="bg-amber-50 text-amber-700"
        />
      </div>
    </ReportSectionCard>
  )
}

export function OpenPipelineChart({ metrics }: { metrics: Metrics }) {
  const data =
    metrics.openPipelineByWeek.length > 0
      ? metrics.openPipelineByWeek.map((row) => ({
          label: new Date(row.week).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          count: row.count,
        }))
      : [{ label: 'Current', count: metrics.kpis.openLeads }]

  const total = data.reduce((sum, row) => sum + row.count, 0)

  return (
    <ReportSectionCard
      title="Open pipeline"
      subtitle="Active leads entering the funnel — last four weeks."
      action={
        <Link to="/workspace/sales/crm" className="text-sm font-semibold text-primary hover:underline">
          View CRM
        </Link>
      }
      className="h-full"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="tabular text-3xl font-semibold tracking-tight text-ink">{total}</p>
          <p className="text-xs text-ink-500">Open leads in scope</p>
        </div>
        <Badge tone="info">{metrics.kpis.conversionPct}% conversion</Badge>
      </div>
      <div className="mt-4 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="pipelineFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary, #0B63C8)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-primary, #0B63C8)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-primary-100" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip />
            <Area
              type="monotone"
              dataKey="count"
              name="Open leads"
              stroke="var(--color-primary, #0B63C8)"
              fill="url(#pipelineFill)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ReportSectionCard>
  )
}

export function AgentOverviewCard({ metrics }: { metrics: Metrics }) {
  const { agentUtilization, agentRows } = metrics
  const topAgents = agentRows.slice(0, 4)

  return (
    <ReportSectionCard
      title="Agent overview"
      subtitle="Workload distribution across your field team."
      action={
        <Link to="/workspace/people/staff" className="text-sm font-semibold text-primary hover:underline">
          Team
        </Link>
      }
    >
      <div className="space-y-2">
        <div className="flex h-3 overflow-hidden rounded-full bg-primary-50">
          <div
            className="bg-emerald-500 transition-all duration-300"
            style={{ width: `${agentUtilization.busyPct}%` }}
            title={`Busy ${agentUtilization.busyPct}%`}
          />
          <div
            className="bg-primary transition-all duration-300"
            style={{ width: `${agentUtilization.activePct}%` }}
            title={`Active ${agentUtilization.activePct}%`}
          />
          <div
            className="bg-accent transition-all duration-300"
            style={{ width: `${agentUtilization.idlePct}%` }}
            title={`Idle ${agentUtilization.idlePct}%`}
          />
        </div>
        <ReportLegendRow
          items={[
            { label: 'Busy', value: String(agentUtilization.busy), colorClassName: 'bg-emerald-500' },
            { label: 'Active', value: String(agentUtilization.active), colorClassName: 'bg-primary' },
            { label: 'Idle', value: String(agentUtilization.idle), colorClassName: 'bg-accent' },
          ]}
        />
      </div>

      <div className="mt-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Top performers</p>
        {topAgents.length === 0 ? (
          <p className="text-sm text-ink-500">No agents in scope.</p>
        ) : (
          topAgents.map((agent) => (
            <div key={agent.id} className="flex items-center gap-3 rounded-xl border border-primary-50 px-3 py-2.5">
              <PersonAvatar name={agent.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{agent.name}</p>
                <p className="text-xs text-ink-500">
                  {agent.closed} closed · {agent.openLeads} open leads
                </p>
              </div>
              <Badge tone={agent.openLeads >= 3 ? 'warning' : agent.closed > 0 ? 'success' : 'neutral'}>
                {agent.openLeads >= 3 ? 'Heavy load' : agent.closed > 0 ? 'On track' : 'Available'}
              </Badge>
            </div>
          ))
        )}
      </div>
    </ReportSectionCard>
  )
}

export function PropertiesBySuburbChart({ metrics }: { metrics: Metrics }) {
  const data = metrics.propertiesBySuburb.length
    ? metrics.propertiesBySuburb
    : [{ suburb: 'No data', count: 0 }]

  return (
    <ReportSectionCard title="Properties by suburb" subtitle="Where your portfolio is concentrated.">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-primary-100" />
            <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              dataKey="suburb"
              type="category"
              width={88}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip />
            <Bar dataKey="count" name="Properties" fill="var(--color-primary, #0B63C8)" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ReportSectionCard>
  )
}

export function CollectionsDonutCard({ metrics }: { metrics: Metrics }) {
  const rows =
    metrics.collectionsBreakdown.length > 0
      ? metrics.collectionsBreakdown
      : [{ name: 'No payments', value: 1, tone: 'primary' as const }]

  const chartData = rows.map((row) => ({
    name: row.name,
    value: row.value,
    fill: DONUT_COLORS[row.tone],
  }))

  const increasePct = metrics.monthTrend.paid

  return (
    <ReportSectionCard
      title="Rent collections"
      subtitle="Collected, due, and overdue totals in scope."
      action={
        <Link
          to="/workspace/operations/payments"
          className="text-sm font-semibold text-primary hover:underline"
        >
          Payments
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="relative h-44 w-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={72}
                paddingAngle={2}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatZAR(value)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="tabular text-lg font-semibold text-ink">
              {increasePct >= 0 ? '+' : ''}
              {increasePct}%
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-ink-400">MoM paid</p>
          </div>
        </div>
        <div className="w-full flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-5 w-5 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
            <p className="tabular text-2xl font-semibold text-ink">{formatZAR(metrics.collectionsTotal)}</p>
          </div>
          <ReportLegendRow
            items={rows.map((row) => ({
              label: row.name,
              value: formatZAR(row.value),
              colorClassName: cn(
                row.tone === 'primary' && 'bg-primary',
                row.tone === 'warning' && 'bg-amber-500',
                row.tone === 'danger' && 'bg-accent',
              ),
            }))}
          />
          <p className="text-xs text-ink-500">
            Collection rate <span className="tabular font-semibold text-ink">{metrics.kpis.collectionPct}%</span>
          </p>
        </div>
      </div>
    </ReportSectionCard>
  )
}

export function OccupancyStrip({ metrics }: { metrics: Metrics }) {
  const { kpis } = metrics
  return (
    <ReportSectionCard title="Occupancy snapshot" subtitle="Live portfolio fill rate.">
      <div className="grid gap-4 sm:grid-cols-3">
        <ReportMetricTile
          label="Occupancy"
          value={`${kpis.occupancyPct}%`}
          icon={<Building2 className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />}
        />
        <ReportMetricTile
          label="Vacant units"
          value={String(kpis.vacantUnits)}
          icon={<Users className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />}
          accentClassName="bg-accent-50 text-accent"
        />
        <ReportMetricTile
          label="Active tenancies"
          value={String(kpis.activeTenancies)}
          icon={<Handshake className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />}
          accentClassName="bg-emerald-50 text-emerald-700"
        />
      </div>
    </ReportSectionCard>
  )
}
