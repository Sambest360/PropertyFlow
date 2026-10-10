import { useMemo, useState } from 'react'
import {
  KeyRound,
  Calendar,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { formatZAR } from '../../data/seed'
import { PageHeader, Card, Badge, Button, EmptyState } from '../../components/ui'
import { DashboardPage } from '../../components/dashboard'
import { FieldHelp } from '../../components/onboarding/FieldHelp'
import { TRUST_MODE_A_COPY } from '../../lib/trust/modeA'
import { DEPOSIT_REFUND_RECORDED_LABEL } from '../../lib/trust/depositDualControl'
import type { DepositHolding } from '../../types/domain'

const toCents = (zar: string) => Math.round(Number(zar || '0') * 100)

/** Recorded refund split for one deposit (D2). Recorded only, never bank-confirmed. */
export function RefundBreakdown({ refund }: { refund: NonNullable<DepositHolding['refund']> }) {
  return (
    <div className="text-[11px] leading-snug text-ink-500" data-testid="deposit-refund-breakdown">
      <p className="font-medium text-ink">{DEPOSIT_REFUND_RECORDED_LABEL}</p>
      <p>Held {formatCents(refund.heldCents)}</p>
      <p>Interest (entered by staff) {formatCents(refund.interestCents)}</p>
      <p>Deposit returned {formatCents(refund.refundedCents)}</p>
      {refund.deductions.map((d, i) => (
        <p key={i}>
          Deduction: {d.reason} {formatCents(d.amountCents)}
        </p>
      ))}
    </div>
  )
}

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
      return 'neutral'
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
  const {
    state,
    upsertHeldDeposit,
    proposeDepositRelease,
    approveDepositRelease,
    rejectDepositRelease,
    cancelDepositRelease,
    recordDepositRefund,
  } = useStore()
  const { user } = useAuth()

  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [occupancyId, setOccupancyId] = useState('')
  const [expectedZar, setExpectedZar] = useState('')
  const [heldZar, setHeldZar] = useState('')
  const [deadline, setDeadline] = useState('')
  const [panel, setPanel] = useState<{ id: string; kind: 'reject' | 'refund' } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [refundZar, setRefundZar] = useState('')
  const [interestZar, setInterestZar] = useState('')
  const [deductions, setDeductions] = useState<{ reason: string; zar: string }[]>([])

  const agencyId = user?.agencyId

  const deposits = useMemo(
    () =>
      state.depositHoldings?.filter((d) => !agencyId || d.agencyId === agencyId) ?? [],
    [state.depositHoldings, agencyId],
  )

  const totalHeld = useMemo(
    () => deposits.filter((d) => d.status === 'held').reduce((sum, d) => sum + d.heldCents, 0),
    [deposits],
  )

  const totalInterest = useMemo(
    () => deposits.reduce((sum, d) => sum + d.interestAccruedCents, 0),
    [deposits],
  )

  const upcomingDeadlines = useMemo(
    () =>
      deposits
        .filter((d) => d.status === 'held' && d.statutoryDeadlineOn)
        .sort(
          (a, b) =>
            new Date(a.statutoryDeadlineOn!).getTime() -
            new Date(b.statutoryDeadlineOn!).getTime(),
        )
        .slice(0, 5),
    [deposits],
  )

  async function handleCreateHeld() {
    if (!user?.agencyId) return
    const expectedCents = Math.round(Number(expectedZar) * 100)
    const heldCents = Math.round(Number(heldZar || expectedZar) * 100)
    setBusyId('create')
    const result = await upsertHeldDeposit({
      agencyId: user.agencyId,
      actorUserId: user.id,
      occupancyId,
      expectedCents,
      heldCents,
      statutoryDeadlineOn: deadline.trim() || null,
    })
    setBusyId(null)
    setActionError(result.ok ? null : (result.error ?? 'Create failed'))
    if (result.ok) {
      setOccupancyId('')
      setExpectedZar('')
      setHeldZar('')
      setDeadline('')
    }
  }

  async function handlePropose(id: string) {
    if (!user) return
    setBusyId(id)
    const result = await proposeDepositRelease({ depositId: id, actorUserId: user.id })
    setBusyId(null)
    setActionError(result.ok ? null : (result.error ?? 'Propose failed'))
  }

  async function handleApprove(id: string) {
    if (!user) return
    setBusyId(id)
    const result = await approveDepositRelease({ depositId: id, approverUserId: user.id })
    setBusyId(null)
    setActionError(result.ok ? null : (result.error ?? 'Approve failed'))
  }

  function openPanel(id: string, kind: 'reject' | 'refund') {
    setPanel({ id, kind })
    setRejectReason('')
    setRefundZar('')
    setInterestZar('')
    setDeductions([])
  }

  async function finish(id: string, run: () => Promise<{ ok: boolean; error?: string }>, fallback: string) {
    if (!user) return
    setBusyId(id)
    const result = await run()
    setBusyId(null)
    setActionError(result.ok ? null : (result.error ?? fallback))
    if (result.ok) setPanel(null)
  }

  const handleReject = (id: string) =>
    finish(id, () => rejectDepositRelease({ depositId: id, actorUserId: user!.id, reason: rejectReason }), 'Reject failed')
  const handleCancel = (id: string) =>
    finish(id, () => cancelDepositRelease({ depositId: id, actorUserId: user!.id }), 'Cancel failed')
  const handleRefund = (id: string) =>
    finish(
      id,
      () =>
        recordDepositRefund({
          depositId: id,
          actorUserId: user!.id,
          refundedCents: toCents(refundZar),
          interestCents: toCents(interestZar),
          deductions: deductions.map((d) => ({ reason: d.reason, amountCents: toCents(d.zar) })),
        }),
      'Recording the refund failed',
    )

  return (
    <DashboardPage>
      <PageHeader
        title="Deposit Register"
        subtitle="Deposit register — create/held + dual-control release"
      />
      <div className="mb-2"><FieldHelp title="Trust deposits" body={TRUST_MODE_A_COPY} /></div>

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

      <Card className="p-5">
        <h3 className="mb-3 text-lg font-semibold text-ink">Record held deposit</h3>
        <p className="mb-4 text-sm text-ink-500">
          Durable create/upsert — survives reload via deposit_holding persist. Not a bank receipt.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="text-sm">
            <span className="text-ink-500">Occupancy id</span>
            <input
              className="mt-1 w-full rounded-lg border border-primary-200 px-3 py-2"
              value={occupancyId}
              onChange={(e) => setOccupancyId(e.target.value)}
              placeholder="TN-…"
              data-testid="deposit-occupancy-input"
            />
          </label>
          <label className="text-sm">
            <span className="text-ink-500">Expected (ZAR)</span>
            <input
              className="mt-1 w-full rounded-lg border border-primary-200 px-3 py-2"
              value={expectedZar}
              onChange={(e) => setExpectedZar(e.target.value)}
              inputMode="decimal"
              placeholder="25000"
            />
          </label>
          <label className="text-sm">
            <span className="text-ink-500">Held (ZAR)</span>
            <input
              className="mt-1 w-full rounded-lg border border-primary-200 px-3 py-2"
              value={heldZar}
              onChange={(e) => setHeldZar(e.target.value)}
              inputMode="decimal"
              placeholder="same as expected"
            />
          </label>
          <label className="text-sm">
            <span className="text-ink-500">Statutory deadline</span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-primary-200 px-3 py-2"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-3">
          <Button
            variant="primary"
            size="sm"
            disabled={!occupancyId.trim() || !expectedZar || busyId === 'create'}
            onClick={() => void handleCreateHeld()}
            data-testid="deposit-create-held"
          >
            Create / upsert held
          </Button>
        </div>
      </Card>

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

      <Card>
        <div className="p-4 border-b border-primary-100">
          <h3 className="text-lg font-semibold text-ink">All Deposits</h3>
        </div>

        {deposits.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No deposits found"
              description="Create a held deposit above, or wait for occupancy-linked holdings."
            />
          </div>
        ) : (
          <div className="divide-y divide-primary-100">
            <div className="grid grid-cols-12 gap-4 bg-primary-50/50 px-4 py-3 text-xs font-medium text-ink-500">
              <div className="col-span-2">Occupancy</div>
              <div className="col-span-2">Expected</div>
              <div className="col-span-2">Held</div>
              <div className="col-span-1">Interest</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1">Deadline</div>
              <div className="col-span-2">Actions</div>
            </div>

            {deposits.map((deposit) => {
              const days = deposit.statutoryDeadlineOn
                ? daysUntil(deposit.statutoryDeadlineOn)
                : null
              const isProposer = deposit.releaseProposedBy === user?.id
              return (
                <div
                  key={deposit.id}
                  className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-primary-50/30 transition-colors items-center"
                >
                  <div className="col-span-2">
                    <p className="font-medium text-ink">{deposit.occupancyId}</p>
                    <p className="text-[11px] text-ink-400">{deposit.id}</p>
                  </div>
                  <div className="col-span-2 text-sm text-ink">
                    {formatCents(deposit.expectedCents)}
                  </div>
                  <div className="col-span-2 text-sm font-medium text-ink">
                    {formatCents(deposit.heldCents)}
                  </div>
                  <div className="col-span-1 text-sm text-ink-500">
                    {formatCents(deposit.interestAccruedCents)}
                  </div>
                  <div className="col-span-2">
                    <Badge tone={statusTone(deposit.status)}>
                      {deposit.status === 'refunded' ? 'Refund recorded' : deposit.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="col-span-1 text-sm">
                    {deposit.statutoryDeadlineOn ? (
                      <span className={days !== null && days <= 7 ? 'text-red-600 font-medium' : 'text-ink'}>
                        {formatDate(deposit.statutoryDeadlineOn)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </div>
                  <div className="col-span-2 flex flex-col gap-1">
                    {deposit.status === 'held' && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busyId === deposit.id}
                        onClick={() => void handlePropose(deposit.id)}
                        data-testid={`deposit-propose-${deposit.id}`}
                      >
                        Propose release
                      </Button>
                    )}
                    {deposit.status === 'release_proposed' && !isProposer && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busyId === deposit.id}
                        onClick={() => void handleApprove(deposit.id)}
                        data-testid={`deposit-approve-${deposit.id}`}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve release
                      </Button>
                    )}
                    {deposit.status === 'release_proposed' && isProposer && (
                      <p className="text-[11px] leading-snug text-ink-400">
                        Awaiting a second user to approve (dual control)
                      </p>
                    )}
                    {deposit.status === 'release_proposed' && !isProposer && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyId === deposit.id}
                        onClick={() => openPanel(deposit.id, 'reject')}
                        data-testid={`deposit-reject-${deposit.id}`}
                      >
                        Reject release
                      </Button>
                    )}
                    {(deposit.status === 'release_proposed' || deposit.status === 'release_approved') && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyId === deposit.id}
                        onClick={() => void handleCancel(deposit.id)}
                        data-testid={`deposit-cancel-${deposit.id}`}
                      >
                        Cancel release
                      </Button>
                    )}
                    {deposit.status === 'release_approved' && (
                      <>
                        <p className="text-[11px] leading-snug text-ink-400">
                          Release approved in-app — not a bank refund
                        </p>
                        {deposit.releaseApprovedBy !== user?.id && (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={busyId === deposit.id}
                            onClick={() => openPanel(deposit.id, 'refund')}
                            data-testid={`deposit-refund-${deposit.id}`}
                          >
                            Record refund
                          </Button>
                        )}
                      </>
                    )}
                    {deposit.status === 'refunded' && deposit.refund && (
                      <RefundBreakdown refund={deposit.refund} />
                    )}
                    {panel?.id === deposit.id && panel.kind === 'reject' && (
                      <div className="flex flex-col gap-1">
                        <textarea
                          className="rounded border border-primary-200 p-1 text-xs"
                          maxLength={500}
                          placeholder="Reason (required)"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          data-testid={`deposit-reject-reason-${deposit.id}`}
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={busyId === deposit.id || !rejectReason.trim()}
                          onClick={() => void handleReject(deposit.id)}
                        >
                          Confirm reject
                        </Button>
                      </div>
                    )}
                    {panel?.id === deposit.id && panel.kind === 'refund' && (
                      <div className="flex flex-col gap-1 text-xs" data-testid={`deposit-refund-form-${deposit.id}`}>
                        <p className="text-ink-400">
                          Held {formatCents(deposit.heldCents)}. Returned + deductions must equal held + interest.
                        </p>
                        <label>
                          Deposit returned (R)
                          <input className="w-full rounded border border-primary-200 p-1" inputMode="decimal" value={refundZar} onChange={(e) => setRefundZar(e.target.value)} />
                        </label>
                        <label>
                          Interest (entered by staff) (R)
                          <input className="w-full rounded border border-primary-200 p-1" inputMode="decimal" value={interestZar} onChange={(e) => setInterestZar(e.target.value)} />
                        </label>
                        {deductions.map((d, i) => (
                          <div key={i} className="flex gap-1">
                            <input
                              className="flex-1 rounded border border-primary-200 p-1"
                              placeholder="Deduction reason"
                              value={d.reason}
                              onChange={(e) => setDeductions((xs) => xs.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))}
                            />
                            <input
                              className="w-20 rounded border border-primary-200 p-1"
                              inputMode="decimal"
                              placeholder="R"
                              value={d.zar}
                              onChange={(e) => setDeductions((xs) => xs.map((x, j) => (j === i ? { ...x, zar: e.target.value } : x)))}
                            />
                          </div>
                        ))}
                        <Button variant="secondary" size="sm" onClick={() => setDeductions((xs) => [...xs, { reason: '', zar: '' }])}>
                          Add deduction
                        </Button>
                        <Button variant="primary" size="sm" disabled={busyId === deposit.id} onClick={() => void handleRefund(deposit.id)}>
                          Record refund (not bank-confirmed)
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {actionError}
        </div>
      )}

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <strong>Dual control + statutory guidance:</strong> Propose and approve release must be
        different user ids. RHA s5(3) deadlines are compliance reminders — not a live interest feed
        or bank settlement. release_approved ≠ refunded. A recorded refund is a record only — not
        bank-confirmed.
      </div>
    </DashboardPage>
  )
}
