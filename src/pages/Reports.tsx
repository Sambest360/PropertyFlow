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
import { agentPerformance, revenueByMonth } from '../data/mock'
import { Button, Card, PageHeader } from '../components/ui'

const reports = [
  'Sales',
  'Rentals',
  'Occupancy',
  'Revenue',
  'Agent Performance',
  'Lead Conversion',
  'Outstanding Payments',
  'Maintenance Costs',
  'Property Performance',
]

export default function Reports() {
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Sales, rentals, occupancy, revenue, agent performance, conversion, arrears, maintenance, and property KPIs."
        actions={<Button variant="secondary">Schedule email report</Button>}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {reports.map((r) => (
          <button
            key={r}
            type="button"
            className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-brand-500 hover:text-brand-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200"
          >
            {r}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">Revenue by stream (R millions)</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="sales" fill="#0B63C8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rentals" fill="#F04332" radius={[4, 4, 0, 0]} />
                <Bar dataKey="maintenance" fill="#F04332" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">Agent performance</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" width={60} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="closed" name="Deals closed" fill="#0B63C8" radius={[0, 4, 4, 0]} />
                <Bar dataKey="conversion" name="Conversion %" fill="#F04332" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  )
}
