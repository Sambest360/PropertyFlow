import { Link } from 'react-router-dom'
import { MapPin, User } from 'lucide-react'
import type { PaymentRecord, PropertyAsset } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { DetailSection, DetailStack, FlatField, FlatFieldGrid } from '../detail/FlatFields'
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
  const sideSections = (
    <>
      {property ? (
        <DetailSection title="Linked property" subtitle={`${property.suburb}, ${property.city}`}>
          <Link
            to={`/workspace/properties/${property.id}?tab=payments`}
            className="group inline-flex min-h-11 max-w-full cursor-pointer items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MapPin
              className="mt-0.5 h-4 w-4 shrink-0 text-primary"
              strokeWidth={ICON_STROKE}
              aria-hidden
            />
            <span className="font-semibold text-primary group-hover:underline">{property.title}</span>
          </Link>
        </DetailSection>
      ) : null}

      {!hideParty ? (
        <DetailSection
          title="Party"
          className={property ? 'mt-8 border-t border-primary-100 pt-8 lg:mt-8' : undefined}
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <User className="h-4 w-4 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
            {payment.partyName}
          </p>
          {payment.partyUserId ? (
            <p className="mt-1 text-xs text-ink-500">User {payment.partyUserId}</p>
          ) : null}
        </DetailSection>
      ) : null}
    </>
  )

  const hasSide = Boolean(property) || !hideParty

  return (
    <DetailStack columns={hasSide ? 2 : 1}>
      <DetailSection
        title="Overview"
        subtitle="Settlement and billing details for this payment."
      >
        <FlatFieldGrid className="lg:grid-cols-2">
          <FlatField label="Payment ID" value={payment.id} />
          <FlatField label="Type" value={payment.type} />
          <FlatField label="Status" value={payment.status} />
          <FlatField label="Billed amount" value={formatZAR(payment.amount)} tabular />
          <FlatField label="Due date" value={payment.dueDate} />
          {payment.paidAt ? <FlatField label="Paid on" value={payment.paidAt} /> : null}
          {payment.paidAmount != null ? (
            <FlatField
              label="Received"
              value={paymentAmountLabel(payment, formatZAR)}
              tabular
            />
          ) : null}
          {payment.method ? <FlatField label="Method" value={payment.method} /> : null}
          {payment.reference ? <FlatField label="Reference" value={payment.reference} /> : null}
          {payment.recordedByName ? (
            <FlatField label="Recorded by" value={payment.recordedByName} />
          ) : null}
        </FlatFieldGrid>
        {payment.notes ? (
          <div className="border-t border-primary-50 pt-4">
            <p className="text-[11px] font-medium text-ink-400">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-600">{payment.notes}</p>
          </div>
        ) : null}
      </DetailSection>

      {hasSide ? <div>{sideSections}</div> : null}
    </DetailStack>
  )
}
