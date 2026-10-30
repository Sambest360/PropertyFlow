import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Eye } from 'lucide-react'
import type { PaymentAttachment } from '../../types/domain'
import { Badge, Button, Card, Input, Modal, Select, Textarea } from '../ui'
import { PaymentAttachmentsField, PaymentAttachmentsList } from '../payments/PaymentAttachmentsField'
import { ADVERTISING_FEE_PER_PROPERTY, INCLUDED_IN_EVERY_PLAN, PRICING_TIERS } from '../../lib/saasPricing'
import {
  STATUS_LABEL,
  billingApi,
  formatRand,
  statusTone,
  type BillingAttachment,
  type SaasInvoice,
} from '../../lib/api/billingApi'

export function asPaymentAttachments(list: BillingAttachment[]): PaymentAttachment[] {
  return list.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.mimeType === 'application/pdf' ? 'document' : 'image',
    mimeType: a.mimeType,
    dataUrl: a.dataUrl,
    uploadedAt: a.uploadedAt,
    uploadedByName: a.uploadedByName ?? null,
  })) as PaymentAttachment[]
}

export function InvoiceStatusBadge({ invoice }: { invoice: SaasInvoice }) {
  const waiting = invoice.status !== 'PAID' && invoice.status !== 'VOID' && invoice.proofs.length > invoice.payments.length
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone={statusTone(invoice.status)}>{STATUS_LABEL[invoice.status]}</Badge>
      {waiting ? <Badge tone="info">Proof uploaded</Badge> : null}
    </span>
  )
}

