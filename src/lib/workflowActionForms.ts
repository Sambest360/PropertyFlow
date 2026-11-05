import type { Application } from '../types/domain'
import { allDocsUploaded } from './workflow'

export type WorkflowActionCapture = {
  notes?: string
  reason?: string
  reference?: string
  amount?: string
  moveInDate?: string
  keyLocation?: string
  signerName?: string
  signatureDataUrl?: string
  /** CR10: lease sign dialog capture (TENANT_SIGNED / LANDLORD_SIGNED / MARK_LEASE_SIGNED). */
  signatureMethod?: 'drawn' | 'saved_image' | 'paper_mark'
  onBehalfConfirmation?: string
  /** ECTA 25 of 2002 consent for an electronic lease signature. */
  ectaConsent?: import('./lease/types').EctaConsent
}

/** CR10: workflow actions that sign the lease through the lease sign dialog. */
export const LEASE_SIGN_ACTIONS: ReadonlySet<string> = new Set(['TENANT_SIGNED', 'LANDLORD_SIGNED', 'MARK_LEASE_SIGNED'])

export type WorkflowActionFormSpec = {
  kind: 'confirm' | 'signature' | 'upload' | 'fields' | 'schedule' | 'reject'
  title: string
  description: string
  confirmLabel?: string
  fields?: Array<{
    key: keyof WorkflowActionCapture
    label: string
    type: 'text' | 'date' | 'textarea' | 'number'
    required?: boolean
    placeholder?: string
  }>
  showDocumentChecklist?: boolean
}

const SIGNATURE_ACTIONS = new Set([
  'TENANT_SIGNED',
  'LANDLORD_SIGNED',
  'SIGN_SALE_AGREEMENT',
  'MARK_LEASE_SIGNED',
])

const REJECT_ACTIONS = new Set([
  'REJECT_APPLICATION',
  'DECLINE_CREDIT',
  'LANDLORD_REJECTED',
  'CANCEL_NO_DEPOSIT',
  'WITHDRAW',
  'CANCEL_VIEWING',
  'REJECT_OFFER',
  'BOND_DECLINED',
  'AGENT_APPROVE',
  'CONDITIONALLY_APPROVE',
])

export function actionNeedsModal(actionKey: string): boolean {
  return (
    SIGNATURE_ACTIONS.has(actionKey) ||
    REJECT_ACTIONS.has(actionKey) ||
    actionKey === 'UPLOAD_DOCS' ||
    actionKey === 'SCHEDULE_MOVE_IN' ||
    actionKey === 'VERIFY_DEPOSIT' ||
    actionKey === 'VERIFY_RENT' ||
    actionKey === 'COMPLETE_VIEWING' ||
    actionKey === 'COMPLETE_INSPECTION' ||
    actionKey === 'COMPLETE_KEY_HANDOVER'
  )
}

