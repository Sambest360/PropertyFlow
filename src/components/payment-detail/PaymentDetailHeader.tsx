import { Ban, CheckCircle2, Trash2 } from 'lucide-react'
import type { PaymentRecord, PropertyAsset } from '../../types/domain'
import { BackButton } from '../BackButton'
import { Badge, Button, statusTone } from '../ui'
import { formatZAR } from '../../data/seed'
import { paymentAmountLabel, isOpenPayment } from '../payments/types'
import { ICON_STROKE } from './types'

export function PaymentDetailHeader({
  payment,
  property,
  hideParty,
  canMaintain,
  canSelfPay,
  onMarkPaid,
  onCancel,
  onRemove,
}: {
  payment: PaymentRecord
  property: PropertyAsset | null
  hideParty?: boolean
  canMaintain: boolean
  canSelfPay: boolean
  onMarkPaid: () => void
  onCancel: () => void
  onRemove: () => void
}) {
  const open = isOpenPayment(payment.status)

  return (
    <div className="mb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
              {payment.type}
            </h1>
            <Badge tone={statusTone(payment.status)}>{payment.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {payment.id}
            {property ? ` · ${property.title}` : ' · Unlinked property'}
            {!hideParty ? ` · ${payment.partyName}` : ''}
          </p>
          <p className="mt-2 font-display text-3xl font-semibold tabular tracking-tight text-ink">
            {paymentAmountLabel(payment, formatZAR)}
          </p>
          <p className="mt-1 text-sm text-ink-500">
            {payment.paidAt ? `Paid ${payment.paidAt}` : `Due ${payment.dueDate}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(canMaintain || canSelfPay) && open ? (
            <>
              <Button className="min-h-11 gap-2" onClick={onMarkPaid}>
                <CheckCircle2 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Mark paid
              </Button>
              {canMaintain ? (
                <>
                  <Button variant="secondary" className="min-h-11 gap-2" onClick={onCancel}>
                    <Ban className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                    Cancel
                  </Button>
                  <Button variant="danger" className="min-h-11 gap-2" onClick={onRemove}>
                    <Trash2 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                    Remove
                  </Button>
                </>
              ) : null}
            </>
          ) : null}
          <BackButton to="/workspace/operations/payments" label="All payments" />
        </div>
      </div>
    </div>
  )
}
