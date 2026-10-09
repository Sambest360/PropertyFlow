import type { PersistRefusal } from './persist'
import { LEASE_SIGNATURE_NOT_RECORDED, LEASE_SIGNATURE_NOT_RECORDED_MESSAGE } from '../leaseSignatureOrdering'

/** User-facing text for a write the server refused with a policy code. */
export function persistRefusalMessage(r: PersistRefusal): string {
  if (r.code === LEASE_SIGNATURE_NOT_RECORDED) return LEASE_SIGNATURE_NOT_RECORDED_MESSAGE
  if (r.code === 'APPLICATION_TRANSITION_FORBIDDEN') {
    return 'Your application could not be updated: that step is handled by the agency. Your page has been refreshed with the saved version.'
  }
  if (r.code === 'APPLICATION_FIELD_LOCKED') {
    return 'Your application could not be updated: that detail is managed by the agency. Your page has been refreshed with the saved version.'
  }
  return `This change was refused (${r.code}). Your page has been refreshed with the saved version.`
}