export function getActionFormSpec(actionKey: string, application: Application): WorkflowActionFormSpec {
  if (actionKey === 'UPLOAD_DOCS') {
    const ready = allDocsUploaded(application.documents)
    return {
      kind: 'upload',
      title: 'Upload required documents',
      description: ready
        ? 'All required documents are on file. Confirm to advance the workflow.'
        : 'Upload each required document below, then confirm when the file is complete.',
      confirmLabel: 'Mark documents uploaded',
      showDocumentChecklist: true,
    }
  }

  if (SIGNATURE_ACTIONS.has(actionKey)) {
    const party =
      actionKey === 'TENANT_SIGNED'
        ? 'Tenant'
        : actionKey === 'LANDLORD_SIGNED'
          ? 'Landlord / owner'
          : 'Signatory'
    return {
      kind: 'signature',
      title: `${party} signature`,
      description: 'Draw your electronic signature to sign the lease or sale document.',
      confirmLabel: 'Record signature',
      fields: [
        {
          key: 'signerName',
          label: 'Full legal name',
          type: 'text',
          required: true,
          placeholder: party,
        },
      ],
    }
  }

  if (actionKey === 'SCHEDULE_MOVE_IN') {
    return {
      kind: 'schedule',
      title: 'Schedule move-in inspection',
      description: 'Book the ingoing condition inspection and key collection details.',
      confirmLabel: 'Schedule inspection',
      fields: [
        { key: 'moveInDate', label: 'Inspection date', type: 'date', required: true },
        { key: 'keyLocation', label: 'Key collection location', type: 'text', required: true, placeholder: 'Agency reception' },
        { key: 'notes', label: 'Instructions for tenant', type: 'textarea', placeholder: 'Bring ID and signed lease.' },
      ],
    }
  }

  if (actionKey === 'AGENT_APPROVE' || actionKey === 'CONDITIONALLY_APPROVE') {
    const conditional = actionKey === 'CONDITIONALLY_APPROVE'
    return {
      kind: 'reject',
      title: conditional ? 'Conditionally approve' : 'Approve application',
      description: conditional
        ? 'Say why you are approving and the conditions the applicant must meet. Both go in the file history.'
        : 'Say why you are approving (for example the off-system credit check and agent review outcome). It goes in the file history.',
      confirmLabel: conditional ? 'Conditionally approve' : 'Approve',
      fields: [
        {
          key: 'reason',
          label: conditional ? 'Reason and conditions' : 'Reason for approving',
          type: 'textarea',
          required: true,
          placeholder: conditional
            ? 'e.g. Credit check fair. Approved on condition of a surety and a 2-month deposit.'
            : 'e.g. Credit check clear (TPN ref 1234), references good, affordability 28%.',
        },
      ],
    }
  }

  if (REJECT_ACTIONS.has(actionKey)) {
    const bureauTemplate =
      actionKey === 'DECLINE_CREDIT'
        ? 'Credit outcome: application not approved based on the affordability and screening outcome the agency recorded. If a credit report was used, you may dispute inaccurate information with the credit bureau that issued it: TransUnion (0861 482 482), Experian (0861 10 5665), or XDS (0860 937 000) under PAIA/ NCA. Agency note: '
        : undefined
    return {
      kind: 'reject',
      title: actionKey === 'DECLINE_CREDIT' || actionKey === 'REJECT_APPLICATION' || actionKey === 'LANDLORD_REJECTED' ? 'Decline application' : 'Confirm outcome',
      description:
        actionKey === 'DECLINE_CREDIT'
          ? 'Applicant receives the reason below plus standard bureau referral wording.'
          : 'This moves the application off the happy path. A reason is recorded in the file history.',
      confirmLabel: 'Confirm',
      fields: [
        {
          key: 'reason',
          label: 'Reason (required)',
          type: 'textarea',
          required: true,
          placeholder: bureauTemplate ?? 'Why? The applicant sees this and it goes in the file history.',
        },
      ],
    }
  }

  if (actionKey === 'VERIFY_DEPOSIT' || actionKey === 'VERIFY_RENT') {
    return {
      kind: 'fields',
      title: actionKey === 'VERIFY_DEPOSIT' ? 'Verify deposit' : 'Verify rent payment',
      description: 'Capture finance verification details before advancing.',
      confirmLabel: 'Verify payment',
      fields: [
        { key: 'reference', label: 'Payment reference', type: 'text', required: true },
        { key: 'amount', label: 'Amount (ZAR)', type: 'number', required: true },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ],
    }
  }

  if (actionKey === 'COMPLETE_VIEWING' || actionKey === 'COMPLETE_INSPECTION') {
    return {
      kind: 'fields',
      title: actionKey === 'COMPLETE_VIEWING' ? 'Complete viewing' : 'Complete inspection',
      description:
        actionKey === 'COMPLETE_INSPECTION'
          ? 'Stage-flip complete inspection. Soft-sign the in-app PCR pack (or audited no-show override) still required before keys / move-in — not PropertyInspect parity.'
          : 'Record attendance and any notes for the file.',
      confirmLabel: 'Mark complete',
      fields: [{ key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Feedback, attendance, condition notes…' }],
    }
  }

  if (actionKey === 'COMPLETE_KEY_HANDOVER') {
    return {
      kind: 'fields',
      title: 'Hand over keys',
      description: 'Confirm keys were collected and capture any handover notes.',
      confirmLabel: 'Confirm handover',
      fields: [
        { key: 'signerName', label: 'Collected by', type: 'text', required: true },
        { key: 'notes', label: 'Handover notes', type: 'textarea' },
      ],
    }
  }

  return {
    kind: 'confirm',
    title: 'Continue workflow',
    description: 'Confirm to advance this application to the next stage.',
    confirmLabel: 'Continue',
  }
}

export function validateActionCapture(
  spec: WorkflowActionFormSpec,
  capture: WorkflowActionCapture,
): string | null {
  for (const field of spec.fields ?? []) {
    if (!field.required) continue
    const val = capture[field.key]
    if (val == null || String(val).trim() === '') {
      return `${field.label} is required.`
    }
  }
  if (spec.kind === 'signature' && capture.signatureMethod !== 'paper_mark' && !capture.signatureDataUrl) {
    return 'Draw a signature before continuing.'
  }
  return null
}
