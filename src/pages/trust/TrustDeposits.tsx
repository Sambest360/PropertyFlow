import { useMemo } from 'react'
import {
  KeyRound,
  Calendar,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { formatZAR } from '../../data/seed'
import { PageHeader, Card, Badge, EmptyState } from '../../components/ui'
import { DashboardPage } from '../../components/dashboard'
import { TrustModeABanner } from '../../components/trust/TrustModeABanner'

function formatCents(cents: number): string {
  return formatZAR(cents / 100)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (status) {
    case 'held':
      return 'success'
    case 'expected':
      return 'info'
    case 'release_proposed':
    case 'release_approved':
      return 'warning'
    case 'refunded':
      return 'success'
    case 'disputed':
      return 'danger'
    default:
      return 'neutral'
  }
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  const target = new Date(dateStr)
  const diff = target.getTime() - today.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export default function TrustDeposits() {
  const { state } = useStore()
  const { user } = useAuth()

  const agencyId = user?.agencyId

  const deposits = useMemo(
    () =>
      state.depositHoldings?.filter((d) => !agencyId || d.agencyId === agencyId) ?? [],
    [state.depositHoldings, agencyId]
  )

  const totalHeld = useMemo(
    () => deposits.filter((d) => d.status === 'held').reduce((sum, d) => sum + d.heldCents, 0),
    [deposits]
  )

  const totalInterest = useMemo(
    () => deposits.reduce((sum, d) => sum + d.interestAccruedCents, 0),
    [deposits]
  )

  const upcomingDeadlines = useMemo(
    () =>
      deposits
        .filter((d) => d.status === 'held' && d.statutoryDeadlineOn)
        .sort(
          (a, b) =>
            new Date(a.statutoryDeadlineOn!).getTime() -
            new Date(b.statutoryDeadlineOn!).getTime()
        )
        .slice(0, 5),
    [deposits]
  )

  return (
    <DashboardPage>
      <PageHeader
        title="Deposit Register"
        subtitle="Deposit register soft-demo (Mode A — not live trust bank)"
      />
      <TrustModeABanner />

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-purple-600">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-ink-500">Total Held</p>
              <p className="text-xl font-semibold text-ink">{formatCents(totalHeld)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-ink-500">Interest Accrued</p>
              <p className="text-xl font-semibold text-ink">{formatCents(totalInterest)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-ink-500">Active Deposits</p>
              <p className="text-xl font-semibold text-ink">
                {deposits.filter((d) => d.status === 'held').length}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-ink-500">Upcoming Deadlines</p>
              <p className="text-xl font-semibold text-ink">
                {upcomingDeadlines.length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Upcoming Deadlines */}
      {upcomingDeadlines.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-4 text-lg font-semibold text-ink">Upcoming Refund Deadlines</h3>
          <div className="space-y-3">
            {upcomingDeadlines.map((deposit) => {
              const days = deposit.statutoryDeadlineOn ? daysUntil(deposit.statutoryDeadlineOn) : null
              const isUrgent = days !== null && days <= 7
              return (
                <div
                  key={deposit.id}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    isUrgent
                      ? 'border-red-200 bg-red-50'
                      : 'border-primary-100 bg-primary-50/50'
                  }`}
                >
                  <div>
                    <p className="font-medium text-ink">Occupancy {deposit.occupancyId}</p>
                    <p className="text-sm text-ink-500">
                      Deadline: {formatDate(deposit.statutoryDeadlineOn!)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${isUrgent ? 'text-red-600' : 'text-ink'}`}>
                      {days} days
                    </p>
                    <Badge tone={isUrgent ? 'danger' : 'warning'}>
                      {isUrgent ? 'Urgent' : 'Upcoming'}
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Deposits List */}
      <Card>
        <div className="p-4 border-b border-primary-100">
          <h3 className="text-lg font-semibold text-ink">All Deposits</h3>
        </div>

        {deposits.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No deposits found"
              description="Deposit holdings will appear here when occupancies are created."
            />
          </div>
        ) : (
          <div className="divide-y divide-primary-100">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 bg-primary-50/50 px-4 py-3 text-xs font-medium text-ink-500">
              <div className="col-span-3">Occupancy</div>
              <div className="col-span-2">Expected</div>
              <div className="col-span-2">Held</div>
              <div className="col-span-2">Interest</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-2">Deadline</div>
            </div>

            {/* Deposit Rows */}
            {deposits.map((deposit) => {
              const days = deposit.statutoryDeadlineOn
                ? daysUntil(deposit.statutoryDeadlineOn)
                : null
              return (
                <div
                  key={deposit.id}
                  className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-primary-50/30 transition-colors"
                >
                  <div className="col-span-3">
                    <p className="font-medium text-ink">{deposit.occupancyId}</p>
                  </div>
                  <div className="col-span-2 text-sm text-ink">
                    {formatCents(deposit.expectedCents)}
                  </div>
                  <div className="col-span-2 text-sm font-medium text-ink">
                    {formatCents(deposit.heldCents)}
                  </div>
                  <div className="col-span-2 text-sm text-ink-500">
                    {formatCents(deposit.interestAccruedCents)}
                    {deposit.interestRateUnknown && (
                      <span className="ml-1 text-amber-500">Rate unknown</span>
                    )}
                  </div>
                  <div className="col-span-1">
                    <Badge tone={statusTone(deposit.status)}>
                      {deposit.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="col-span-2 text-sm">
                    {deposit.statutoryDeadlineOn ? (
                      <span className={days !== null && days <= 7 ? 'text-red-600 font-medium' : 'text-ink'}>
                        {formatDate(deposit.statutoryDeadlineOn)}
                        {days !== null && (
                          <span className="ml-1 text-xs text-ink-400">({days}d)</span>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <strong>Statutory Deadlines (RHA s5(3)) — guidance only:</strong> No deductions → refund by lease_end + 7 days.
        Deductions after joint outgoing → refund by restoration + 14 days. Tenant no-show → refund balance
        by expiry + 21 days. Interest-bearing hold is a compliance reminder — not a live bank interest feed.
      </div>
    </DashboardPage>
  )
}
