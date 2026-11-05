import { useState } from 'react'
import { CreditCard, Upload } from 'lucide-react'
import { Badge, Button, Card } from '../ui'
import { formatZAR } from '../../data/seed'
import type { PaymentRecord } from '../../types/domain'
import { isOpenRow, outstandingTotal, rowStateLabel } from '../../lib/payfast/applicationCheckout'
import { ProofOfPaymentForm, type ProofInput } from './ProofOfPaymentForm'

/**
 * Payments for one application. There is no online card payment: the payer
 * pays the agency by EFT and uploads proof of payment; the agency checks it
 * and marks the payment paid.
 *
 * `rows` are live ledger rows from the store, already filtered with
 * applicationLedgerRows (this application; tenant: own rows only).
 */
export function ApplicationCheckoutCard({
  rows,
  mode,
  onSubmitProof,
  uploaderName,
}: {
  rows: readonly PaymentRecord[]
  mode: 'tenant' | 'agent'
  /** Kept for callers: payments are no longer paid online. */
  canPay?: boolean
  /** Tenant: upload proof of payment for a row. */
  onSubmitProof?: (paymentId: string, input: ProofInput) => void
  uploaderName?: string
}) {
  const [proofFor, setProofFor] = useState<string | null>(null)
  if (rows.length === 0) return null

  const total = outstandingTotal(rows)
  const anyOpen = rows.some(isOpenRow)

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-primary" strokeWidth={1.6} aria-hidden />
        <h3 className="font-display text-base font-semibold">{mode === 'agent' ? 'Applicant payments' : 'Your payments'}</h3>
      </div>
      <p className="mt-1 text-sm text-ink-500">
        {mode === 'agent'
          ? 'The applicant pays by EFT and uploads proof of payment. Check it, then mark the payment paid.'
          : 'Pay the agency by EFT, then upload your proof of payment. The agency confirms it.'}
      </p>
      <ul className="mt-4 divide-y divide-primary-100/70">
        {rows.map((p) => {
          const proof = Boolean(p.attachments?.length || p.reference)
          return (
            <li key={p.id} data-testid={`checkout-row-${p.id}`} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{rowStateLabel(p)}</p>
                  <p className="tabular text-xs text-ink-500">{formatZAR(p.amount)}</p>
                </div>
                {p.status === 'Paid' ? <Badge tone="success">Paid</Badge> : null}
                {p.status === 'Cancelled' ? <Badge tone="neutral">Cancelled</Badge> : null}
                {isOpenRow(p) && proof ? <Badge tone="warning">Proof uploaded</Badge> : null}
                {mode === 'tenant' && isOpenRow(p) && !proof && onSubmitProof ? (
                  <Button type="button" size="sm" variant="secondary" data-testid={`proof-${p.id}`} onClick={() => setProofFor(proofFor === p.id ? null : p.id)}>
                    <Upload className="h-3.5 w-3.5" aria-hidden /> Upload proof of payment
                  </Button>
                ) : null}
              </div>
              {proofFor === p.id && onSubmitProof ? (
                <div className="mt-2">
                  <ProofOfPaymentForm
                    uploadedByName={uploaderName}
                    onSubmit={(input) => {
                      onSubmitProof(p.id, input)
                      setProofFor(null)
                    }}
                    onCancel={() => setProofFor(null)}
                  />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {anyOpen ? (
        <p className="mt-3 flex items-center justify-between border-t border-primary-100/70 pt-3 text-sm">
          <span className="text-ink-500">Total outstanding</span>
          <span className="tabular font-semibold">{formatZAR(total)}</span>
        </p>
      ) : null}
    </Card>
  )
}

export default ApplicationCheckoutCard
