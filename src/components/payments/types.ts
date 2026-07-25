import type { PaymentAttachment, PaymentRecord, PropertyAsset } from '../../types/domain'

export type PaymentsViewMode = 'list' | 'cards'

export type PaymentStatusFilter = 'all' | PaymentRecord['status']
export type PaymentTypeFilter = 'all' | PaymentRecord['type']
export type PaymentAttentionFilter = 'all' | 'open' | 'overdue' | 'paid' | 'cancelled'
export type PaymentSortKey = 'attention' | 'due' | 'amount' | 'status' | 'property' | 'party'

export type PortfolioPayment = {
  payment: PaymentRecord
  property: PropertyAsset | null
  /** Days past due when unpaid; 0 if not overdue */
  daysOverdue: number
  attachmentCount: number
  attentionScore: number
}

export const PAYMENT_STATUSES: PaymentRecord['status'][] = [
  'Due',
  'Overdue',
  'Paid',
  'Cancelled',
]

export const PAYMENT_TYPES: PaymentRecord['type'][] = [
  'Deposit',
  'First Month Rent',
  'Rent',
  'Sale Deposit',
  'Commission',
  'Refund',
  'Other',
]

export const PAY_METHODS = [
  'EFT',
  'Card',
  'Cash',
  'Debit order',
  'Instant EFT',
  'Cheque',
  'Other',
] as const

export type MarkPaymentPaidDetails = {
  method?: string
  paidAt?: string
  reference?: string | null
  paidAmount?: number | null
  notes?: string | null
  attachments?: PaymentAttachment[]
  recordedByUserId?: string | null
  recordedByName?: string | null
}

export const VIEW_STORAGE_KEY = 'propertyflow-payments-view'

export function isOpenPayment(status: PaymentRecord['status']) {
  return status === 'Due' || status === 'Overdue'
}

export function daysPastDue(payment: PaymentRecord, today = new Date()): number {
  if (!isOpenPayment(payment.status)) return 0
  const due = new Date(`${payment.dueDate}T12:00:00`)
  const ms = today.getTime() - due.getTime()
  if (ms <= 0) return 0
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export function paymentUrgency(item: PortfolioPayment): number {
  const p = item.payment
  if (p.status === 'Overdue') return 100 + item.daysOverdue
  if (p.status === 'Due') return 40 + item.daysOverdue
  if (p.status === 'Paid') return 0
  return -10
}

export function paymentAttentionScore(
  payment: PaymentRecord,
  daysOverdue: number,
  attachmentCount: number,
): number {
  const base = paymentUrgency({
    payment,
    property: null,
    daysOverdue,
    attachmentCount,
    attentionScore: 0,
  })
  return base + attachmentCount * 5
}

export function paymentAmountLabel(p: PaymentRecord, formatZAR: (n: number) => string) {
  if (p.status === 'Paid' && p.paidAmount != null && p.paidAmount !== p.amount) {
    return `${formatZAR(p.paidAmount)} (billed ${formatZAR(p.amount)})`
  }
  return formatZAR(p.amount)
}
