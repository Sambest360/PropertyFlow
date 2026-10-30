/**
 * "Reopen this payment?" (spec-admin-reversal 9.2, Step 1). Not wired into
 * PaymentDetail yet: the page edits land after Slice A merges.
 */
import { useEffect, useState } from 'react'
import type { PaymentRecord } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { Button, Input, Modal, Select, Textarea } from '../ui'
import {
  REOPEN_REASON_OPTIONS,
  newRequestId,
  reopenPayment,
  reversalFormProblem,
  type ReopenReasonKind,
  type ReversalPaymentView,
} from '../../lib/api/paymentReversalApi'

export function ReopenPaymentModal({
  open,
  payment,
  breakGlass = false,
  onClose,
  onDone,
}: {
  open: boolean
  payment: PaymentRecord & { updatedAt?: string | null }
  breakGlass?: boolean
  onClose: () => void
  onDone: (payment: ReversalPaymentView) => void
}) {
  const [reasonKind, setReasonKind] = useState<ReopenReasonKind | ''>('')
  const [reason, setReason] = useState('')
  const [ticket, setTicket] = useState('')
  const [requestId, setRequestId] = useState(newRequestId)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setReasonKind('')
    setReason('')
    setTicket('')
    setRequestId(newRequestId())
    setError(null)
  }, [open, payment.id])

  const submit = async () => {
    // Reopen never asks for the owner statement acknowledgement (spec v1.3).
    const problem = reversalFormProblem({ reasonKind: reasonKind || null, reason, needsAck: false, acknowledged: false, needsTicket: breakGlass, ticket })
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    const result = await reopenPayment(payment.id, {
      reasonKind: reasonKind as ReopenReasonKind,
      reason,
      expectedUpdatedAt: payment.updatedAt ?? '',
      requestId,
      ...(breakGlass ? { supportTicketRef: ticket } : {}),
    })
    setBusy(false)
    // `in` narrowing: tsconfig.app.json is not strict, so `ok` alone does not narrow.
    if ('payment' in result) onDone(result.payment)
    else setError(result.message)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reopen this payment?"
      description={`${payment.type} · ${formatZAR(payment.amount)} · Due ${payment.dueDate}`}
      footer={
        <>
          <Button variant="secondary" className="min-h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button className="min-h-11" onClick={() => void submit()} disabled={busy}>
            Reopen payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-600">It goes back to Due and the tenant can see it again.</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-500">Why are you reopening it?</span>
          <Select className="min-h-11" value={reasonKind} onChange={(e) => setReasonKind(e.target.value as ReopenReasonKind | '')}>
            <option value="">Pick a reason</option>
            {REOPEN_REASON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-500">Details</span>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <span className="mt-1 block text-xs text-ink-400">
            At least 10 characters. Do not type ID numbers or bank details.
          </span>
        </label>
        {breakGlass ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-500">Support ticket reference</span>
            <Input className="min-h-11" value={ticket} onChange={(e) => setTicket(e.target.value)} />
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
