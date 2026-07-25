import { User } from 'lucide-react'
import type { PaymentRecord, PropertyAsset } from '../../types/domain'
import { Card } from '../ui'
import { formatZAR } from '../../data/seed'
import { PaymentPropertyLink } from '../payments/PaymentPropertyLink'
import { paymentAmountLabel } from '../payments/types'
import { ICON_STROKE } from './types'

export function PaymentOverviewPanel({
  payment,
  property,
  hideParty,
}: {
  payment: PaymentRecord
  property: PropertyAsset | null
  hideParty?: boolean
}) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Payment ID', value: payment.id },
    { label: 'Type', value: payment.type },
    { label: 'Status', value: payment.status },
    { label: 'Billed amount', value: formatZAR(payment.amount) },
    { label: 'Due date', value: payment.dueDate },
  ]

  if (payment.paidAt) rows.push({ label: 'Paid on', value: payment.paidAt })
  if (payment.paidAmount != null) {
    rows.push({ label: 'Received', value: paymentAmountLabel(payment, formatZAR) })
  }
  if (payment.method) rows.push({ label: 'Method', value: payment.method })
  if (payment.reference) rows.push({ label: 'Reference', value: payment.reference })
  if (payment.recordedByName) rows.push({ label: 'Recorded by', value: payment.recordedByName })
  if (payment.notes) rows.push({ label: 'Notes', value: payment.notes })

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Ledger line</h2>
        <p className="mt-1 text-sm text-ink-500">Settlement and billing details for this payment.</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                {row.label}
              </dt>
              <dd className="mt-0.5 text-sm font-semibold tabular text-ink" title={row.value}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="space-y-4">
        {property && (
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Linked property</h2>
            <p className="mt-1 text-sm text-ink-500">
              {property.suburb}, {property.city}
            </p>
            <div className="mt-4">
              <PaymentPropertyLink propertyId={property.id} title={property.title} />
            </div>
          </Card>
        )}

        {!hideParty && (
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <User className="h-5 w-5 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
              Party
            </h2>
            <p className="mt-2 text-sm font-semibold text-ink">{payment.partyName}</p>
            {payment.partyUserId && (
              <p className="mt-1 text-xs text-ink-500">User {payment.partyUserId}</p>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
