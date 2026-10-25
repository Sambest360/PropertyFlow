import type { Application } from '../types/domain'

/**
 * A new application's first stage — the only start the server accepts
 * (enforceApplicantApplicationWrite): a rental is submitted, a purchase is a
 * submitted offer. Staff move it on from there.
 */
export function initialWorkflowForCreate(type: Application['type'] = 'Rental'): {
  workflowStatus: 'application_submitted' | 'offer_submitted'
  stage: string
} {
  return type === 'Purchase'
    ? { workflowStatus: 'offer_submitted', stage: 'Offer submitted' }
    : { workflowStatus: 'application_submitted', stage: 'Application submitted' }
}
