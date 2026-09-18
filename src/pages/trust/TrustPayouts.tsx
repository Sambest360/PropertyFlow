import { useMemo, useState } from 'react'
import {
  Wallet,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { formatZAR } from '../../data/seed'
import { PageHeader, Card, Badge, Button, EmptyState } from '../../components/ui'
import { DashboardPage } from '../../components/dashboard'

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
    case 'settled':
      return 'success'
    case 'proposed':
    case 'pending_approval':
      return 'warning'
    case 'failed':
    case 'cancelled':
      return 'danger'
    case 'approved':
    case 'submitted':
      return 'info'
    default:
      return 'neutral'
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'settled':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case 'failed':
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'pending_approval':
    case 'proposed':
      return <Clock className="h-4 w-4 text-amber-500" />
    default:
      return null
  }
}

export default function TrustPayouts() {
  const { state, approvePayoutInstruction, submitPayoutInstruction } = useStore()
  const { user } = useAuth()

  const [filter, setFilter] = useState<string>('all')
  const [actionError, setActionError] = useState<string | null>(null)

  const agencyId = user?.agencyId

  const payouts = useMemo(() => {
    let result = state.payoutInstructions?.filter((p) => !agencyId || p.agencyId === agencyId) ?? []

    if (filter !== 'all') {
      result = result.filter((p) => p.status === filter)
    }

    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [state.payoutInstructions, agencyId, filter])

  const pendingCount = useMemo(
    () =>
      state.payoutInstructions?.filter(
        (p) =>
          (p.status === 'proposed' || p.status === 'pending_approval') &&
          (!agencyId || p.agencyId === agencyId)
      ).length ?? 0,
    [state.payoutInstructions, agencyId]
  )

  const pendingTotal = useMemo(
    () =>
      state.payoutInstructions
        ?.filter(
          (p) =>
            (p.status === 'proposed' || p.status === 'pending_approval') &&
            (!agencyId || p.agencyId === agencyId)
        )
        .reduce((sum, p) => sum + p.amountCents, 0) ?? 0,
    [state.payoutInstructions, agencyId]
  )

  const settledTotal = useMemo(
    () =>
      state.payoutInstructions
        ?.filter(
          (p) => p.status === 'settled' && (!agencyId || p.agencyId === agencyId)
        )
        .reduce((sum, p) => sum + p.amountCents, 0) ?? 0,
    [state.payoutInstructions, agencyId]
  )

  function handleApprove(id: string) {
    if (!user) return
    const result = approvePayoutInstruction({ instructionId: id, approverUserId: user.id })
    setActionError(result.ok ? null : (result.error ?? 'Approval failed'))
  }

  function handleSubmit(id: string) {
    if (!user) return
    const result = submitPayoutInstruction({ instructionId: id, actorUserId: user.id })
    setActionError(result.ok ? null : (result.error ?? 'Submission failed'))
  }


  return (
    <DashboardPage>
      <PageHeader
        title="Payouts"
        subtitle="Manage payout proposals, approvals, and submissions"
      />

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-ink-500">Pending Approval</p>
          <p className="text-xl font-semibold text-amber-600">{pendingCount}</p>
          <p className="text-xs text-ink-400">{formatCents(pendingTotal)} total</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Settled (this period)</p>
          <p className="text-xl font-semibold text-emerald-600">{formatCents(settledTotal)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Total Payouts</p>
          <p className="text-xl font-semibold text-ink">
            {formatCents(
              (state.payoutInstructions?.filter((p) => !agencyId || p.agencyId === agencyId) ?? []).reduce(
                (sum, p) => sum + p.amountCents,
                0
              )
            )}
          </p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['all', 'proposed', 'pending_approval', 'approved', 'submitted', 'settled', 'failed'].map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f.replace('_', ' ')}
          </Button>
        ))}
      </div>

      {/* Payouts List */}
      {payouts.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            title="No payouts found"
            description="No payouts match your current filter."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {payouts.map((payout) => (
            <Card key={payout.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  {statusIcon(payout.status)}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink">{payout.payeeType}</p>
                      <Badge tone={statusTone(payout.status)}>
                        {payout.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <p className="text-sm text-ink-500">
                      Property: {payout.propertyId} • Bucket: {payout.bucketCode}
                    </p>
                    <p className="text-sm text-ink-500">
                      Proposed by: {state.users.find((u) => u.id === payout.proposedBy)?.name ?? payout.proposedBy} • {formatDate(payout.createdAt)}
                    </p>
                    {payout.approvedBy && (
                      <p className="text-sm text-ink-500">
                        Approved by: {state.users.find((u) => u.id === payout.approvedBy)?.name ?? payout.approvedBy}
                      </p>
                    )}
                    {payout.settledAt && (
                      <p className="text-sm text-emerald-600">
                        Settled: {formatDate(payout.settledAt)}
                      </p>
                    )}
                    {payout.failureReason && (
                      <p className="text-sm text-red-600">
                        Failed: {payout.failureReason}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-ink">{formatCents(payout.amountCents)}</p>
                  <div className="mt-2 flex gap-2">
                    {payout.status === 'proposed' && payout.proposedBy !== user?.id && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleApprove(payout.id)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve
                      </Button>
                    )}
                    {payout.status === 'proposed' && payout.proposedBy === user?.id && (
                      <p className="max-w-[9rem] text-[11px] leading-snug text-ink-400">
                        Awaiting a second user to approve (dual control)
                      </p>
                    )}
                    {payout.status === 'approved' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleSubmit(payout.id)}
                      >
                        <Wallet className="h-4 w-4" />
                        Submit
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{actionError}</div>
      )}

      {/* Dual Control Notice */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <strong>Dual Control:</strong> Payouts require two distinct users — one to propose and one to approve.
        The approver cannot be the same person who proposed the payout. This ensures segregation of duties
        for client fund movements.
      </div>
    </DashboardPage>
  )
}
