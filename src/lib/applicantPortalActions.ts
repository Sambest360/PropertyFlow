import type { Application, PaymentRecord, Permission } from '../types/domain'
import type { HateoasAction } from './api/contracts'
import {
  isTerminalWorkflowStatus,
  resolveWorkflowStatus,
  type WorkflowStatusKey,
  type WorkflowTransition,
} from './applicationWorkflow'
import { allDocsUploaded } from './workflow'

/** Workflow positions that mean the applicant has secured this listing. */
export const APPLICANT_ACCEPTANCE_STATUSES: readonly WorkflowStatusKey[] = [
  'conditionally_approved',
  'lease_generated',
  'lease_sent',
  'tenant_signed',
  'landlord_signed',
  'deposit_invoice_sent',
  'deposit_paid',
  'deposit_verified',
  'first_rent_paid',
  'rent_verified',
  'inspection_scheduled',
  'inspection_completed',
  'keys_ready',
  'keys_handed_over',
  'active_tenancy',
  'offer_accepted',
  'sale_agreement_signed',
]

export function isApplicantAcceptanceStatus(status: WorkflowStatusKey): boolean {
  return APPLICANT_ACCEPTANCE_STATUSES.includes(status)
}

/** Applicant-initiated transitions (portal.tenant) layered on the shared workflow. */
const APPLICANT_TRANSITIONS: WorkflowTransition[] = [
  {
    from: 'application_started',
    to: 'application_submitted',
    actionKey: 'SUBMIT_APPLICATION',
    label: 'Submit application',
    hint: 'Confirm your details and submit for agency review',
    tone: 'primary',
    requires: ['portal.tenant'],
  },
  {
    from: 'offer_started',
    to: 'offer_submitted',
    actionKey: 'SUBMIT_OFFER',
    label: 'Submit offer',
    hint: 'Send your offer to purchase for seller review',
    tone: 'primary',
    requires: ['portal.tenant'],
  },
  {
    from: 'lease_sent',
    to: 'tenant_signed',
    actionKey: 'TENANT_SIGNED',
    label: 'Sign lease',
    hint: 'Sign the lease with your electronic signature',
    tone: 'primary',
    requires: ['portal.tenant'],
  },
  {
    from: 'deposit_invoice_sent',
    to: 'deposit_paid',
    actionKey: 'OPEN_CHECKOUT',
    label: 'Pay deposit online',
    hint: 'Open secure checkout for deposit and first rent',
    tone: 'primary',
    requires: ['portal.tenant'],
    effect: 'open_checkout',
  },
  {
    from: 'deposit_requested',
    to: 'deposit_paid',
    actionKey: 'OPEN_CHECKOUT',
    label: 'Pay deposit online',
    hint: 'Open secure checkout for your purchase deposit',
    tone: 'primary',
    requires: ['portal.tenant'],
    effect: 'open_checkout',
  },
  {
    from: 'documents_requested',
    to: 'documents_uploaded',
    actionKey: 'UPLOAD_DOCS',
    label: 'Confirm documents uploaded',
    hint: 'All required files are on file — submit for agency review',
    tone: 'primary',
    requires: ['portal.tenant'],
    guard: (app) => allDocsUploaded(app.documents) || 'Upload all required documents first',
  },
  {
    from: 'documents_requested',
    to: 'withdrawn',
    actionKey: 'WITHDRAW',
    label: 'Withdraw application',
    hint: 'Cancel this application — you can apply elsewhere',
    tone: 'ghost',
    requires: ['portal.tenant'],
    confirm: 'Withdraw this application? You can still apply for other homes.',
  },
  {
    from: 'application_submitted',
    to: 'withdrawn',
    actionKey: 'WITHDRAW',
    label: 'Withdraw application',
    hint: 'Cancel before screening begins',
    tone: 'ghost',
    requires: ['portal.tenant'],
    confirm: 'Withdraw this application?',
  },
]

