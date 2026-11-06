import { useEffect, useState } from 'react'
import type { PaymentRecord } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { Button, Input, Modal, Select, Textarea } from '../ui'
import { PaymentAttachmentsField, PaymentAttachmentsList } from './PaymentAttachmentsField'
import {
  MARK_PAID_METHOD_LABELS,
  isTenantReportedPayment,
  sastYmd,
  toClosedMarkPaidMethodLabel,
  type MarkPaymentPaidDetails,
  type MarkPaymentPaidOutcome,
} from './types'

const DATE_REASON_CHOICES = [
  { value: 'Paid early', label: 'Paid early' },
  { value: 'Captured late from statement', label: 'Captured late from statement' },
  { value: 'Other', label: 'Other' },
] as const

function cents(v: number): number {
  return Math.round(v * 100)
}

export type DuplicatePaymentSummary = {
  id: string
  type?: string
  status?: string
  dueDate?: string
}

export function MarkPaymentPaidModal({
  open,
  payment,
  actorName,
  confirmLabel = 'Mark paid',
  onClose,
  onConfirm,
}: {
  open: boolean
  payment: PaymentRecord
  actorName: string
  confirmLabel?: string
  onClose: () => void
  onConfirm: (
    details: MarkPaymentPaidDetails,
  ) => void | boolean | MarkPaymentPaidOutcome | Promise<void | boolean | MarkPaymentPaidOutcome>
}) {
  const confirmingTenant = isTenantReportedPayment(payment)
  const [method, setMethod] = useState(toClosedMarkPaidMethodLabel(payment.method))
  const methods = [...MARK_PAID_METHOD_LABELS]
  const [paidAt, setPaidAt] = useState(confirmingTenant ? '' : sastYmd())
  const [reference, setReference] = useState(payment.reference ?? '')
  const [paidAmount, setPaidAmount] = useState(String(payment.amount))
  const [notes, setNotes] = useState(payment.notes ?? '')
  const [attachments, setAttachments] = useState(payment.attachments ?? [])
  const [amountChangeReason, setAmountChangeReason] = useState('')
  const [dateReason, setDateReason] = useState('')
  const [dateReasonOther, setDateReasonOther] = useState('')
  const [createBalance, setCreateBalance] = useState(true)
  const [shortfallReason, setShortfallReason] = useState('')
  const [formError, setFormError] = useState('')
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)
  const [duplicateReason, setDuplicateReason] = useState('')
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    message: string
    sharedReferenceCount?: number
    otherPayments: DuplicatePaymentSummary[]
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    const confirm = isTenantReportedPayment(payment)
    setMethod(toClosedMarkPaidMethodLabel(payment.method))
    setPaidAt(confirm ? '' : sastYmd())
    setReference(payment.reference ?? '')
    setPaidAmount(String(payment.amount))
    setNotes(payment.notes ?? '')
    setAttachments(payment.attachments ?? [])
    setAmountChangeReason('')
    setDateReason('')
    setDateReasonOther('')
    setCreateBalance(true)
    setShortfallReason('')
    setFormError('')
    setConfirmDuplicate(false)
    setDuplicateReason('')
    setDuplicatePrompt(null)
    setSubmitting(false)
  }, [open, payment])

  const enteredAmount = Number.parseFloat(paidAmount)
  const amountOk = Number.isFinite(enteredAmount)
  const amountDiffers = amountOk && cents(enteredAmount) !== cents(payment.amount)
  const shortfall = amountOk && cents(enteredAmount) < cents(payment.amount)
  const overpay = amountOk && cents(enteredAmount) > cents(payment.amount)
  const balanceCents = shortfall ? cents(payment.amount) - cents(enteredAmount) : 0
  const balanceZar = formatZAR(balanceCents / 100)
  const dateBeforeCreated = Boolean(paidAt && payment.createdAt && paidAt < payment.createdAt)

  // Slice A (server rule A3): a reference (typed, or the stored one shown
  // here), or a typed note that is new, before this can be marked paid.
  const hasEvidence =
    reference.trim() !== '' || (notes.trim() !== '' && notes.trim() !== (payment.notes ?? '').trim())
  const dateReady = paidAt.trim() !== ''
  const dateReasonReady =
    !dateBeforeCreated ||
    (dateReason === 'Paid early' ||
      dateReason === 'Captured late from statement' ||
      (dateReason === 'Other' && dateReasonOther.trim() !== ''))
  const amountReasonReady = !amountDiffers || amountChangeReason.trim() !== ''
  // Unticked shortfall needs a reason; ticked (default) creates the balance row.
  const shortfallReady = !shortfall || createBalance || shortfallReason.trim() !== ''
  const duplicateReady = !duplicatePrompt || confirmDuplicate
  const canMarkPaid =
    hasEvidence && dateReady && dateReasonReady && amountReasonReady && shortfallReady && duplicateReady && !submitting

  const submit = async () => {
    if (!dateReady) {
      setFormError('Date received is required.')
      return
    }
    if (!canMarkPaid) return
    const amount = Number.parseFloat(paidAmount)
    const receivedDateReason = dateBeforeCreated
      ? dateReason === 'Other'
        ? `Other: ${dateReasonOther.trim()}`
        : dateReason
      : undefined
    const details: MarkPaymentPaidDetails = {
      method,
      paidAt,
      reference: reference.trim() || null,
      paidAmount: Number.isFinite(amount) ? amount : payment.amount,
      notes: notes.trim() || null,
      attachments,
      recordedByName: actorName,
      amountChangeReason: amountDiffers ? amountChangeReason.trim() : undefined,
      receivedDateReason,
      createBalanceForShortfall: createBalance && shortfall ? true : undefined,
      shortfallReason: shortfall && !createBalance ? shortfallReason.trim() : undefined,
      confirmDuplicateReference: confirmDuplicate ? true : undefined,
      duplicateReferenceReason: confirmDuplicate && duplicateReason.trim() ? duplicateReason.trim() : undefined,
    }
    setSubmitting(true)
    setFormError('')
    try {
      const outcome = await onConfirm(details)
      if (outcome && typeof outcome === 'object' && outcome.ok === false && outcome.code === 'PAYMENT_REFERENCE_DUPLICATE') {
        setDuplicatePrompt({
          message: outcome.message,
          sharedReferenceCount: outcome.sharedReferenceCount,
          otherPayments: outcome.otherPayments ?? [],
        })
        setConfirmDuplicate(false)
        return
      }
      // Parent closes on success; stay open on plain false.
    } finally {
      setSubmitting(false)
    }
  }

  const title = confirmingTenant ? 'Confirm tenant payment' : 'Mark payment as paid'
  const description = confirmingTenant
    ? `${payment.type} · Billed ${formatZAR(payment.amount)} · Due ${payment.dueDate}. Confirm only after the money shows on your bank statement.`
    : `${payment.type} · Billed ${formatZAR(payment.amount)} · Due ${payment.dueDate}`

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" className="min-h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button className="min-h-11" onClick={() => void submit()} disabled={!canMarkPaid}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError ? (
          <p className="text-sm text-accent" role="status">
            {formError}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-500">Method</span>
            <Select className="min-h-11" value={method} onChange={(e) => setMethod(toClosedMarkPaidMethodLabel(e.target.value))}>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-500">Date received</span>
            <Input
              type="date"
              className="min-h-11"
              value={paidAt}
              onChange={(e) => {
                setPaidAt(e.target.value)
                setFormError('')
              }}
            />
            {confirmingTenant ? (
              <span className="mt-1 block text-xs text-ink-500">
                The date the money reached your account, from your statement
              </span>
            ) : null}
            {!dateReady ? (
              <span className="mt-1 block text-xs text-accent">Date received is required.</span>
            ) : null}
          </label>
        </div>

        {dateBeforeCreated ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-500">Why is this date before the payment was added?</span>
            <Select className="min-h-11" value={dateReason} onChange={(e) => setDateReason(e.target.value)}>
              <option value="">Select a reason</option>
              {DATE_REASON_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            {dateReason === 'Other' ? (
              <Input
                className="mt-2 min-h-11"
                placeholder="Short reason"
                value={dateReasonOther}
                onChange={(e) => setDateReasonOther(e.target.value)}
              />
            ) : null}
          </label>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-500">EFT reference or note (required)</span>
          {confirmingTenant ? (
            <p className="min-h-11 rounded-xl border border-primary-100 bg-primary-50/50 px-3 py-2 text-sm text-ink">
              {reference.trim() || '—'}
            </p>
          ) : (
            <Input
              className="min-h-11"
              placeholder="Bank reference, receipt no., etc."
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          )}
          <span className="mt-1 block text-xs text-ink-500">
            This stays on the payment record. For cash, type the receipt number as a note.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-500">Amount received</span>
          <Input
            type="number"
            min={0}
            step="0.01"
            className="min-h-11 tabular"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
          />
        </label>

        {overpay ? (
          <p className="text-sm text-ink-600" role="status">
            The amount paid is more than the billed amount. Record the extra as a credit (it reduces
            what the tenant owes) or change the amount to match the bill.
          </p>
        ) : null}

        {amountDiffers ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-500">Why does the amount differ?</span>
            <Input
              className="min-h-11"
              value={amountChangeReason}
              onChange={(e) => setAmountChangeReason(e.target.value)}
            />
          </label>
        ) : null}

        {shortfall ? (
          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-1"
              checked={createBalance}
              onChange={(e) => setCreateBalance(e.target.checked)}
            />
            <span>Create a payment for the balance of {balanceZar}</span>
          </label>
        ) : null}

        {shortfall && !createBalance ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-500">Shortfall reason</span>
            <Input
              className="min-h-11"
              value={shortfallReason}
              onChange={(e) => setShortfallReason(e.target.value)}
            />
          </label>
        ) : null}

        {duplicatePrompt ? (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3" role="status">
            <p className="text-sm text-ink">{duplicatePrompt.message}</p>
            {duplicatePrompt.otherPayments.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
                {duplicatePrompt.otherPayments.map((p) => (
                  <li key={p.id}>
                    {p.id}
                    {p.type ? ` · ${p.type}` : ''}
                    {p.status ? ` · ${p.status}` : ''}
                    {p.dueDate ? ` · due ${p.dueDate}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmDuplicate}
                onChange={(e) => setConfirmDuplicate(e.target.checked)}
              />
              <span>Yes, this reference is correct</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-500">Why? (optional)</span>
              <Input
                className="min-h-11"
                value={duplicateReason}
                onChange={(e) => setDuplicateReason(e.target.value)}
              />
            </label>
          </div>
        ) : null}

        <p className="text-xs text-ink-500">Recorded by {actorName} (you)</p>

        {confirmingTenant ? (
          <div className="space-y-2 rounded-xl border border-primary-100 bg-primary-50/40 p-3">
            <p className="text-xs font-medium text-ink-500">Tenant proof (read only)</p>
            {notes ? <p className="text-sm text-ink">{notes}</p> : null}
            {attachments.length ? <PaymentAttachmentsList attachments={attachments} /> : null}
          </div>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-500">Notes</span>
              <Textarea
                rows={3}
                placeholder="Remittance details, partial payment context, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <PaymentAttachmentsField
              value={attachments}
              onChange={setAttachments}
              uploadedByName={actorName}
            />
          </>
        )}
      </div>
    </Modal>
  )
}
