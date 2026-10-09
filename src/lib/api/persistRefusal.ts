import type { PersistRefusal } from './persist'

/** User-facing text for a write the server refused with a policy code. */
export function persistRefusalMessage(r: PersistRefusal): string {
  if (r.code === 'APPLICATION_TRANSITION_FORBIDDEN') {
    return 'Your application could not be updated: that step is handled by the agency. Your page has been refreshed with the saved version.'
  }
  if (r.code === 'APPLICATION_FIELD_LOCKED') {
    return 'Your application could not be updated: that detail is managed by the agency. Your page has been refreshed with the saved version.'
  }
  return `This change was refused (${r.code}). Your page has been refreshed with the saved version.`
}
