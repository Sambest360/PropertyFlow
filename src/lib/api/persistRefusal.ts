import type { PersistRefusal } from './persist'
import {
  LEASE_SIGNATURE_NOT_RECORDED,
  leaseSignatureAudienceForRole,
  leaseSignatureNotRecordedMessage,
} from '../leaseSignatureOrdering'

/** Slice A: payment write refusals (server/paymentWritePolicy.ts and the ledger slices). */
const PAYMENT_REFUSALS: Record<string, string> = {
  PAYMENT_TERMINAL: "This payment is already marked paid and can't be edited here. Ask an admin to correct it.",
  PAYMENT_CANCELLED: "This payment was cancelled and can't be edited here. Ask an admin to reopen it.",
  PAYMENT_PAID_REFERENCE_REQUIRED: 'Add the EFT reference or a note (for cash, the receipt number) to mark this paid.',
  PAYMENT_AMOUNT_REQUIRED: 'This lease has no rent amount set.',
  PAYMENT_AGENCY_MISMATCH: "This payment belongs to another agency or property and can't be saved here. Your page has been refreshed.",
  PAYMENT_APPLICATION_MISMATCH: "This payment doesn't match its application or lease. Your page has been refreshed.",
  PAYMENT_PERMISSION_REQUIRED: "You don't have permission to change payments. Ask an agency admin.",
  PAYMENT_AMOUNT_REASON_REQUIRED: 'Give a reason for changing the amount, then save again.',
  PAYMENT_PARTY_MISMATCH: "The payer isn't a tenant or applicant of this agency. Pick the payer again.",
  PAYMENT_AMOUNT_MISMATCH: "This payment's amount doesn't match what is due. Your page has been refreshed.",
  PAYMENT_ENTRY_EXISTS: 'This payment has already been added for this application. Your page has been refreshed.',
  ENTRY_AMOUNT_UNKNOWN: "The amount due for this application isn't set yet. Ask an agency admin.",
}

/** User-facing text for a write the server refused with a policy code. */
export function persistRefusalMessage(r: PersistRefusal, role?: string | null): string {
  if (r.code === LEASE_SIGNATURE_NOT_RECORDED) {
    return leaseSignatureNotRecordedMessage(leaseSignatureAudienceForRole(role))
  }
  if (r.code === 'TICKET_PRIORITY_INVALID') {
    return "The ticket wasn't saved: choose a priority of Low, Medium, High or Emergency and log it again."
  }
  if (r.code === 'TICKET_ASSET_NOT_ON_UNIT') {
    return "The ticket wasn't saved: the linked item isn't on your unit. Pick it again or leave it out."
  }
  if (r.code === 'APPLICATION_TRANSITION_FORBIDDEN') {
    return 'Your application could not be updated: that step is handled by the agency. Your page has been refreshed with the saved version.'
  }
  if (r.code === 'APPLICATION_FIELD_LOCKED') {
    return 'Your application could not be updated: that detail is managed by the agency. Your page has been refreshed with the saved version.'
  }
  if (r.code === 'EVENT_LOG_TYPE_MISMATCH') {
    return "This record can't be changed from here. Your page has been refreshed with the saved version."
  }
  if (r.code === 'EVENT_LOG_ID_TAKEN') {
    return "This change wasn't saved because the record already exists. Your page has been refreshed."
  }
  if (r.code === 'EVENT_LOG_AGENCY_MISMATCH') {
    return "This record belongs to another agency and can't be changed. Your page has been refreshed."
  }
  const payment = PAYMENT_REFUSALS[r.code]
  if (payment) return payment
  return `This change was refused (${r.code}). Your page has been refreshed with the saved version.`
}
