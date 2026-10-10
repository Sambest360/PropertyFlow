import type { PersistRefusal } from './persist'
import {
  LEASE_SIGNATURE_NOT_RECORDED,
  leaseSignatureAudienceForRole,
  leaseSignatureNotRecordedMessage,
} from '../leaseSignatureOrdering'

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
  return `This change was refused (${r.code}). Your page has been refreshed with the saved version.`
}
