/**
 * §5 Mode A — as-at rent roll + soft audit pack types.
 * Point-in-time in-app book beside Mode A owner statements.
 * Not trust-audited / not PPRA opinion / not bank-confirmed.
 */

import type {
  PaymentRecord,
  PropertyAsset,
  PropertyDocument,
  Tenancy,
  TrustTransaction,
  AppUser,
} from '../../types/domain'

/** Honesty — UI banner + PDF/CSV/index (safe claim). */
export const RENT_ROLL_MODE_A_COPY =
  'Mode A as-at rent roll + soft audit pack beside owner statements — not trust-audited, not a PPRA opinion, not bank-confirmed.'

export const AUDIT_PACK_MODE_A_COPY =
  'Soft audit pack (index + existing docs inventory + Trust soft CSV + rent roll) — not a statutory audit pack, not PPRA-certified, not bank-matched.'

export const REMITTANCE_REFUSE_COPY =
  'Live remittance / PayProp partner settlement is refuse-closed in Mode A — use soft exports and owner statement Mode A only.'

export type RentRollAsAtInput = {
  agencyId: string
  agencyName: string
  /** Inclusive YYYY-MM-DD point-in-time */
  asAt: string
  properties: PropertyAsset[]
  tenancies: Tenancy[]
  payments?: PaymentRecord[]
  landlords?: AppUser[]
  /** Optional landlord scope (Owner Portal). */
  landlordUserId?: string | null
  generatedAt?: string
}

export type RentRollRow = {
  tenancyId: string
  propertyId: string
  propertyTitle: string
  propertyAddress: string
  landlordId: string
  landlordName: string
  tenantName: string
  tenantEmail: string
  status: Tenancy['status']
  startDate: string
  endDate: string | null
  rentZar: number
  depositZar: number
  rentDueDay: number
  /** In-app arrears from Due/Overdue rent-like payments with dueDate ≤ as-at (not bank-confirmed). */
  arrearsZar: number
}

export type RentRollBook = {
  agencyId: string
  agencyName: string
  asAt: string
  landlordUserId: string | null
  rows: RentRollRow[]
  totals: {
    units: number
    rentPcmZar: number
    depositZar: number
    arrearsZar: number
  }
  honesty: typeof RENT_ROLL_MODE_A_COPY
  generatedAt: string
}

export type RentRollPdfResult = {
  bytes: Uint8Array
  dataUrl: string
  fileName: string
  book: RentRollBook
}

export type SoftAuditPackFile = {
  path: string
  mime: string
  /** UTF-8 text when text/* or application/json; otherwise base64 for binary PDFs. */
  encoding: 'utf-8' | 'base64'
  content: string
}

export type SoftAuditPackInput = {
  agencyId: string
  agencyName: string
  asAt: string
  properties: PropertyAsset[]
  tenancies: Tenancy[]
  payments?: PaymentRecord[]
  landlords?: AppUser[]
  documents?: PropertyDocument[]
  trustTransactions?: TrustTransaction[]
  landlordUserId?: string | null
  /** Optional Mode A owner-statement PDF data URLs already generated (reuse DQ-M3). */
  ownerStatementPdfs?: Array<{ landlordName: string; fileName: string; dataUrl: string }>
  generatedAt?: string
}

export type SoftAuditPack = {
  filenameBase: string
  asAt: string
  honesty: typeof AUDIT_PACK_MODE_A_COPY
  generatedAt: string
  indexMarkdown: string
  indexJson: string
  files: SoftAuditPackFile[]
  rentRoll: RentRollBook
}

export type RemittancePartnerCode = 'manual_soft' | 'payprop' | 'bank_feed'

export type RemittancePushResult =
  | { ok: true; mode: 'manual_soft'; status: 'exported_soft' }
  | { ok: false; mode: 'partner'; status: 'error'; error: string }

export interface IRemittanceAdapter {
  readonly id: string
  readonly live: boolean
  readonly configured: boolean
  readonly partnerCode: RemittancePartnerCode
  pushLiveRemittance(): Promise<RemittancePushResult>
}

export class RemittanceNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RemittanceNotConfiguredError'
  }
}