function transitionToAction(transition: WorkflowTransition, applicationId: string): HateoasAction {
  return {
    key: transition.actionKey,
    label: transition.label,
    method: 'PATCH',
    href: `/api/v1/applications/${applicationId}/workflow`,
    requires: transition.requires ?? [],
    tone: transition.tone ?? 'secondary',
    confirm: transition.confirm,
    payload_hint: {
      workflowStatus: transition.to,
      effect: transition.effect,
    },
  }
}

/** Next actions the logged-in applicant may take on their own application. */
export function buildApplicantApplicationActions(params: {
  application: Application
  permissions: Permission[]
}): HateoasAction[] {
  const status = resolveWorkflowStatus(params.application)
  if (isTerminalWorkflowStatus(params.application.type, status)) return []

  const perms = new Set(params.permissions)
  const fromApplicant = APPLICANT_TRANSITIONS.filter((t) => {
    if (t.from !== status) return false
    if (t.requires?.length && !t.requires.every((p) => perms.has(p))) return false
    if (t.guard) {
      const ok = t.guard(params.application)
      if (ok !== true) return false
    }
    return true
  }).map((t) => transitionToAction(t, params.application.id))

  return fromApplicant
}

export type ApplicantTask = {
  id: string
  label: string
  detail: string
  tone: 'primary' | 'warning' | 'neutral'
  section: 'details' | 'documents' | 'payments' | 'application'
}

export function getApplicantTasks(
  application: Application,
  payments: PaymentRecord[],
): ApplicantTask[] {
  const status = resolveWorkflowStatus(application)
  const tasks: ApplicantTask[] = []

  if (status === 'application_started') {
    tasks.push({
      id: 'submit',
      label: 'Submit your application',
      detail: 'Review your information and submit when you are ready.',
      tone: 'primary',
      section: 'application',
    })
  }

  if (status === 'documents_requested' && !allDocsUploaded(application.documents)) {
    tasks.push({
      id: 'documents',
      label: 'Upload required documents',
      detail: 'FICA, ID, and income documents are needed before screening can start.',
      tone: 'primary',
      section: 'documents',
    })
  }

  if (status === 'lease_sent') {
    tasks.push({
      id: 'sign',
      label: 'Sign your lease',
      detail: 'Your lease is ready — sign digitally to proceed to payments.',
      tone: 'primary',
      section: 'application',
    })
  }

  const appPayments = payments.filter((p) => p.applicationId === application.id)
  const due = appPayments.filter((p) => p.status === 'Due' || p.status === 'Overdue')
  const awaitingProof = due.filter((p) => !p.reference && !(p.attachments?.length ?? 0))

  if (
    (status === 'deposit_invoice_sent' || status === 'deposit_requested' || status === 'deposit_paid') &&
    due.length > 0
  ) {
    tasks.push({
      id: 'payments',
      label: awaitingProof.length ? 'Record your payment' : 'Payments awaiting verification',
      detail: awaitingProof.length
        ? 'Pay the agency and upload proof of payment (EFT reference or receipt).'
        : 'Your payment proof was submitted — the agency will verify shortly.',
      tone: awaitingProof.length ? 'primary' : 'warning',
      section: 'payments',
    })
  }

  return tasks
}

/** Other active applications for the same person (by user id or email). */
export function siblingApplications(
  applications: readonly Application[],
  accepted: Application,
): Application[] {
  const status = resolveWorkflowStatus(accepted)
  if (!isApplicantAcceptanceStatus(status)) return []

  return applications.filter((a) => {
    if (a.id === accepted.id) return false
    const samePerson =
      (accepted.applicantUserId && a.applicantUserId === accepted.applicantUserId) ||
      a.email.toLowerCase() === accepted.email.toLowerCase()
    if (!samePerson) return false
    const s = resolveWorkflowStatus(a)
    return !isTerminalWorkflowStatus(a.type, s)
  })
}
