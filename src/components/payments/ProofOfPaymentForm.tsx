import { useState, type FormEvent } from 'react'
import type { PaymentAttachment } from '../../types/domain'
import { Button, Input, Textarea } from '../ui'
import { PaymentAttachmentsField } from './PaymentAttachmentsField'

export type ProofInput = { reference: string; notes?: string; attachments: PaymentAttachment[] }

/** Reference, notes and uploaded proof (bank slip, screenshot, PDF) for a payment someone has made. */
export function ProofOfPaymentForm({
  onSubmit,
  onCancel,
  uploadedByName,
  submitLabel = 'Submit proof',
}: {
  onSubmit: (input: ProofInput) => void
  onCancel?: () => void
  uploadedByName?: string | null
  submitLabel?: string
}) {
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<PaymentAttachment[]>([])
  const [error, setError] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!reference.trim() && !files.length) {
      setError('Add the payment reference or upload your proof of payment.')
      return
    }
    onSubmit({ reference: reference.trim(), notes: notes.trim() || undefined, attachments: files })
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-primary-50/60 p-3">
      <label className="block text-sm">
        <span className="font-medium text-ink">Payment reference</span>
        <Input className="mt-1" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="EFT reference or receipt number" />
      </label>
      <PaymentAttachmentsField value={files} onChange={setFiles} uploadedByName={uploadedByName} />
      <label className="block text-sm">
        <span className="font-medium text-ink">Notes (optional)</span>
        <Textarea className="mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bank used, date paid, any extra detail…" />
      </label>
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-10 cursor-pointer">{submitLabel}</Button>
        {onCancel ? (
          <Button type="button" variant="secondary" className="min-h-10 cursor-pointer" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  )
}
