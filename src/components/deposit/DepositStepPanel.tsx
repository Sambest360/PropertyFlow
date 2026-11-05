/**
 * The deposit step of an application, for both sides:
 *  - staff send the deposit details (amount, reference, the agency's bank
 *    account) to the applicant, then see the uploaded proof and confirm it;
 *  - the applicant sees what to pay and where, and uploads proof of payment.
 * The workflow buttons (Issue deposit invoice / Confirm deposit paid / Verify)
 * still move the stage; this panel carries the information between them.
 */
import { useState } from 'react'
import { Banknote, FileCheck2, Upload } from 'lucide-react'
import type { Agency, Application } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { readDocumentFile } from '../../lib/applicationDocDownscale'
import { APPLICATION_DOC_ACCEPT, applicationDocTypeError } from '../../lib/applicationDocUpload'
import { openApplicationDocumentFile } from '../../lib/applicationDocumentFile'
import { Badge, Button, Card, Input, Textarea } from '../ui'
import { BankingDetails, bankingIsComplete } from './DepositBankingCard'
import { Link } from 'react-router-dom'

const DEPOSIT_STAGES = new Set(['landlord_signed', 'deposit_invoice_sent', 'deposit_paid', 'deposit_verified', 'conditionally_approved', 'lease_generated', 'lease_sent', 'tenant_signed'])

export function depositStepVisible(app: Application): boolean {
  return app.type === 'Rental' && (DEPOSIT_STAGES.has(String(app.workflowStatus ?? '')) || Boolean(app.depositRequest || app.depositProof))
}

export function DepositStepPanel({
  application,
  agency,
  depositAmount,
  mode,
  actorName,
  onSave,
}: {
  application: Application
  agency: Agency | undefined
  depositAmount: number
  mode: 'staff' | 'tenant'
  actorName: string
  onSave: (patch: Partial<Application>) => void | Promise<unknown>
}) {
  const banking = application.depositRequest?.banking ?? agency?.settings?.depositBanking ?? {}
  const [amount, setAmount] = useState(String(application.depositRequest?.amount ?? depositAmount ?? ''))
  const [reference, setReference] = useState(application.depositRequest?.reference ?? application.id)
  const [dueDate, setDueDate] = useState(application.depositRequest?.dueDate ?? '')
  const [note, setNote] = useState(application.depositRequest?.note ?? '')
  const [payRef, setPayRef] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!depositStepVisible(application)) return null
  const req = application.depositRequest
  const proof = application.depositProof

  const send = async () => {
    setError('')
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return setError('Enter the deposit amount.')
    if (!bankingIsComplete(banking)) return setError('Add the agency bank details first (Settings → Application journey → Deposit bank details).')
    setBusy(true)
    try {
      await onSave({
        depositRequest: { amount: n, reference: reference.trim() || application.id, banking, dueDate: dueDate || undefined, note: note.trim() || undefined, sentAt: new Date().toISOString(), sentByName: actorName },
      })
    } finally {
      setBusy(false)
    }
  }

  const upload = async (file: File) => {
    setError('')
    const typeErr = applicationDocTypeError(file)
    if (typeErr) return setError(typeErr)
    setBusy(true)
    try {
      const read = await readDocumentFile(file, 1_500_000)
      await onSave({
        depositProof: { name: read.name, mimeType: read.mimeType, dataUrl: read.dataUrl, uploadedAt: new Date().toISOString(), reference: payRef.trim() || req?.reference, amount: req?.amount },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload that file.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3 p-4" data-testid="deposit-step-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 font-semibold text-ink">
          <Banknote className="h-5 w-5 text-primary" aria-hidden /> Deposit
        </h3>
        {proof ? <Badge tone="success">Proof of payment uploaded</Badge> : req ? <Badge tone="warning">Waiting for payment</Badge> : <Badge>Details not sent yet</Badge>}
      </div>

      {req ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-700">
            {mode === 'tenant' ? 'Please pay' : 'Asked for'} <span className="font-semibold">{formatZAR(req.amount)}</span>
            {req.dueDate ? <> by <span className="font-semibold">{req.dueDate}</span></> : null} into:
          </p>
          <BankingDetails banking={req.banking} reference={req.reference} />
          {req.note ? <p className="text-sm text-ink-600">{req.note}</p> : null}
          <p className="text-xs text-ink-500">Sent {new Date(req.sentAt).toLocaleString('en-ZA')}{req.sentByName ? ` by ${req.sentByName}` : ''}.</p>
        </div>
      ) : mode === 'tenant' ? (
        <p className="text-sm text-ink-500">Your agent will send the deposit amount and bank details here.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-ink-600">Send the applicant the deposit amount and where to pay.</p>
          {bankingIsComplete(banking) ? (
            <BankingDetails banking={banking} />
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              The agency has no deposit bank details yet. <Link className="font-semibold underline" to="/workspace/admin/application-journey">Add them</Link>.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-ink-500">Amount (R)</span><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-ink-500">Reference</span><Input value={reference} onChange={(e) => setReference(e.target.value)} /></label>
            <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-ink-500">Pay by (optional)</span><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
          </div>
          <Textarea rows={2} placeholder="Note to the applicant (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button type="button" disabled={busy} onClick={() => void send()}>Send deposit details to the applicant</Button>
        </div>
      )}

      {proof ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          <span className="inline-flex items-center gap-2 text-emerald-900">
            <FileCheck2 className="h-4 w-4" aria-hidden /> {proof.name} · uploaded {new Date(proof.uploadedAt).toLocaleDateString('en-ZA')}
            {proof.reference ? ` · ref ${proof.reference}` : ''}
          </span>
          <Button type="button" size="sm" variant="secondary" onClick={() => openApplicationDocumentFile({ name: proof.name, mimeType: proof.mimeType, dataUrl: proof.dataUrl })}>
            View
          </Button>
        </div>
      ) : null}
      {mode === 'staff' && proof ? <p className="text-xs text-ink-500">Check the money is in the account, then use Confirm deposit paid / Verify deposit.</p> : null}

      {mode === 'tenant' && req ? (
        <div className="space-y-2 border-t border-primary-100 pt-3">
          <p className="text-sm font-medium text-ink">{proof ? 'Replace your proof of payment' : 'Paid? Upload your proof of payment'}</p>
          <Input placeholder="Payment reference you used (optional)" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white">
            <Upload className="h-4 w-4" aria-hidden /> {busy ? 'Uploading…' : 'Upload proof (PDF, JPG or PNG)'}
            <input type="file" accept={APPLICATION_DOC_ACCEPT} className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
          </label>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
    </Card>
  )
}
