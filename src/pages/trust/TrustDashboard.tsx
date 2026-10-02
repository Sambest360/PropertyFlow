import { useMemo } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  Clock,
  KeyRound,
  TrendingDown,
  FileText,
  Upload,
} from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { formatZAR } from '../../data/seed'
import { PageHeader, Card, StatCard, Badge, Button, EmptyState } from '../../components/ui'
import { DashboardPage } from '../../components/dashboard'
import { FieldHelp } from '../../components/onboarding/FieldHelp'
import { TRUST_MODE_A_COPY } from '../../lib/trust/modeA'
import { Link } from 'react-router-dom'

/** Format integer cents as ZAR currency */
function formatCents(cents: number): string {
  return formatZAR(cents / 100)
}

/** Format date for display */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** Status badge tone mapping */
function transactionStatusTone(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (status) {
    case 'allocated':
    case 'settled':
      return 'success'
    case 'unallocated':
    case 'pending_approval':
      return 'warning'
    case 'reversed':
    case 'failed':
    case 'cancelled':
      return 'danger'
    case 'received':
    case 'recognised':
    case 'proposed':
      return 'info'
    default:
      return 'neutral'
  }
}

/** Direction badge */
function DirectionBadge({ direction }: { direction: 'in' | 'out' }) {
  return (
    <Badge tone={direction === 'in' ? 'success' : 'danger'}>
      {direction === 'in' ? (
        <span className="flex items-center gap-1">
          <ArrowDownLeft className="h-3 w-3" /> In
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <ArrowUpRight className="h-3 w-3" /> Out
        </span>
      )}
    </Badge>
  )
}

export default function TrustDashboard() {
  const { state } = useStore()
  const { user } = useAuth()

  // Filter data by agency
  const agencyId = user?.agencyId

  const trustTransactions = useMemo(
    () => state.trustTransactions?.filter((t) => !agencyId || t.agencyId === agencyId) ?? [],
    [state.trustTransactions, agencyId]
  )

  const payoutInstructions = useMemo(
    () => state.payoutInstructions?.filter((p) => !agencyId || p.agencyId === agencyId) ?? [],
    [state.payoutInstructions, agencyId]
  )

  const depositHoldings = useMemo(
    () => state.depositHoldings?.filter((d) => !agencyId || d.agencyId === agencyId) ?? [],
    [state.depositHoldings, agencyId]
  )

  const arrearsSnapshots = useMemo(
    () => state.arrearsSnapshots?.filter((a) => !agencyId || a.agencyId === agencyId) ?? [],
    [state.arrearsSnapshots, agencyId]
  )

  // Calculate summary stats
  const totalReceived = useMemo(
    () => trustTransactions.filter((t) => t.direction === 'in').reduce((sum, t) => sum + t.amountCents, 0),
    [trustTransactions]
  )

  const totalPaid = useMemo(
    () => trustTransactions.filter((t) => t.direction === 'out').reduce((sum, t) => sum + t.amountCents, 0),
    [trustTransactions]
  )

  const unallocatedCount = useMemo(
    () => trustTransactions.filter((t) => t.status === 'unallocated').length,
    [trustTransactions]
  )

  const pendingPayouts = useMemo(
    () => payoutInstructions.filter((p) => p.status === 'proposed' || p.status === 'pending_approval').length,
    [payoutInstructions]
  )

  const heldDeposits = useMemo(
    () => depositHoldings.filter((d) => d.status === 'held').reduce((sum, d) => sum + d.heldCents, 0),
    [depositHoldings]
  )

  const heldDepositCount = useMemo(
    () => depositHoldings.filter((d) => d.status === 'held').length,
    [depositHoldings]
  )

  const totalArrears = useMemo(
    () => arrearsSnapshots.reduce((sum, a) => sum + a.d30 + a.d60 + a.d90 + a.d90plus, 0),
    [arrearsSnapshots]
  )

  return (
    <DashboardPage>
      <PageHeader
        title="Trust & Banking Dashboard"
        subtitle="In-app trust book overview"
        actions={
          <div className="flex items-center gap-2">
            <FieldHelp title="Trust book" body={TRUST_MODE_A_COPY} />
            <Link to="/workspace/trust/cashbook">
              <Button variant="secondary" size="sm">
                <FileText className="h-4 w-4" />
                Cashbook
              </Button>
            </Link>
            <Link to="/workspace/trust/unallocated">
              <Button variant="primary" size="sm">
                <Upload className="h-4 w-4" />
                Allocate Receipts
              </Button>
            </Link>
          </div>
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Received"
          value={formatCents(totalReceived)}
          icon={<ArrowDownLeft className="h-6 w-6" />}
          hint={`${trustTransactions.filter((t) => t.direction === 'in').length} transactions`}
        />
        <StatCard
          label="Total Paid Out"
          value={formatCents(totalPaid)}
          icon={<ArrowUpRight className="h-6 w-6" />}
          hint={`${trustTransactions.filter((t) => t.direction === 'out').length} transactions`}
        />
        <StatCard
          label="Unallocated Receipts"
          value={unallocatedCount}
          icon={<AlertTriangle className="h-6 w-6" />}
          hint="Awaiting allocation"
          accent="text-amber-600"
        />
        <StatCard
          label="Pending Payouts"
          value={pendingPayouts}
          icon={<Clock className="h-6 w-6" />}
          hint="Awaiting approval"
          accent="text-blue-600"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink-500">Held Deposits</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{formatCents(heldDeposits)}</p>
              <p className="mt-1 text-xs text-ink-400">
                {heldDepositCount} deposits held in trust
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-50 text-purple-600">
              <KeyRound className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink-500">Total Arrears</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{formatCents(totalArrears)}</p>
              <p className="mt-1 text-xs text-ink-400">
                Across {arrearsSnapshots.length} occupancies
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
              <TrendingDown className="h-6 w-6" />
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Actions removed — navigation lives in the sidebar */}

      {/* Recent Activity */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-ink">Recent Trust Activity</h3>
          <Link to="/workspace/trust/cashbook" className="text-sm font-medium text-primary hover:text-primary-600">
            View all →
          </Link>
        </div>

        {trustTransactions.length === 0 ? (
          <EmptyState
            title="No trust transactions"
            description={
              // P1 (R4): distinguish "no activity yet" from "no tenancies to
              // bill against" — QA flagged the blanket message as unclear.
              arrearsSnapshots.length === 0
                ? 'Trust accounting is per tenancy, and this agency has no occupancies yet. Approve an applicant (or record a first receipt) and transactions will appear here.'
                : 'Transactions will appear here when you record payments or process payouts. Start by recording a tenant payment or allocating an unallocated receipt.'
            }
          />
        ) : (
          <div className="mt-4 space-y-3">
            {trustTransactions.slice(0, 5).map((txn) => (
              <div
                key={txn.id}
                className="flex items-center justify-between rounded-xl border border-primary-100/80 p-4 transition-colors hover:bg-primary-50/50"
              >
                <div className="flex items-center gap-4">
                  <DirectionBadge direction={txn.direction} />
                  <div>
                    <p className="font-medium text-ink">{txn.description}</p>
                    <p className="text-sm text-ink-500">
                      {formatDate(txn.valueDate)} • {txn.bankRef || 'No reference'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={transactionStatusTone(txn.status)}>
                    {txn.status.replace('_', ' ')}
                  </Badge>
                  <span className={`font-semibold tabular ${txn.direction === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {txn.direction === 'in' ? '+' : '-'}{formatCents(txn.amountCents)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </DashboardPage>
  )
}
