/**
 * DQ-M3 Mode A — owner statement PDF types.
 * In-app book only: payments + optional allocations + landlord payouts ≤ submitted.
 * Not bank-confirmed / not PayProp settled.
 */

import type {
  PaymentRecord,
  PayoutInstruction,
  PropertyAsset,
  PropertyDocument,
  Tenancy,
  TrustAllocation,
} from '../../types/domain'

/** Honesty label — UI banner + PDF header (safe claim). */
export const OWNER_STATEMENT_MODE_A_COPY =
  'Mode A owner statement PDF from in-app book (payments / allocations / payouts submitted) - not bank-confirmed, not PayProp settled.'

/** Payout statuses eligible for the Mode A book (≤ submitted). Never treat as bank settlement. */
export const OWNER_STATEMENT_PAYOUT_STATUSES = [
  'proposed',
  'pending_approval',
  'approved',
  'submitted',
] as const

export type OwnerStatementPayoutStatus = (typeof OWNER_STATEMENT_PAYOUT_STATUSES)[number]

export type OwnerStatementPeriod = {
  /** Inclusive YYYY-MM-DD */
  start: string
  /** Inclusive YYYY-MM-DD */
  end: string
}

export type OwnerStatementBookInput = {
  landlordUserId: string
  landlordName: string
  agencyId: string
  agencyName: string
  period: OwnerStatementPeriod
  properties: PropertyAsset[]
  tenancies: Tenancy[]
  payments: PaymentRecord[]
  trustAllocations?: TrustAllocation[]
  payoutInstructions?: PayoutInstruction[]
  generatedAt?: string
}

export type OwnerStatementPaymentLine = {
  kind: 'payment'
  id: string
  date: string
  propertyTitle: string
  description: string
  amountZar: number
  status: string
}

export type OwnerStatementAllocationLine = {
  kind: 'allocation'
  id: string
  date: string
  propertyTitle: string
  description: string
  amountZar: number
  bucketCode: string
}

export type OwnerStatementPayoutLine = {
  kind: 'payout'
  id: string
  date: string
  propertyTitle: string
  description: string
  amountZar: number
  /** In-app status only (≤ submitted) — never bank/PayProp settled. */
  status: OwnerStatementPayoutStatus
}

export type OwnerStatementLine =
  | OwnerStatementPaymentLine
  | OwnerStatementAllocationLine
  | OwnerStatementPayoutLine

export type OwnerStatementBook = {
  landlordUserId: string
  landlordName: string
  agencyId: string
  agencyName: string
  period: OwnerStatementPeriod
  propertyTitles: string[]
  payments: OwnerStatementPaymentLine[]
  allocations: OwnerStatementAllocationLine[]
  payouts: OwnerStatementPayoutLine[]
  lines: OwnerStatementLine[]
  totals: {
    paymentsZar: number
    allocationsZar: number
    payoutsSubmittedZar: number
  }
  honesty: typeof OWNER_STATEMENT_MODE_A_COPY
  generatedAt: string
}

export type OwnerStatementPdfResult = {
  bytes: Uint8Array
  dataUrl: string
  fileName: string
  book: OwnerStatementBook
}

/** Optional PropertyDocument fields when storing the PDF (category Other). */
export type OwnerStatementDocumentDraft = Omit<PropertyDocument, 'id'>
