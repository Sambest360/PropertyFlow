/** Mode A recurring rent + dunning — schedule/overdue/notices only (no live bank/debit). */

export type DunningStage = 'reminder_1' | 'reminder_2' | 'final'

export type RentCycleAsOf = string // YYYY-MM-DD

export type RentPeriodKey = string // YYYY-MM

export type PlannedRentPayment = {
  agencyId: string
  propertyId: string
  applicationId: string | null
  tenancyId: string
  partyName: string
  partyUserId: string | null
  type: 'Rent'
  amount: number
  status: 'Due'
  dueDate: string
  landlordVisible: true
  notes: string
}

export type OverdueEscalation = {
  paymentId: string
  fromStatus: 'Due'
  toStatus: 'Overdue'
  dueDate: string
  daysPastDue: number
}

export type DunningNoticeDraft = {
  stage: DunningStage
  title: string
  body: string
  /** Appended to PaymentRecord.notes for durable audit without schema migration. */
  notesLine: string
  nonProduction: true
  channel: 'in_app'
}

export const DUNNING_NON_PRODUCTION_NOTE =
  'Non-production Mode A: in-app notice only — no live email/SMS/bank debit.'
