/**
 * The deposit step of an application, for both sides:
 *  - staff send the deposit details (amount, reference, the agency's bank
 *    account) to the applicant, then see the uploaded proof and confirm it;
 *  - the applicant sees what to pay and where, and uploads proof of payment.
 * Staff approve the proof (the amount lands in Trust & Banking as a held
 * deposit) or decline it with a reason (the applicant uploads a new one).
 */
import { useState } from 'react'
import { Banknote, FileCheck2, Loader2, Upload } from 'lucide-react'
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
  onReviewProof,
  alwaysShow = false,
}: {
  application: Application
  agency: Agency | undefined
  depositAmount: number
  mode: 'staff' | 'tenant'
  actorName: string
  onSave: (patch: Partial<Application>) => void | Promise<unknown>
  /** Staff: approve (records the held deposit in Trust & Banking) or decline the proof. */
  onReviewProof?: (
    decision: { approve: true; amount: number } | { approve: false; reason: string },
  ) => Promise<{ ok: boolean; error?: string }>
  /** Show even before the old workflow reaches the deposit (the Deposit stage). */
  alwaysShow?: boolean
}) {
  const banking = application.depositRequest?.banking ?? agency?.settings?.depositBanking ?? {}
  const [amount, setAmount] = useState(String(application.depositRequest?.amount ?? depositAmount ?? ''))
  const [reference, setReference] = useState(application.depositRequest?.reference ?? application.id)
  const [dueDate, setDueDate] = useState(application.depositRequest?.dueDate ?? '')
  const [note, setNote] = useState(application.depositRequest?.note ?? '')
  const [payRef, setPayRef] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [received, setReceived] = useState(String(application.depositProof?.amount ?? application.depositRequest?.amount ?? depositAmount ?? ''))
  const [declining, setDeclining] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [paidConfirmed, setPaidConfirmed] = useState(false)
  if (!alwaysShow && !depositStepVisible(application)) return null
  const proof = application.depositProof
  // The applicant can pay as soon as the application is approved: without
  // details sent by the agent, the deposit invoice and the agency's bank
  // details stand in.
  const req =
    application.depositRequest ??
    (mode === 'tenant' && depositAmount > 0
      ? { amount: depositAmount, reference: application.id, banking, sentAt: '', sentByName: undefined, dueDate: undefined, note: undefined }
      : undefined)

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
    if (mode === 'tenant' && !paidConfirmed) return setError('Tick the box to confirm you paid the deposit.')
    setBusy(true)
    try {
      const read = await readDocumentFile(file, 1_500_000)
      if (read.bytes > 2 * 1024 * 1024) return setError('That file is too big (over 2 MB). Upload a smaller PDF or a photo.')
      const saved = await onSave({
        depositProof: { name: read.name, mimeType: read.mimeType, dataUrl: read.dataUrl, uploadedAt: new Date().toISOString(), reference: payRef.trim() || req?.reference, amount: req?.amount },
      })
      if (saved === false) setError('Upload failed. Check your connection and try again.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload that file.')
    } finally {
      setBusy(false)
    }
  }

  const review = async (decision: { approve: true; amount: number } | { approve: false; reason: string }) => {
    if (!onReviewProof) return
    setError('')
    if (decision.approve && (!Number.isFinite(decision.amount) || decision.amount <= 0)) return setError('Enter the amount that reached the account.')
    setBusy(true)
    try {
      const r = await onReviewProof(decision)
      if (!r.ok) setError(r.error ?? 'Could not save the review.')
      else {
        setDeclining(false)
        setDeclineReason('')
      }
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
        {proof?.status === 'approved' ? (
          <Badge tone="success">Deposit approved</Badge>
        ) : proof?.status === 'declined' ? (
          <Badge tone="danger">Proof declined</Badge>
        ) : proof ? <Badge tone="info">Proof uploaded, waiting for review</Badge> : req ? <Badge tone="warning">Waiting for payment</Badge> : <Badge>Details not sent yet</Badge>}
      </div>

      {req ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-700">
            {mode === 'tenant' ? 'Please pay' : 'Asked for'} <span className="font-semibold">{formatZAR(req.amount)}</span>
            {req.dueDate ? <> by <span className="font-semibold">{req.dueDate}</span></> : null} into:
          </p>
          {bankingIsComplete(req.banking) ? (
            <BankingDetails banking={req.banking} reference={req.reference} />
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              The agency&apos;s bank details are not on file yet. Ask your agent where to pay (use the reference <strong>{req.reference}</strong>).
            </p>
          )}
          {req.note ? <p className="text-sm text-ink-600">{req.note}</p> : null}
          {req.sentAt ? (
            <p className="text-xs text-ink-500">Sent {new Date(req.sentAt).toLocaleString('en-ZA')}{req.sentByName ? ` by ${req.sentByName}` : ''}.</p>
          ) : null}
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
      {proof?.status === 'approved' ? (
        <p className="text-sm text-emerald-800">
          Approved{proof.reviewedByName ? ` by ${proof.reviewedByName}` : ''}{proof.reviewedAt ? ` on ${new Date(proof.reviewedAt).toLocaleDateString('en-ZA')}` : ''}
          {proof.amount ? `: ${formatZAR(proof.amount)} recorded in Trust & Banking.` : '.'}
        </p>
      ) : null}
      {proof?.status === 'declined' ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {mode === 'tenant' ? 'Your proof of payment was declined' : 'Declined'}
          {proof.declineReason ? `: ${proof.declineReason}` : '.'} {mode === 'tenant' ? 'Please upload a new proof below.' : 'The applicant can upload a new proof.'}
        </p>
      ) : null}
      {mode === 'staff' && proof && !proof.status && onReviewProof ? (
        <div className="space-y-2 border-t border-primary-100 pt-3">
          <p className="text-sm text-ink-600">Check the money is in the account, then approve it. Approving records the deposit as held in Trust &amp; Banking.</p>
          {declining ? (
            <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
              <Textarea rows={2} value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Why is this proof declined? The applicant sees this." />
              <div className="flex gap-2">
                <Button size="sm" variant="danger" disabled={busy || !declineReason.trim()} onClick={() => void review({ approve: false, reason: declineReason.trim() })}>
                  Decline proof
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeclining(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-ink-500">Amount received (R)</span>
                <Input type="number" value={received} onChange={(e) => setReceived(e.target.value)} className="w-40" />
              </label>
              <Button size="sm" disabled={busy} onClick={() => void review({ approve: true, amount: Number(received) })}>Approve deposit</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDeclining(true)}>Decline</Button>
            </div>
          )}
        </div>
      ) : null}

      {mode === 'tenant' && req && proof?.status !== 'approved' ? (
        <div className="space-y-2 border-t border-primary-100 pt-3">
          <p className="text-sm font-medium text-ink">{proof ? 'Replace your proof of payment' : 'Paid? Upload your proof of payment'}</p>
          <Input placeholder="Payment reference you used (optional)" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={paidConfirmed} onChange={(e) => setPaidConfirmed(e.target.checked)} />
            <span>
              I confirm I paid {req?.amount ? <strong>{formatZAR(req.amount)}</strong> : 'the deposit'} into the account above
              {req?.reference ? <> with the reference <strong>{req.reference}</strong></> : null}.
            </span>
          </label>
          <label
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white ${paidConfirmed ? 'cursor-pointer bg-primary' : 'cursor-not-allowed bg-primary/50'}`}
            aria-disabled={!paidConfirmed}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
            {busy ? 'Uploading your proof of payment…' : 'Upload proof of payment (PDF, JPG or PNG)'}
            <input type="file" accept={APPLICATION_DOC_ACCEPT} className="hidden" disabled={busy || !paidConfirmed} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
          </label>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
    </Card>
  )
}
