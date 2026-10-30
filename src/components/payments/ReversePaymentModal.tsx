/**
 * "Reverse this payment?" (spec-admin-reversal 9.1, Step 1). Not wired into
 * PaymentDetail yet: the page edits land after Slice A merges.
 */
import { useEffect, useState } from 'react'
import type { PaymentRecord } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { Button, Input, Modal, Select, Textarea } from '../ui'
import {
  REVERSE_REASON_OPTIONS,
  newRequestId,
  paidInEarlierMonth,
  reversalFormProblem,
  reversePayment,
  type ReversalPaymentView,
  type ReverseReasonKind,
} from '../../lib/api/paymentReversalApi'

export function ReversePaymentModal({
  open,
  payment,
  breakGlass = false,
  onClose,
  onDone,
}: {
  open: boolean
  payment: PaymentRecord & { updatedAt?: string | null }
  /** A super_admin session: a support ticket reference is required. */
  breakGlass?: boolean
  onClose: () => void
  onDone: (payment: ReversalPaymentView) => void
}) {
  const [reasonKind, setReasonKind] = useState<ReverseReasonKind | ''>('')
  const [reason, setReason] = useState('')
  const [clearReference, setClearReference] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [ticket, setTicket] = useState('')
  const [requestId, setRequestId] = useState(newRequestId)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [serverWantsAck, setServerWantsAck] = useState(false)

  useEffect(() => {
    if (!open) return
    setReasonKind('')
    setReason('')
    setClearReference(false)
    setAcknowledged(false)
    setTicket('')
    setRequestId(newRequestId())
    setError(null)
    setServerWantsAck(false)
  }, [open, payment.id])

  const needsAck = serverWantsAck || paidInEarlierMonth(payment.paidAt)
  const isPayFast = payment.method === 'PayFast' || (payment.reference ?? '').startsWith('PF-')

  const submit = async () => {
    const problem = reversalFormProblem({ reasonKind: reasonKind || null, reason, needsAck, acknowledged, needsTicket: breakGlass, ticket })
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    const result = await reversePayment(payment.id, {
      reasonKind: reasonKind as ReverseReasonKind,
      reason,
      expectedUpdatedAt: payment.updatedAt ?? '',
      requestId,
      clearReference,
      acknowledgeEarlierMonth: needsAck ? acknowledged : false,
      ...(breakGlass ? { supportTicketRef: ticket } : {}),
    })
    setBusy(false)
    // `in` narrowing: tsconfig.app.json is not strict, so `ok` alone does not narrow.
    if ('payment' in result) {
      onDone(result.payment)
      return
    }
    if (result.code === 'PAYMENT_REVERSAL_ACK_REQUIRED') setServerWantsAck(true)
    setError(result.message)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reverse this payment?"
      description={`${payment.type} · ${formatZAR(payment.amount)} · Due ${payment.dueDate}`}
      footer={
        <>
          <Button variant="secondary" className="min-h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button className="min-h-11" onClick={() => void submit()} disabled={busy}>
            Reverse payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-600">
          The payment goes back to Due. The paid date, amount received and method are cleared. The record of what was
          recorded stays in the history. Nothing is deleted.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-500">Why are you reversing it?</span>
          <Select
            className="min-h-11"
            value={reasonKind}
            onChange={(e) => {
              const v = e.target.value as ReverseReasonKind | ''
              setReasonKind(v)
              setClearReference(v === 'WRONG_ROW')
            }}
          >
            <option value="">Pick a reason</option>
            {REVERSE_REASON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        <p className="text-xs text-ink-500">Wrong amount, date, method or reference? Use Correct payment instead.</p>
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={clearReference} onChange={(e) => setClearReference(e.target.checked)} />
          Clear the reference on this row
        </label>
        {needsAck ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            I understand the owner statement for that month will no longer match what may have been sent.
          </label>
        ) : null}
        {isPayFast ? (
          <p className="text-xs text-amber-700">
            This was paid through PayFast. Reversing it only changes your record; the money was received.
          </p>
        ) : null}
        <p className="text-xs text-ink-500">If you also allocated this money in the trust book, reverse it there too.</p>
        <p className="text-xs text-ink-500">
          If the landlord was already paid from this money, the agency is now out of pocket until it is recovered.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