/** The price sheet: sign-up and monthly fee by portfolio size, plus advertising. */
export function PricingCard() {
  return (
    <Card className="overflow-hidden p-0" data-tip-target="billing-pricing">
      <div className="border-b border-primary-50 px-5 py-4">
        <h2 className="font-semibold text-ink">Pricing</h2>
        <p className="text-sm text-ink-500">Billed monthly. Prices exclude VAT (15% is added on each invoice).</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead className="bg-primary-600 text-left text-xs uppercase tracking-wide text-white">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Portfolio size</th>
              <th className="px-5 py-2.5 text-right font-semibold">Once-off sign-up</th>
              <th className="px-5 py-2.5 text-right font-semibold">Monthly</th>
            </tr>
          </thead>
          <tbody>
            {PRICING_TIERS.map((t) => (
              <tr key={t.id} className="border-t border-primary-50">
                <td className="px-5 py-2.5 text-ink">{t.label}</td>
                <td className="px-5 py-2.5 text-right font-semibold tabular text-ink">{t.signUpFee == null ? <span className="text-accent">Contact us</span> : formatRand(t.signUpFee)}</td>
                <td className="px-5 py-2.5 text-right font-semibold tabular text-ink">{t.monthlyFee == null ? <span className="text-accent">Contact us</span> : formatRand(t.monthlyFee)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 border-t border-primary-50 p-5 sm:grid-cols-2">
        <ul className="space-y-1 text-sm text-ink-600">
          {INCLUDED_IN_EVERY_PLAN.map((x) => (
            <li key={x} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" aria-hidden /> {x}
            </li>
          ))}
        </ul>
        <div className="rounded-xl bg-primary-50 p-3 text-sm">
          <p className="font-semibold text-ink">Front-page advertising</p>
          <p className="text-ink-600">{formatRand(ADVERTISING_FEE_PER_PROPERTY)} per featured property per month.</p>
        </div>
      </div>
    </Card>
  )
}

export function InvoiceList({
  invoices,
  showAgency,
  onRecordPayment,
  onUploadProof,
}: {
  invoices: SaasInvoice[]
  showAgency?: boolean
  onRecordPayment?: (inv: SaasInvoice) => void
  onUploadProof?: (inv: SaasInvoice) => void
}) {
  if (!invoices.length) return <p className="px-5 py-8 text-center text-sm text-ink-500">No invoices yet.</p>
  return (
    <ul className="divide-y divide-primary-50" data-tip-target="page-list">
      {invoices.map((inv) => (
        <li key={inv.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-semibold text-ink">
              {inv.number} · {inv.periodLabel}
              {showAgency ? <span className="font-normal text-ink-500"> · {inv.agencyName}</span> : null}
            </p>
            <p className="text-xs text-ink-500">
              {formatRand(inv.total)} incl. VAT · due {inv.dueDate}
              {inv.amountPaid > 0 && inv.status !== 'PAID' ? ` · ${formatRand(inv.balance)} still owed` : ''}
            </p>
            <div className="mt-1"><InvoiceStatusBadge invoice={inv} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/workspace/billing/invoices/${inv.id}`}>
              <Button size="sm" variant="secondary"><Eye className="h-4 w-4" aria-hidden /> View / download</Button>
            </Link>
            {onUploadProof && inv.status !== 'PAID' && inv.status !== 'VOID' ? (
              <Button size="sm" variant="secondary" onClick={() => onUploadProof(inv)}>Upload proof of payment</Button>
            ) : null}
            {onRecordPayment && inv.status !== 'PAID' && inv.status !== 'VOID' ? (
              <Button size="sm" onClick={() => onRecordPayment(inv)}>Record payment</Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function RecordPaymentModal({ invoice, onClose, onSaved, actorName }: { invoice: SaasInvoice | null; onClose: () => void; onSaved: (inv: SaasInvoice) => void; actorName: string }) {
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('EFT')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<PaymentAttachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!invoice) return null
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      onSaved(await billingApi.recordPayment(invoice.id, { amount: Number(amount || invoice.balance), paidOn, method, reference, note, attachments: files }))
      setFiles([])
      setReference('')
      setNote('')
      setAmount('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the payment')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Record payment · ${invoice.number}`}
      description={`${invoice.agencyName} owes ${formatRand(invoice.balance)}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</Button>
        </>
      }
    >
      <div className="space-y-3">
        {invoice.proofs.length ? (
          <div className="rounded-xl bg-primary-50 p-3 text-sm">
            <p className="font-semibold text-ink">Proof the agency uploaded</p>
            {invoice.proofs.map((p) => (
              <div key={p.id} className="mt-2">
                <p className="text-ink-600">{p.uploadedBy} · {new Date(p.at).toLocaleDateString()}{p.reference ? ` · ref ${p.reference}` : ''}</p>
                <PaymentAttachmentsList attachments={asPaymentAttachments(p.attachments)} />
              </div>
            ))}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm"><span className="font-medium text-ink">Amount received</span>
            <Input className="mt-1" type="number" min="0" step="0.01" placeholder={invoice.balance.toFixed(2)} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="text-sm"><span className="font-medium text-ink">Date paid</span>
            <Input className="mt-1" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </label>
          <label className="text-sm"><span className="font-medium text-ink">Method</span>
            <Select className="mt-1" value={method} onChange={(e) => setMethod(e.target.value)}>
              {['EFT', 'Card', 'Debit order', 'Cash', 'Other'].map((m) => <option key={m}>{m}</option>)}
            </Select>
          </label>
          <label className="text-sm"><span className="font-medium text-ink">Reference</span>
            <Input className="mt-1" value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        </div>
        <PaymentAttachmentsField value={files} onChange={setFiles} uploadedByName={actorName} />
        <label className="block text-sm"><span className="font-medium text-ink">Note (optional)</span>
          <Textarea className="mt-1" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      </div>
    </Modal>
  )
}

export function UploadProofModal({ invoice, onClose, onSaved, actorName }: { invoice: SaasInvoice | null; onClose: () => void; onSaved: (inv: SaasInvoice) => void; actorName: string }) {
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<PaymentAttachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!invoice) return null
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      onSaved(await billingApi.submitProof(invoice.id, { reference, note, attachments: files }))
      setFiles([])
      setReference('')
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the proof')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Proof of payment · ${invoice.number}`}
      description={`Paid ${formatRand(invoice.balance)}? Upload the bank slip or screenshot so we can confirm it.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy}>{busy ? 'Uploading…' : 'Send proof'}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block text-sm"><span className="font-medium text-ink">Payment reference</span>
          <Input className="mt-1" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={invoice.number} />
        </label>
        <PaymentAttachmentsField value={files} onChange={setFiles} uploadedByName={actorName} />
        <label className="block text-sm"><span className="font-medium text-ink">Note (optional)</span>
          <Textarea className="mt-1" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      </div>
    </Modal>
  )
}
