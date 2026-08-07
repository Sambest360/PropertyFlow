import type { Application } from '../types/domain'
import { isTerminalWorkflowStatus, resolveWorkflowStatus, type WorkflowStatusKey } from './applicationWorkflow'

export type ApplicationPipelineBucket =
  | 'all'
  | 'new'
  | 'documents_pending'
  | 'credit_checks'
  | 'awaiting_approval'
  | 'deposit_pending'
  | 'lease_signing'
  | 'completed'
  | 'rejected'

const BUCKET_STATUSES: Record<Exclude<ApplicationPipelineBucket, 'all' | 'rejected'>, WorkflowStatusKey[]> = {
  new: ['application_submitted', 'application_started'],
  documents_pending: ['documents_requested', 'documents_uploaded', 'fica_verification'],
  credit_checks: ['credit_check', 'affordability_assessment', 'employment_verification', 'income_verification', 'reference_checks'],
  awaiting_approval: ['agent_review', 'landlord_review', 'seller_review', 'conditionally_approved'],
  deposit_pending: ['deposit_invoice_sent', 'deposit_paid', 'deposit_requested', 'deposit_verified'],
  lease_signing: ['lease_generated', 'lease_sent', 'tenant_signed', 'landlord_signed', 'sale_agreement_signed'],
  completed: ['active_tenancy', 'completed', 'registered', 'ownership_transferred', 'occupation'],
}

const REJECTED_STATUSES: WorkflowStatusKey[] = [
  'rejected',
  'withdrawn',
  'cancelled',
  'offer_rejected',
  'bond_declined',
]

export function applicationPipelineBucket(application: Application): ApplicationPipelineBucket {
  const status = resolveWorkflowStatus(application)
  if (application.stage === 'Blocked' || REJECTED_STATUSES.includes(status)) return 'rejected'
  if (isTerminalWorkflowStatus(application.type, status) && BUCKET_STATUSES.completed.includes(status)) {
    return 'completed'
  }
  for (const [bucket, statuses] of Object.entries(BUCKET_STATUSES) as [
    Exclude<ApplicationPipelineBucket, 'all' | 'rejected'>,
    WorkflowStatusKey[],
  ][]) {
    if (statuses.includes(status)) return bucket
  }
  return 'new'
}

export function matchesPipelineBucket(application: Application, bucket: ApplicationPipelineBucket): boolean {
  if (bucket === 'all') return true
  return applicationPipelineBucket(application) === bucket
}

export const PIPELINE_BUCKET_LABELS: Record<ApplicationPipelineBucket, string> = {
  all: 'All',
  new: 'New',
  documents_pending: 'Documents pending',
  credit_checks: 'Credit checks',
  awaiting_approval: 'Awaiting approval',
  deposit_pending: 'Deposit pending',
  lease_signing: 'Lease signing',
  completed: 'Completed',
  rejected: 'Rejected',
}
