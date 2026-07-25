export const PAYMENT_DETAIL_TABS = ['overview', 'documents'] as const

export type PaymentDetailTab = (typeof PAYMENT_DETAIL_TABS)[number]

export function isPaymentDetailTab(v: string | null): v is PaymentDetailTab {
  return !!v && (PAYMENT_DETAIL_TABS as readonly string[]).includes(v)
}

export const ICON_STROKE = 1.6
