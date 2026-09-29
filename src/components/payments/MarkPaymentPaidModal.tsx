import { useEffect, useState } from 'react'
import type { PaymentRecord } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { Button, Input, Modal, Select, Textarea } from '../ui'
import { PaymentAttachmentsField } from './PaymentAttachmentsField'
import { paymentDocumentTarget } from '../../lib/storage/targets'
import { PAY_METHODS, type MarkPaymentPaidDetails } from './types'

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
  onConfirm: (details: MarkPaymentPaidDetails) => void
}) {
  const [method, setMethod] = useState(payment.method ?? 'EFT')
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')
  const [paidAmount, setPaidAmount] = useState(String(payment.amount))
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState(payment.attachments ?? [])

  useEffect(() => {
    if (!open) return
    setMethod(payment.method ?? 'EFT')
    setPaidAt(new Date().toISOString().slice(0, 10))
    setReference(payment.reference ?? '')
    setPaidAmount(String(payment.amount))
    setNotes(payment.notes ?? '')
    setAttachments(payment.attachments ?? [])
  }, [open, payment])

  const submit = () => {
    const amount = Number.parseFloat(paidAmount)
    onConfirm({
      method,
      paidAt,
      reference: reference.trim() || null,
      paidAmount: Number.isFinite(amount) ? amount : payment.amount,
      notes: notes.trim() || null,
      attachments,
      recordedByName: actorName,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark payment as paid"
      description={`${payment.type} · Billed ${formatZAR(payment.amount)} · Due ${payment.dueDate}`}
      footer={
        <>
          <Button variant="secondary" className="min-h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button className="min-h-11" onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-500">Method</span>
            <Select className="min-h-11" value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAY_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-500">Paid on</span>
            <Input
              type="date"
              className="min-h-11"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-500">Reference</span>
          <Input
            className="min-h-11"
            placeholder="Bank reference, receipt no., etc."
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
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
          storage={paymentDocumentTarget(payment.agencyId, payment.id)}
        />
      </div>
    </Modal>
  )
}
