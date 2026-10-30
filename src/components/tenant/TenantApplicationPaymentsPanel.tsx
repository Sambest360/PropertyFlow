import { useState } from 'react'
import { CreditCard, Upload } from 'lucide-react'
import type { PaymentRecord } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { Badge, Button, Card, statusTone } from '../ui'
import { ProofOfPaymentForm, type ProofInput } from '../payments/ProofOfPaymentForm'
import { PaymentAttachmentsList } from '../payments/PaymentAttachmentsField'

const ICON_STROKE = 1.6

export function TenantApplicationPaymentsPanel({
  payments,
  onSubmitProof,
  onOpenCheckout,
}: {
  payments: PaymentRecord[]
  onSubmitProof: (paymentId: string, input: ProofInput) => void
  onOpenCheckout?: () => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)

  if (!payments.length) {
    return (
      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Payments</h2>
        <p className="mt-2 text-sm text-ink-500">No payments have been issued for this application yet.</p>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Payments</h2>
          <p className="mt-1 text-sm text-ink-500">
            Pay the agency directly, then record your reference here. The agency verifies before your
            application advances.
          </p>
        </div>
        {onOpenCheckout ? (
          <Button type="button" className="min-h-11 cursor-pointer" onClick={onOpenCheckout}>
            <CreditCard className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Pay online
          </Button>
        ) : null}
      </div>

      <ul className="mt-4 space-y-3">
        {payments.map((p) => {
          const proofSubmitted = Boolean(p.reference || (p.attachments?.length ?? 0))
          const isOpen = activeId === p.id
          return (
            <li key={p.id} className="rounded-2xl border border-primary-100 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink">{p.type}</p>
                  <p className="text-sm tabular text-ink-600">{formatZAR(p.amount)}</p>
                  <p className="text-xs text-ink-400">Due {p.dueDate}</p>
                </div>
                <Badge tone={p.status === 'Paid' ? 'success' : proofSubmitted ? 'warning' : statusTone(p.status)}>
                  {p.status === 'Paid' ? 'Verified' : proofSubmitted ? 'Awaiting verification' : p.status}
                </Badge>
              </div>

              {p.reference ? (
                <p className="mt-2 text-xs text-ink-500">
                  Reference: <span className="font-medium text-ink">{p.reference}</span>
                </p>
              ) : null}
              {p.notes ? <p className="mt-1 text-xs text-ink-500">{p.notes}</p> : null}
              {p.attachments?.length ? (
                <div className="mt-2">
                  <PaymentAttachmentsList attachments={p.attachments} />
                </div>
              ) : null}

              {p.status !== 'Paid' && !proofSubmitted && (
                <div className="mt-3">
                  {isOpen ? (
                    <ProofOfPaymentForm
                      onSubmit={(input) => {
                        onSubmitProof(p.id, input)
                        setActiveId(null)
                      }}
                      onCancel={() => setActiveId(null)}
                    />
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-2 min-h-10 cursor-pointer"
                      onClick={() => {
                        setActiveId(p.id)
                      }}
                    >
                      <Upload className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                      Upload proof of payment
                    </Button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
