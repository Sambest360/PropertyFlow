import { FileText } from 'lucide-react'
import type { PaymentAttachment, PaymentRecord } from '../../types/domain'
import { Card } from '../ui'
import {
  PaymentAttachmentsField,
  PaymentAttachmentsList,
} from '../payments/PaymentAttachmentsField'
import { paymentDocumentTarget } from '../../lib/storage/targets'
import { ICON_STROKE } from './types'

export function PaymentDocumentsPanel({
  payment,
  canManage,
  actorName,
  onUpdateAttachments,
}: {
  payment: PaymentRecord
  canManage: boolean
  actorName: string
  onUpdateAttachments: (attachments: PaymentAttachment[]) => void
}) {
  const attachments = payment.attachments ?? []

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <FileText className="h-5 w-5 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
        Documents & proof
      </h2>
      <p className="mt-1 text-sm text-ink-500">
        Receipts, proof of payment, and remittance documents linked to this ledger line.
      </p>

      <div className="mt-4">
        {canManage ? (
          <PaymentAttachmentsField
            value={attachments}
            onChange={onUpdateAttachments}
            uploadedByName={actorName}
            label="Attachments"
            storage={paymentDocumentTarget(payment.agencyId, payment.id)}
          />
        ) : (
          <PaymentAttachmentsList attachments={attachments} disabled />
        )}
      </div>
    </Card>
  )
}
