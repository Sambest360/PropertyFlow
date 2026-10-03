import type { Application, ApplicationDocument } from '../types/domain'
import type { Permission } from '../types/domain'
import { allDocsUploaded, allDocsVerified, ensureApplicationDocuments } from './workflow.js'
import { ficaPackSoftGate } from './ficaPack.js'
import {
  hasScreeningConsent,
  markScreeningInProgressOnWorkflow,
  screeningSoftGate,
} from './screening/index.js'
import { pcrSoftGate } from './pcr/index.js'

/** DQ-C2 + DQ-C3: FICA pack then screening soft-gate for approve / lease / move-in. */
function approveLeaseSoftGate(app: Application): true | string {
  const fica = ficaPackSoftGate(app)
  if (fica !== true) return fica
  return screeningSoftGate(app)
}

/** Mode A PCR: keys / move-in soft-gate on incoming soft-sign or audited override. */
function keysMoveInPcrSoftGate(app: Application): true | string {
  return pcrSoftGate(app)
}

/** Activate tenancy: FICA + screening + incoming PCR soft-gate. */
function activateTenancySoftGate(app: Application): true | string {
  const base = approveLeaseSoftGate(app)
  if (base !== true) return base
  return pcrSoftGate(app)
}

/** Machine-readable workflow statuses — rental (SA residential). */
export type RentalWorkflowStatus =
  | 'lead_created'
  | 'enquiry_received'
  | 'viewing_requested'
  | 'viewing_scheduled'
  | 'viewing_completed'
  | 'application_started'
  | 'application_submitted'
  | 'documents_requested'
  | 'documents_uploaded'
  | 'fica_verification'
  | 'employment_verification'
  | 'income_verification'
  | 'reference_checks'
  | 'credit_check'
  | 'affordability_assessment'
  | 'agent_review'
  | 'landlord_review'
  | 'conditionally_approved'
  | 'rejected'
  | 'lease_generated'
  | 'lease_sent'
  | 'tenant_signed'
  | 'landlord_signed'
  | 'deposit_invoice_sent'
  | 'deposit_paid'
  | 'deposit_verified'
  | 'first_rent_paid'
  | 'rent_verified'
  | 'inspection_scheduled'
  | 'inspection_completed'
  | 'keys_ready'
  | 'keys_handed_over'
  | 'active_tenancy'
  | 'renewal_offered'
  | 'renewed'
  | 'notice_given'
  | 'move_out_inspection'
  | 'deposit_refunded'
  | 'closed'
  | 'cancelled'
  | 'withdrawn'

/** Machine-readable workflow statuses — purchase (SA transfer). */
export type PurchaseWorkflowStatus =
  | 'lead_created'
  | 'property_enquiry'
  | 'viewing_requested'
  | 'viewing_scheduled'
  | 'viewing_completed'
  | 'offer_started'
  | 'offer_submitted'
  | 'seller_review'
  | 'offer_rejected'
  | 'offer_accepted'
  | 'sale_agreement_signed'
  | 'attorney_assigned'
  | 'fica_verification'
  | 'bond_application'
  | 'bond_approved'
  | 'bond_declined'
  | 'deposit_requested'
  | 'deposit_paid'
  | 'transfer_processing'
  | 'compliance_certificates'
  | 'rates_clearance'
  | 'transfer_duty_paid'
  | 'deeds_lodgement'
  | 'registration_in_progress'
  | 'registered'
  | 'purchase_price_paid'
  | 'occupation'
  | 'keys_handed_over'
  | 'ownership_transferred'
  | 'completed'
  | 'withdrawn'
  | 'cancelled'

export type WorkflowStatusKey = RentalWorkflowStatus | PurchaseWorkflowStatus

export type WorkflowCategory =
  | 'enquiry'
  | 'application'
  | 'screening'
  | 'review'
  | 'legal'
  | 'financial'
  | 'occupancy'
  | 'tenancy'
  | 'closure'

export type WorkflowStageDef = {
  key: WorkflowStatusKey
  label: string
  category: WorkflowCategory
  order: number
  mandatory?: boolean
  parallel?: boolean
  terminal?: boolean
  slaDays?: number
}

export type WorkflowTransition = {
  from: WorkflowStatusKey
  to: WorkflowStatusKey
  actionKey: string
  label: string
  hint: string
  tone?: 'primary' | 'secondary' | 'danger' | 'ghost'
  requires?: Permission[]
  /** At least one of these permissions (e.g. staff review OR landlord portal). */
  requiresAny?: Permission[]
  confirm?: string
  /** Side-effect hooks consumed by AppStore */
  effect?: 'approve' | 'schedule_move_in' | 'key_handover' | 'open_checkout'
  guard?: (app: Application) => boolean | string
}

export type WorkflowTemplate = {
  id: 'rental' | 'purchase'
  label: string
  stages: WorkflowStageDef[]
  transitions: WorkflowTransition[]
}

const CATEGORY_LABELS: Record<WorkflowCategory, string> = {
  enquiry: 'Enquiry & viewing',
  application: 'Application',
  screening: 'Screening & verification',
  review: 'Review & approval',
  legal: 'Legal & signing',
  financial: 'Financial',
  occupancy: 'Move-in & keys',
  tenancy: 'Active tenancy',
  closure: 'Closure',
}

export function workflowCategoryLabel(category: WorkflowCategory): string {
  return CATEGORY_LABELS[category]
}

/** Category the application is currently in (e.g. application, screening). */
export function activeWorkflowCategory(application: Application): WorkflowCategory {
  const status = resolveWorkflowStatus(application)
  return getStageDef(application.type, status)?.category ?? 'application'
}

/** Stages to show for the active category — hides unrelated phases and closure noise. */
export function activeCategoryStages(application: Application): WorkflowStageDef[] {
  const status = resolveWorkflowStatus(application)
  const category = activeWorkflowCategory(application)
  const grouped = workflowStagesByCategory(application.type)
  const stages = grouped[category].filter((stageDef) => {
    const visual = stageVisualState(application.type, status, stageDef.key)
    return visual !== 'skipped' || stageDef.terminal
  })

  if (category === 'closure') {
    const current = getStageDef(application.type, status)
    if (current?.terminal) return stages.filter((s) => s.key === status)
    return stages.filter((s) => !s.terminal || s.key === status)
  }

  return stages.filter((s) => !s.terminal || s.key === status)
}

/** Progress through mandatory steps in the active category (0–100). */
export function categoryProgress(application: Application): number {
  const status = resolveWorkflowStatus(application)
  const stages = activeCategoryStages(application).filter((s) => !s.terminal && s.mandatory !== false)
  if (!stages.length) return 0
  const currentOrder = getStageDef(application.type, status)?.order ?? 0
  const minOrder = stages[0]?.order ?? 0
  const maxOrder = stages[stages.length - 1]?.order ?? minOrder
  if (maxOrder <= minOrder) return status === stages[0]?.key ? 0 : 100
  const clamped = Math.min(Math.max(currentOrder, minOrder), maxOrder)
  return Math.round(((clamped - minOrder) / (maxOrder - minOrder)) * 100)
}

function stage(
  key: WorkflowStatusKey,
  label: string,
  category: WorkflowCategory,
  order: number,
  extra?: Partial<WorkflowStageDef>,
): WorkflowStageDef {
  return { key, label, category, order, mandatory: true, ...extra }
}

export const RENTAL_WORKFLOW: WorkflowTemplate = {
  id: 'rental',
  label: 'South African rental',
  stages: [
    stage('lead_created', 'Lead created', 'enquiry', 1),
    stage('enquiry_received', 'Enquiry received', 'enquiry', 2),
    stage('viewing_requested', 'Viewing requested', 'enquiry', 3),
    stage('viewing_scheduled', 'Viewing scheduled', 'enquiry', 4),
    stage('viewing_completed', 'Viewing completed', 'enquiry', 5),
    stage('application_started', 'Application started', 'application', 10),
    stage('application_submitted', 'Application submitted', 'application', 11),
    stage('documents_requested', 'Documents requested', 'application', 12),
    stage('documents_uploaded', 'Documents uploaded', 'application', 13),
    stage('fica_verification', 'FICA verification', 'screening', 20, { parallel: true }),
    stage('employment_verification', 'Employment verification', 'screening', 21, { parallel: true }),
    stage('income_verification', 'Income verification', 'screening', 22, { parallel: true }),
    stage('reference_checks', 'Reference checks', 'screening', 23, { parallel: true }),
    stage('credit_check', 'Credit check', 'screening', 24),
    stage('affordability_assessment', 'Affordability assessment', 'screening', 25),
    stage('agent_review', 'Agent review', 'review', 30),
    stage('landlord_review', 'Owner / landlord approval', 'review', 31),
    stage('conditionally_approved', 'Conditionally approved', 'review', 32),
    stage('lease_generated', 'Lease generated', 'legal', 40),
    stage('lease_sent', 'Lease sent', 'legal', 41),
    stage('tenant_signed', 'Lease signed by tenant', 'legal', 42),
    stage('landlord_signed', 'Lease signed by landlord', 'legal', 43),
    stage('deposit_invoice_sent', 'Deposit invoice issued', 'financial', 50),
    stage('deposit_paid', 'Deposit paid', 'financial', 51),
    stage('deposit_verified', 'Deposit verified', 'financial', 52),
    stage('first_rent_paid', "First month's rent paid", 'financial', 53),
    stage('rent_verified', 'Rent verified', 'financial', 54),
    stage('inspection_scheduled', 'Move-in inspection scheduled', 'occupancy', 60),
    stage('inspection_completed', 'Move-in inspection completed', 'occupancy', 61),
    stage('keys_ready', 'Keys ready', 'occupancy', 62),
    stage('keys_handed_over', 'Keys handed over', 'occupancy', 63),
    stage('active_tenancy', 'Active tenancy', 'tenancy', 70),
    stage('renewal_offered', 'Renewal offered', 'tenancy', 71, { mandatory: false }),
    stage('renewed', 'Renewed', 'tenancy', 72, { mandatory: false }),
    stage('notice_given', 'Notice to vacate', 'tenancy', 73, { mandatory: false }),
    stage('move_out_inspection', 'Move-out inspection', 'closure', 80, { mandatory: false }),
    stage('deposit_refunded', 'Deposit refunded', 'closure', 81, { terminal: true }),
    stage('closed', 'Closed', 'closure', 82, { terminal: true }),
    stage('rejected', 'Rejected', 'closure', 90, { terminal: true }),
    stage('cancelled', 'Cancelled', 'closure', 91, { terminal: true }),
    stage('withdrawn', 'Withdrawn', 'closure', 92, { terminal: true }),
  ],
  transitions: [
    { from: 'lead_created', to: 'enquiry_received', actionKey: 'LOG_ENQUIRY', label: 'Log enquiry', hint: 'Record inbound enquiry details', tone: 'secondary', requires: ['applications.review'] },
    { from: 'enquiry_received', to: 'viewing_requested', actionKey: 'REQUEST_VIEWING', label: 'Request viewing', hint: 'Applicant wants to view the property', tone: 'secondary', requires: ['applications.review'] },
    { from: 'viewing_requested', to: 'viewing_scheduled', actionKey: 'SCHEDULE_VIEWING', label: 'Schedule viewing', hint: 'Confirm date and time with applicant', tone: 'primary', requires: ['applications.review'] },
    { from: 'viewing_scheduled', to: 'viewing_completed', actionKey: 'COMPLETE_VIEWING', label: 'Mark viewing completed', hint: 'Record attendance and feedback', tone: 'secondary', requires: ['applications.review'] },
    { from: 'viewing_completed', to: 'application_started', actionKey: 'START_APPLICATION', label: 'Start application', hint: 'Open the rental application file', tone: 'primary', requires: ['applications.review'] },
    { from: 'application_started', to: 'application_submitted', actionKey: 'SUBMIT_APPLICATION', label: 'Submit application', hint: 'Applicant confirms intent to rent', tone: 'secondary', requires: ['applications.review'] },
    // P0-3 (E2E #2): legacy apps stuck at "Application started" (pre-fix rows
    // with submittedAt already set) must still expose the staff decision
    // controls — not only the applicant's Submit button.
    {
      from: 'application_started',
      to: 'conditionally_approved',
      actionKey: 'AGENT_APPROVE',
      label: 'Approve',
      hint: 'Approve this applicant now (agency authority) — requires verified FICA pack + screening passed or audited override',
      tone: 'primary',
      requires: ['applications.review'],
      effect: 'approve',
      confirm: 'Approve this application? The applicant gets tenant access.',
      guard: (app) => approveLeaseSoftGate(app),
    },
    {
      from: 'application_started',
      to: 'rejected',
      actionKey: 'REJECT_APPLICATION',
      label: 'Reject',
      hint: 'Decline this application',
      tone: 'danger',
      requires: ['applications.review'],
      confirm: 'Reject this application? The applicant will be notified.',
    },
    { from: 'application_submitted', to: 'documents_requested', actionKey: 'REQUEST_DOCUMENTS', label: 'Request documents', hint: 'Send FICA and income document checklist', tone: 'primary', requires: ['applications.review'] },
    // P0-3 (E2E #2): staff decision controls directly from Submitted —
    // Approve jumps the long screening ladder (agent authority) and Reject
    // records the decline. Both write audit events via advanceApplicationWorkflow.
    {
      from: 'application_submitted',
      to: 'conditionally_approved',
      actionKey: 'AGENT_APPROVE',
      label: 'Approve',
      hint: 'Approve this applicant now (agency authority) — requires verified FICA pack + screening passed or audited override',
      tone: 'primary',
      requires: ['applications.review'],
      effect: 'approve',
      confirm: 'Approve this application? The applicant gets tenant access.',
      guard: (app) => approveLeaseSoftGate(app),
    },
    {
      from: 'application_submitted',
      to: 'agent_review',
      actionKey: 'MOVE_TO_REVIEW',
      label: 'Move to review',
      hint: 'Flag for manual screening',
      tone: 'secondary',
      requires: ['applications.review'],
    },
    {
      from: 'application_submitted',
      to: 'rejected',
      actionKey: 'REJECT_APPLICATION',
      label: 'Reject',
      hint: 'Decline this application',
      tone: 'danger',
      requires: ['applications.review'],
      confirm: 'Reject this application? The applicant will be notified.',
    },
    {
      from: 'documents_requested',
      to: 'documents_uploaded',
      actionKey: 'UPLOAD_DOCS',
      label: 'Mark documents uploaded',
      hint: 'All required files received',
      tone: 'primary',
      requires: ['applications.review'],
      guard: (app) => allDocsUploaded(app.documents) || 'Upload or verify all required documents first',
    },
    // P0 Approve→occupancy: staff Approve from doc stages when FICA verified +
    // screening passed|manual_override (soft gate). Pending screening requires
    // audited override first — never invent Passed.
    {
      from: 'documents_requested',
      to: 'conditionally_approved',
      actionKey: 'AGENT_APPROVE',
      label: 'Approve',
      hint: 'Approve once FICA pack is verified and screening is passed or audited override — Mode A, not live TPN',
      tone: 'primary',
      requires: ['applications.review'],
      effect: 'approve',
      confirm: 'Approve this application? The applicant gets tenant access.',
      guard: (app) => approveLeaseSoftGate(app),
    },
    {
      from: 'documents_uploaded',
      to: 'conditionally_approved',
      actionKey: 'AGENT_APPROVE',
      label: 'Approve',
      hint: 'Approve once FICA pack is verified and screening is passed or audited override — Mode A, not live TPN',
      tone: 'primary',
      requires: ['applications.review'],
      effect: 'approve',
      confirm: 'Approve this application? The applicant gets tenant access.',
      guard: (app) => approveLeaseSoftGate(app),
    },
    {
      from: 'documents_requested',
      to: 'documents_uploaded',
      actionKey: 'UPLOAD_DOCS',
      label: 'Confirm documents uploaded',
      hint: 'Submit uploaded documents for agency review',
      tone: 'primary',
      requires: ['portal.tenant'],
      guard: (app) => allDocsUploaded(app.documents) || 'Upload all required documents first',
    },
    { from: 'documents_uploaded', to: 'fica_verification', actionKey: 'START_FICA', label: 'Open FICA pack review', hint: 'Staff review ID, address, and FICA declaration in-app (not live bureau)', tone: 'secondary', requires: ['applications.review'] },
    { from: 'fica_verification', to: 'employment_verification', actionKey: 'VERIFY_EMPLOYMENT', label: 'Verify employment', hint: 'Confirm employer and role', tone: 'secondary', requires: ['applications.review'] },
    { from: 'employment_verification', to: 'income_verification', actionKey: 'VERIFY_INCOME', label: 'Verify income', hint: 'Validate payslips and bank statements', tone: 'secondary', requires: ['applications.review'] },
    { from: 'income_verification', to: 'reference_checks', actionKey: 'RUN_REFERENCES', label: 'Run reference checks', hint: 'Contact previous landlord or agent', tone: 'secondary', requires: ['applications.review'] },
    { from: 'reference_checks', to: 'credit_check', actionKey: 'START_CREDIT_CHECK', label: 'Start credit check (mock/manual)', hint: 'Requires POPIA consent — starts Mode A mock/manual screening (not live TPN / not live bureau)', tone: 'secondary', requires: ['applications.review'], guard: (app) => hasScreeningConsent(app) || 'Capture POPIA credit-check consent before starting screening (Mode A mock/manual — not live TPN)' },
    { from: 'credit_check', to: 'affordability_assessment', actionKey: 'ASSESS_AFFORDABILITY', label: 'Assess affordability', hint: 'Rent-to-income and debt review', tone: 'secondary', requires: ['applications.review'] },
    { from: 'affordability_assessment', to: 'agent_review', actionKey: 'SUBMIT_AGENT_REVIEW', label: 'Submit for agent review', hint: 'Package file for manual decision', tone: 'primary', requires: ['applications.review'] },
    { from: 'agent_review', to: 'landlord_review', actionKey: 'SEND_LANDLORD_REVIEW', label: 'Send to landlord', hint: 'Owner approves or declines tenant', tone: 'secondary', requires: ['applications.review'] },
    { from: 'landlord_review', to: 'conditionally_approved', actionKey: 'CONDITIONALLY_APPROVE', label: 'Conditionally approve', hint: 'Approve subject to lease and payments — requires verified FICA pack + screening passed or audited override', tone: 'primary', requiresAny: ['applications.review', 'portal.owner'], guard: (app) => approveLeaseSoftGate(app) },
    { from: 'agent_review', to: 'conditionally_approved', actionKey: 'AGENT_APPROVE', label: 'Approve (agent authority)', hint: 'Skip landlord when mandated — requires verified FICA pack + screening passed or audited override', tone: 'primary', requires: ['applications.review'], guard: (app) => approveLeaseSoftGate(app) },
    { from: 'conditionally_approved', to: 'lease_generated', actionKey: 'GENERATE_LEASE', label: 'Generate lease', hint: 'Create lease from agency template', tone: 'primary', requires: ['applications.review'], guard: (app) => approveLeaseSoftGate(app) },
    { from: 'lease_generated', to: 'lease_sent', actionKey: 'SEND_LEASE', label: 'Send lease for signing', hint: 'Email lease to tenant and landlord', tone: 'secondary', requires: ['applications.review'], guard: (app) => approveLeaseSoftGate(app) },
    { from: 'lease_sent', to: 'tenant_signed', actionKey: 'TENANT_SIGNED', label: 'Tenant signed', hint: 'Record tenant digital signature', tone: 'secondary', requires: ['applications.review'] },
    { from: 'tenant_signed', to: 'landlord_signed', actionKey: 'LANDLORD_SIGNED', label: 'Landlord signed', hint: 'Record landlord signature', tone: 'secondary', requires: ['applications.review'] },
    {
      from: 'landlord_signed',
      to: 'deposit_invoice_sent',
      actionKey: 'ISSUE_DEPOSIT_INVOICE',
      label: 'Issue deposit invoice',
      hint: 'Create deposit and first rent invoice',
      tone: 'primary',
      requires: ['applications.review'],
      effect: 'approve',
      guard: (app) => approveLeaseSoftGate(app),
    },
    { from: 'deposit_invoice_sent', to: 'deposit_paid', actionKey: 'CONFIRM_DEPOSIT_PAID', label: 'Confirm deposit paid', hint: 'Payment received on platform or EFT', tone: 'secondary', requires: ['applications.review'] },
    { from: 'deposit_invoice_sent', to: 'deposit_paid', actionKey: 'OPEN_CHECKOUT', label: 'Pay deposit online', hint: 'Open PayFast / Peach checkout', tone: 'primary', requires: ['portal.tenant'], effect: 'open_checkout' },
    { from: 'deposit_paid', to: 'deposit_verified', actionKey: 'VERIFY_DEPOSIT', label: 'Verify deposit', hint: 'Finance confirms cleared funds', tone: 'secondary', requires: ['applications.review'] },
    { from: 'deposit_verified', to: 'first_rent_paid', actionKey: 'CONFIRM_FIRST_RENT', label: "Confirm first month's rent", hint: 'First rental payment received', tone: 'secondary', requires: ['applications.review'] },
    { from: 'first_rent_paid', to: 'rent_verified', actionKey: 'VERIFY_RENT', label: 'Verify rent payment', hint: 'Finance clears first month', tone: 'secondary', requires: ['applications.review'] },
    { from: 'rent_verified', to: 'inspection_scheduled', actionKey: 'SCHEDULE_MOVE_IN', label: 'Schedule move-in inspection', hint: 'Book ingoing condition inspection', tone: 'secondary', requires: ['applications.review'], effect: 'schedule_move_in', guard: (app) => approveLeaseSoftGate(app) },
    { from: 'inspection_scheduled', to: 'inspection_completed', actionKey: 'COMPLETE_INSPECTION', label: 'Complete inspection', hint: 'Record ingoing condition report (Mode A soft PCR pack — stage flip; soft-sign / override still required for keys)', tone: 'secondary', requires: ['applications.review'] },
    { from: 'inspection_completed', to: 'keys_ready', actionKey: 'KEYS_READY', label: 'Keys ready', hint: 'Keys cut and ready for collection — requires incoming PCR soft-sign or audited override', tone: 'secondary', requires: ['applications.review'], guard: (app) => keysMoveInPcrSoftGate(app) },
    { from: 'keys_ready', to: 'keys_handed_over', actionKey: 'COMPLETE_KEY_HANDOVER', label: 'Hand over keys', hint: 'Confirm keys collected by tenant — requires incoming PCR soft-sign or audited override', tone: 'primary', requires: ['applications.review'], effect: 'key_handover', guard: (app) => keysMoveInPcrSoftGate(app) },
    { from: 'keys_handed_over', to: 'active_tenancy', actionKey: 'ACTIVATE_TENANCY', label: 'Activate tenancy', hint: 'Lease is live — start rent cycle (FICA + screening + incoming PCR soft-gate)', tone: 'primary', requires: ['applications.review'], guard: (app) => activateTenancySoftGate(app) },
    { from: 'active_tenancy', to: 'renewal_offered', actionKey: 'OFFER_RENEWAL', label: 'Offer renewal', hint: 'Record in-app renewal terms before expiry (Mode A book — not CPA legal service / not live notice)', tone: 'secondary', requires: ['applications.review'] },
    { from: 'renewal_offered', to: 'renewed', actionKey: 'ACCEPT_RENEWAL', label: 'Renewal accepted', hint: 'Extend term + rent on book (Mode A — does not auto-sign a new e-sign package)', tone: 'primary', requires: ['applications.review'] },
    { from: 'renewal_offered', to: 'notice_given', actionKey: 'DECLINE_RENEWAL', label: 'Renewal declined', hint: 'Record notice_given on book (Mode A — no invented early-cancel penalty)', tone: 'secondary', requires: ['applications.review'] },
    { from: 'active_tenancy', to: 'notice_given', actionKey: 'RECORD_NOTICE', label: 'Record notice to vacate', hint: 'Tenant or landlord gives notice', tone: 'secondary', requires: ['applications.review'] },
    { from: 'notice_given', to: 'move_out_inspection', actionKey: 'SCHEDULE_MOVE_OUT', label: 'Schedule move-out inspection', hint: 'Book outgoing inspection', tone: 'secondary', requires: ['applications.review'] },
    { from: 'move_out_inspection', to: 'deposit_refunded', actionKey: 'REFUND_DEPOSIT', label: 'Refund deposit', hint: 'Process deposit after damages assessment — soft-warn if no outgoing PCR path (not hard auto-forfeit; not RHA legal advice)', tone: 'primary', requires: ['applications.review'], confirm: 'Confirm deposit refund / release. Mode A soft-warn: without an outgoing PCR path this is theater honesty only — not a hard auto-forfeit and not RHA legal advice.' },
    { from: 'deposit_refunded', to: 'closed', actionKey: 'CLOSE_FILE', label: 'Close file', hint: 'Archive completed tenancy file', tone: 'secondary', requires: ['applications.review'] },
    // Branch / exit paths
    { from: 'documents_requested', to: 'withdrawn', actionKey: 'WITHDRAW', label: 'Applicant withdraws', hint: 'Applicant cancels application', tone: 'ghost', requires: ['applications.review'], confirm: 'Mark this application as withdrawn?' },
    { from: 'viewing_scheduled', to: 'cancelled', actionKey: 'CANCEL_VIEWING', label: 'Cancel viewing', hint: 'Viewing cancelled — reschedule or close', tone: 'ghost', requires: ['applications.review'] },
    { from: 'credit_check', to: 'rejected', actionKey: 'DECLINE_CREDIT', label: 'Decline (credit)', hint: 'Credit declined — notify applicant', tone: 'danger', requires: ['applications.review'], confirm: 'Reject due to credit outcome?' },
    { from: 'agent_review', to: 'rejected', actionKey: 'REJECT_APPLICATION', label: 'Reject application', hint: 'Decline after manual review', tone: 'danger', requires: ['applications.review'], confirm: 'Reject this application?' },
    { from: 'landlord_review', to: 'rejected', actionKey: 'LANDLORD_REJECTED', label: 'Landlord rejected', hint: 'Owner declined this applicant', tone: 'danger', requiresAny: ['applications.review', 'portal.owner'], confirm: 'Record landlord rejection?' },
    { from: 'deposit_invoice_sent', to: 'cancelled', actionKey: 'CANCEL_NO_DEPOSIT', label: 'Cancel (no deposit)', hint: 'Deposit not received in time', tone: 'danger', requires: ['applications.review'], confirm: 'Cancel — deposit not received?' },
    // P0-approve (R10): recovery for applications already past approval but
    // WITHOUT a durable lease (the stuck 71% defect — the approve machine
    // creates the lease in the same transaction, so an app can only reach this
    // stage lease-less when the durable write failed earlier). Routed through
    // the approve effect: the same snapshot/revert approve machine runs and
    // creates the real lease + payments. Gated by leaseExists in
    // getAvailableTransitions — offered only to lease-aware callers.
    {
      from: 'deposit_invoice_sent',
      to: 'conditionally_approved',
      actionKey: 'RECOVER_APPROVE',
      label: 'Approve & create lease',
      hint: 'No lease exists for this application — run approval to create one (requires verified FICA pack + screening passed or audited override)',
      tone: 'primary',
      requires: ['applications.review'],
      effect: 'approve',
      confirm: 'No lease exists yet. Approve this application now to create the lease and payment schedule?',
      guard: (app) => approveLeaseSoftGate(app),
    },
  ],
}

export const PURCHASE_WORKFLOW: WorkflowTemplate = {
  id: 'purchase',
  label: 'South African purchase',
  stages: [
    stage('lead_created', 'Lead created', 'enquiry', 1),
    stage('property_enquiry', 'Property enquiry', 'enquiry', 2),
    stage('viewing_requested', 'Viewing requested', 'enquiry', 3),
    stage('viewing_scheduled', 'Viewing scheduled', 'enquiry', 4),
    stage('viewing_completed', 'Viewing completed', 'enquiry', 5),
    stage('offer_started', 'Offer to purchase started', 'application', 10),
    stage('offer_submitted', 'Offer submitted', 'application', 11),
    stage('seller_review', 'Seller review', 'review', 20),
    stage('offer_rejected', 'Offer rejected', 'closure', 90, { terminal: true }),
    stage('offer_accepted', 'Offer accepted', 'review', 21),
    stage('sale_agreement_signed', 'Sale agreement signed', 'legal', 30),
    stage('attorney_assigned', 'Attorney appointed', 'legal', 31),
    stage('fica_verification', 'FICA verification', 'screening', 32),
    stage('bond_application', 'Bond application submitted', 'financial', 40),
    stage('bond_approved', 'Bond outcome recorded (approved)', 'financial', 41),
    stage('bond_declined', 'Bond outcome recorded (declined)', 'closure', 91, { terminal: true }),
    stage('deposit_requested', 'Deposit requested', 'financial', 42),
    stage('deposit_paid', 'Deposit paid', 'financial', 43),
    stage('transfer_processing', 'Transfer attorney processing', 'legal', 50),
    stage('compliance_certificates', 'Compliance certificates', 'legal', 51, { parallel: true }),
    stage('rates_clearance', 'Rates clearance', 'legal', 52, { parallel: true }),
    stage('transfer_duty_paid', 'Transfer duty paid', 'financial', 53),
    stage('deeds_lodgement', 'Lodgement recorded', 'legal', 54),
    stage('registration_in_progress', 'Registration in progress (staff-recorded)', 'legal', 55),
    stage('registered', 'Registration recorded', 'legal', 56),
    stage('purchase_price_paid', 'Purchase price paid', 'financial', 57),
    stage('occupation', 'Occupation date', 'occupancy', 60),
    stage('keys_handed_over', 'Keys handed over', 'occupancy', 61),
    stage('ownership_transferred', 'Ownership transferred', 'tenancy', 70),
    stage('completed', 'Completed', 'closure', 80, { terminal: true }),
    stage('withdrawn', 'Withdrawn', 'closure', 92, { terminal: true }),
    stage('cancelled', 'Cancelled', 'closure', 93, { terminal: true }),
  ],
  transitions: [
    { from: 'lead_created', to: 'property_enquiry', actionKey: 'LOG_ENQUIRY', label: 'Log property enquiry', hint: 'Record buyer interest', tone: 'secondary', requires: ['applications.review'] },
    { from: 'property_enquiry', to: 'viewing_requested', actionKey: 'REQUEST_VIEWING', label: 'Request viewing', hint: 'Schedule a property viewing', tone: 'secondary', requires: ['applications.review'] },
    { from: 'viewing_requested', to: 'viewing_scheduled', actionKey: 'SCHEDULE_VIEWING', label: 'Schedule viewing', hint: 'Confirm viewing slot', tone: 'primary', requires: ['applications.review'] },
    { from: 'viewing_scheduled', to: 'viewing_completed', actionKey: 'COMPLETE_VIEWING', label: 'Viewing completed', hint: 'Record viewing outcome', tone: 'secondary', requires: ['applications.review'] },
    { from: 'viewing_completed', to: 'offer_started', actionKey: 'START_OFFER', label: 'Start offer', hint: 'Begin offer to purchase', tone: 'primary', requires: ['applications.review'] },
    { from: 'offer_started', to: 'offer_submitted', actionKey: 'SUBMIT_OFFER', label: 'Submit offer', hint: 'Send OTP to seller', tone: 'primary', requires: ['applications.review'] },
    { from: 'offer_submitted', to: 'seller_review', actionKey: 'SELLER_REVIEW', label: 'Seller reviewing', hint: 'Await seller decision', tone: 'secondary', requires: ['applications.review'] },
    { from: 'seller_review', to: 'offer_accepted', actionKey: 'ACCEPT_OFFER', label: 'Offer accepted', hint: 'Seller accepts offer', tone: 'primary', requires: ['applications.review'] },
    { from: 'seller_review', to: 'offer_rejected', actionKey: 'REJECT_OFFER', label: 'Offer rejected', hint: 'Seller declined offer', tone: 'danger', requires: ['applications.review'], confirm: 'Record offer rejection?' },
    { from: 'offer_accepted', to: 'sale_agreement_signed', actionKey: 'SIGN_SALE_AGREEMENT', label: 'Sale agreement signed', hint: 'OTP signed by both parties', tone: 'primary', requires: ['applications.review'] },
    { from: 'sale_agreement_signed', to: 'attorney_assigned', actionKey: 'ASSIGN_ATTORNEY', label: 'Appoint attorney', hint: 'Transfer attorney assigned', tone: 'secondary', requires: ['applications.review'] },
    { from: 'attorney_assigned', to: 'fica_verification', actionKey: 'START_FICA', label: 'Open FICA pack review', hint: 'Staff review buyer ID, address, and FICA declaration in-app (not live bureau)', tone: 'secondary', requires: ['applications.review'] },
    { from: 'fica_verification', to: 'bond_application', actionKey: 'SUBMIT_BOND', label: 'Record bond application submitted', hint: 'Staff recorded that a bond application was submitted (from bank / broker paperwork)', tone: 'secondary', requires: ['applications.review'] },
    { from: 'bond_application', to: 'bond_approved', actionKey: 'BOND_APPROVED', label: 'Record bond outcome from bank letter', hint: 'Staff recorded an approval outcome from a bank letter — not live bank HTTP', tone: 'primary', requires: ['applications.review'] },
    { from: 'bond_application', to: 'bond_declined', actionKey: 'BOND_DECLINED', label: 'Record bond decline from bank letter', hint: 'Staff recorded a decline outcome from a bank letter — not live bank HTTP', tone: 'danger', requires: ['applications.review'], confirm: 'Record bond decline from bank letter?' },
    { from: 'bond_approved', to: 'deposit_requested', actionKey: 'REQUEST_DEPOSIT', label: 'Request deposit', hint: 'Issue deposit payment request', tone: 'secondary', requires: ['applications.review'], effect: 'approve', guard: (app) => approveLeaseSoftGate(app) },
    { from: 'deposit_requested', to: 'deposit_paid', actionKey: 'CONFIRM_DEPOSIT', label: 'Deposit paid', hint: 'Confirm deposit received', tone: 'secondary', requires: ['applications.review'] },
    { from: 'deposit_paid', to: 'transfer_processing', actionKey: 'START_TRANSFER', label: 'Start transfer', hint: 'Attorney begins transfer process', tone: 'primary', requires: ['applications.review'] },
    { from: 'transfer_processing', to: 'compliance_certificates', actionKey: 'COMPLIANCE_CERTS', label: 'Compliance certificates', hint: 'Electrical, plumbing, beetle certs', tone: 'secondary', requires: ['applications.review'] },
    { from: 'compliance_certificates', to: 'rates_clearance', actionKey: 'RATES_CLEARANCE', label: 'Rates clearance', hint: 'Municipal rates clearance obtained', tone: 'secondary', requires: ['applications.review'] },
    { from: 'rates_clearance', to: 'transfer_duty_paid', actionKey: 'TRANSFER_DUTY', label: 'Transfer duty paid', hint: 'SARS transfer duty receipt', tone: 'secondary', requires: ['applications.review'] },
    { from: 'transfer_duty_paid', to: 'deeds_lodgement', actionKey: 'DEEDS_LODGEMENT', label: 'Mark lodgement recorded', hint: 'Staff marked lodgement recorded from attorney update — not live e-filing or Deeds Office feed', tone: 'secondary', requires: ['applications.review'] },
    { from: 'deeds_lodgement', to: 'registration_in_progress', actionKey: 'REGISTRATION_PROGRESS', label: 'Mark registration in progress', hint: 'Staff recorded attorney update that registration is in progress — not live Deeds status', tone: 'secondary', requires: ['applications.review'] },
    { from: 'registration_in_progress', to: 'registered', actionKey: 'REGISTERED', label: 'Mark registration recorded', hint: 'Staff recorded registration notice from attorney — not live Deeds Office confirmation', tone: 'primary', requires: ['applications.review'] },
    { from: 'registered', to: 'purchase_price_paid', actionKey: 'PRICE_PAID', label: 'Purchase price paid', hint: 'Transfer of purchase funds complete', tone: 'secondary', requires: ['applications.review'] },
    { from: 'purchase_price_paid', to: 'occupation', actionKey: 'SET_OCCUPATION', label: 'Occupation date', hint: 'Buyer takes occupation', tone: 'secondary', requires: ['applications.review'] },
    { from: 'occupation', to: 'keys_handed_over', actionKey: 'HANDOVER_KEYS', label: 'Keys handed over', hint: 'Buyer receives keys', tone: 'primary', requires: ['applications.review'], effect: 'key_handover' },
    { from: 'keys_handed_over', to: 'ownership_transferred', actionKey: 'TRANSFER_OWNERSHIP', label: 'Ownership transferred', hint: 'Transfer complete', tone: 'primary', requires: ['applications.review'] },
    { from: 'ownership_transferred', to: 'completed', actionKey: 'COMPLETE_PURCHASE', label: 'Complete purchase', hint: 'Close purchase file', tone: 'secondary', requires: ['applications.review'] },
    { from: 'offer_submitted', to: 'withdrawn', actionKey: 'WITHDRAW', label: 'Buyer withdraws', hint: 'Buyer cancels offer', tone: 'ghost', requires: ['applications.review'], confirm: 'Mark as withdrawn?' },
  ],
}

/** Legacy display stages → workflow status */
const LEGACY_STAGE_TO_STATUS: Record<string, WorkflowStatusKey> = {
  Started: 'application_started',
  'Documents Pending': 'documents_requested',
  'Documents Submitted': 'documents_uploaded',
  'Viewing Booked': 'viewing_scheduled',
  'Under Review': 'agent_review',
  'Credit Check': 'credit_check',
  Approved: 'conditionally_approved',
  'Awaiting Payment': 'deposit_invoice_sent',
  'Deposit Paid': 'deposit_paid',
  'Lease Signed': 'landlord_signed',
  'Move-In Scheduled': 'inspection_scheduled',
  'Keys Handed Over': 'keys_handed_over',
  'Active Tenancy': 'active_tenancy',
  Rejected: 'rejected',
  Withdrawn: 'withdrawn',
  Blocked: 'rejected',
  'Documents Verified': 'fica_verification',
  'Application Submitted': 'application_submitted',
}

export function getWorkflowTemplate(type: Application['type']): WorkflowTemplate {
  return type === 'Purchase' ? PURCHASE_WORKFLOW : RENTAL_WORKFLOW
}

export function resolveWorkflowStatus(app: Pick<Application, 'type' | 'stage' | 'workflowStatus'>): WorkflowStatusKey {
  if (app.workflowStatus) return app.workflowStatus as WorkflowStatusKey
  const mapped = LEGACY_STAGE_TO_STATUS[app.stage]
  if (mapped) return mapped
  return app.type === 'Purchase' ? 'offer_started' : 'application_started'
}

export function getStageDef(
  type: Application['type'],
  status: WorkflowStatusKey,
): WorkflowStageDef | undefined {
  return getWorkflowTemplate(type).stages.find((s) => s.key === status)
}

export function workflowStageLabel(type: Application['type'], status: WorkflowStatusKey): string {
  return getStageDef(type, status)?.label ?? status.replace(/_/g, ' ')
}

export function isTerminalWorkflowStatus(type: Application['type'], status: WorkflowStatusKey): boolean {
  return Boolean(getStageDef(type, status)?.terminal)
}

export function workflowProgress(type: Application['type'], status: WorkflowStatusKey): number {
  const template = getWorkflowTemplate(type)
  const def = getStageDef(type, status)
  if (!def) return 0
  if (def.terminal) return def.key === 'rejected' || def.key === 'cancelled' || def.key === 'withdrawn' || def.key === 'bond_declined' || def.key === 'offer_rejected' ? 0 : 100
  const happyPath = template.stages.filter((s) => !s.terminal && s.mandatory !== false)
  const maxOrder = happyPath[happyPath.length - 1]?.order ?? 70
  const minOrder = happyPath[0]?.order ?? 1
  if (maxOrder <= minOrder) return 0
  return Math.min(100, Math.max(0, Math.round(((def.order - minOrder) / (maxOrder - minOrder)) * 100)))
}

export function workflowStagesByCategory(type: Application['type']): Record<WorkflowCategory, WorkflowStageDef[]> {
  const template = getWorkflowTemplate(type)
  const grouped = {} as Record<WorkflowCategory, WorkflowStageDef[]>
  for (const cat of Object.keys(CATEGORY_LABELS) as WorkflowCategory[]) {
    grouped[cat] = template.stages
      .filter((s) => s.category === cat)
      .sort((a, b) => a.order - b.order)
  }
  return grouped
}

export type WorkflowStageState = 'completed' | 'current' | 'upcoming' | 'terminal' | 'skipped'

export function stageVisualState(
  type: Application['type'],
  status: WorkflowStatusKey,
  stageKey: WorkflowStatusKey,
): WorkflowStageState {
  const def = getStageDef(type, stageKey)
  const current = getStageDef(type, status)
  if (!def || !current) return 'upcoming'
  if (stageKey === status) return 'current'
  if (def.terminal && stageKey === status) return 'terminal'
  if (current.terminal && stageKey !== status) {
    if (def.terminal) return stageKey === status ? 'terminal' : 'skipped'
  }
  if (def.order < current.order) return 'completed'
  if (def.terminal) return 'skipped'
  return 'upcoming'
}

export function getAvailableTransitions(
  app: Application,
  actorPermissions: Permission[],
  /** P0-approve (R10): caller-supplied lease truth for the recovery gate.
   *  Defaults to true so every existing caller (and its optimistic store view)
   *  behaves exactly as before — only lease-aware callers pass false. */
  leaseExists = true,
): WorkflowTransition[] {
  const status = resolveWorkflowStatus(app)
  const template = getWorkflowTemplate(app.type)
  if (isTerminalWorkflowStatus(app.type, status)) return []

  return template.transitions.filter((t) => {
    if (t.from !== status) return false
    if (t.requires?.length && !t.requires.every((p) => actorPermissions.includes(p))) return false
    if (t.requiresAny?.length && !t.requiresAny.some((p) => actorPermissions.includes(p))) return false
    // P0-approve (R10): the recovery transition is only offered when the
    // application is provably WITHOUT a lease. Apps already holding a real
    // lease keep the plain Confirm-deposit flow.
    if (t.actionKey === 'RECOVER_APPROVE' && leaseExists) return false
    if (t.guard) {
      const ok = t.guard(app)
      if (ok !== true) return false
    }
    return true
  })
}

/** Best next workflow step for agent “Advance” — prefers primary happy-path actions. */
export function primaryNextTransition(
  app: Application,
  actorPermissions: Permission[],
  /** P0-r21: pass false for lease-less deposit apps so RECOVER_APPROVE surfaces. */
  leaseExists = true,
): WorkflowTransition | null {
  const transitions = getAvailableTransitions(app, actorPermissions, leaseExists)
  if (!transitions.length) return null
  const toneRank: Record<string, number> = { primary: 0, secondary: 1, ghost: 2, danger: 3 }
  return [...transitions].sort((a, b) => {
    const ta = toneRank[a.tone ?? 'secondary'] ?? 1
    const tb = toneRank[b.tone ?? 'secondary'] ?? 1
    return ta - tb || a.label.localeCompare(b.label)
  })[0]
}

export function workflowStageSelectOptions(type: Application['type']) {
  return getWorkflowTemplate(type)
    .stages.slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      key: s.key as WorkflowStatusKey,
      label: s.label,
      terminal: Boolean(s.terminal),
    }))
}

export function canIssueLeaseApproval(app: Application, actorPermissions: Permission[]): boolean {
  return getAvailableTransitions(app, actorPermissions).some(
    (t) =>
      t.effect === 'approve' ||
      t.to === 'conditionally_approved' ||
      t.actionKey === 'CONDITIONALLY_APPROVE' ||
      t.actionKey === 'AGENT_APPROVE',
  )
}

export function transitionGuardMessage(
  app: Application,
  transition: WorkflowTransition,
): string | null {
  if (!transition.guard) return null
  const result = transition.guard(app)
  return result === true ? null : typeof result === 'string' ? result : 'This step is not available yet.'
}

export function normalizeApplication(app: Application): Application {
  const documents = ensureApplicationDocuments(app)
  const enriched = {
    ...app,
    documents,
    docs: documents.filter((d) => d.status !== 'required').map((d) => d.label),
  }
  const workflowStatus = resolveWorkflowStatus(enriched)
  const stage = workflowStageLabel(enriched.type, workflowStatus)
  const progress = workflowProgress(enriched.type, workflowStatus)
  return { ...enriched, workflowStatus, stage, progress }
}

export function applyWorkflowTransition(
  app: Application,
  to: WorkflowStatusKey,
): Application {
  const template = getWorkflowTemplate(app.type)
  const valid = template.transitions.some(
    (t) => t.from === resolveWorkflowStatus(app) && t.to === to,
  )
  if (!valid) return app

  // Screening status is owned by the screening pipeline — approve must NOT invent Passed.
  let nextApp: Application = { ...app, workflowStatus: to }
  if (to === 'credit_check') {
    nextApp = markScreeningInProgressOnWorkflow(nextApp)
  }
  if (to === 'rejected' && (app.screening?.status === 'in_progress' || app.creditCheck === 'In Progress')) {
    nextApp = {
      ...nextApp,
      creditCheck: 'Failed',
      screening: {
        ...(app.screening ?? { status: 'in_progress' as const }),
        status: 'failed',
        summary: app.screening?.summary ?? 'Marked failed on application rejection while screening was in progress.',
        checkedAt: new Date().toISOString(),
      },
    }
  }

  let documents = nextApp.documents
  if (to === 'documents_uploaded' && !allDocsVerified(documents)) {
    documents = documents.map((d: ApplicationDocument) =>
      d.status === 'required' || d.status === 'uploaded' ? { ...d, status: 'uploaded' as const } : d,
    )
  }
  // DQ-C2 Mode A: START_FICA / fica_verification must NOT invent verified
  // id/address/fica rows. Staff verify each pack item explicitly (not live bureau).

  return normalizeApplication({
    ...nextApp,
    workflowStatus: to,
    documents,
    updatedAt: new Date().toISOString().slice(0, 10),
  })
}

export const RENTAL_BRANCH_OUTCOMES: Array<{ key: WorkflowStatusKey; label: string; description: string }> = [
  { key: 'withdrawn', label: 'Withdrawn', description: 'Applicant cancelled' },
  { key: 'rejected', label: 'Rejected', description: 'Declined after screening or review' },
  { key: 'cancelled', label: 'Cancelled', description: 'Viewing or deal cancelled' },
  { key: 'deposit_refunded', label: 'Deposit refunded', description: 'Tenancy ended — deposit returned' },
]

export const PURCHASE_BRANCH_OUTCOMES: Array<{ key: WorkflowStatusKey; label: string; description: string }> = [
  { key: 'withdrawn', label: 'Withdrawn', description: 'Buyer cancelled' },
  { key: 'offer_rejected', label: 'Offer rejected', description: 'Seller declined offer' },
  { key: 'bond_declined', label: 'Bond outcome declined', description: 'Staff recorded bond decline from bank letter' },
  { key: 'cancelled', label: 'Cancelled', description: 'Deal cancelled' },
]

export function workflowBranchOutcomes(type: Application['type']) {
  return type === 'Purchase' ? PURCHASE_BRANCH_OUTCOMES : RENTAL_BRANCH_OUTCOMES
}

export type StageActor = 'applicant' | 'agent' | 'system' | 'both'

export type StageRequirements = {
  actor: StageActor
  documentKeys?: string[]
  waitingLabel?: string
  futureLabel?: string
  etaDays?: number
}

/** User-facing lifecycle milestones (clickable timeline rail). */
export type LifecycleMilestone = {
  key: WorkflowStatusKey
  label: string
  description: string
}

const RENTAL_MILESTONES: LifecycleMilestone[] = [
  { key: 'application_started', label: 'Application', description: 'Complete your details and submit your application.' },
  { key: 'application_submitted', label: 'Submitted', description: 'Agency receives your application for review.' },
  { key: 'documents_requested', label: 'Documents', description: 'Upload FICA, ID, and income documents.' },
  { key: 'fica_verification', label: 'Identity', description: 'Agency verifies your identity documents.' },
  { key: 'credit_check', label: 'Credit check', description: 'Credit bureau and affordability assessment (1–2 business days).' },
  { key: 'agent_review', label: 'Agent review', description: 'Agent reviews your full application file.' },
  { key: 'viewing_scheduled', label: 'Viewing', description: 'Optional property viewing before or after approval.' },
  { key: 'conditionally_approved', label: 'Approved', description: 'Application approved — deposit and lease next.' },
  { key: 'deposit_invoice_sent', label: 'Deposit', description: 'Pay deposit and first month rent.' },
  { key: 'lease_sent', label: 'Lease', description: 'Review and sign the lease agreement.' },
  { key: 'active_tenancy', label: 'Move-in', description: 'Keys, inspection, and occupancy.' },
]

const PURCHASE_MILESTONES: LifecycleMilestone[] = [
  { key: 'offer_started', label: 'Offer', description: 'Prepare and submit your offer to purchase.' },
  { key: 'offer_submitted', label: 'Submitted', description: 'Seller receives your offer.' },
  { key: 'offer_accepted', label: 'Accepted', description: 'Offer accepted — FICA and bond next.' },
  { key: 'fica_verification', label: 'FICA', description: 'Identity and compliance documents.' },
  { key: 'bond_application', label: 'Bond', description: 'Staff track bond paperwork — outcome recorded from bank letter (not live bank).' },
  { key: 'deposit_requested', label: 'Deposit', description: 'Pay the purchase deposit.' },
  { key: 'attorney_assigned', label: 'Conveyancer', description: 'Transfer attorney recorded (staff note — not live portal).' },
  { key: 'transfer_processing', label: 'Transfer', description: 'Transfer steps tracked in soft-demo checklist — not live Deeds filing.' },
  { key: 'registered', label: 'Registered', description: 'Registration recorded by staff from attorney notice.' },
  { key: 'occupation', label: 'Occupation', description: 'Take occupation of the property.' },
]

export function getLifecycleMilestones(type: Application['type']): LifecycleMilestone[] {
  return type === 'Purchase' ? PURCHASE_MILESTONES : RENTAL_MILESTONES
}

const STAGE_REQUIREMENTS: Partial<Record<WorkflowStatusKey, StageRequirements>> = {
  application_started: {
    actor: 'applicant',
    waitingLabel: 'Complete your personal details and submit when ready.',
  },
  application_submitted: {
    actor: 'agent',
    waitingLabel: 'Waiting for agency to request documents.',
    futureLabel: 'Agency will open your document checklist.',
  },
  documents_requested: {
    actor: 'applicant',
    documentKeys: ['id', 'address', 'payslips', 'bank', 'employment', 'credit_consent', 'landlord_ref', 'fica'],
    waitingLabel: 'Upload each required document below.',
  },
  documents_uploaded: {
    actor: 'agent',
    waitingLabel: 'Agency is reviewing uploaded documents.',
  },
  fica_verification: {
    actor: 'agent',
    documentKeys: ['id', 'address', 'fica'],
    waitingLabel: 'Staff reviewing FICA pack (ID, address, declaration) in-app — not live bureau.',
    etaDays: 1,
  },
  credit_check: {
    actor: 'system',
    waitingLabel: 'Credit and affordability check running.',
    etaDays: 2,
  },
  affordability_assessment: {
    actor: 'system',
    waitingLabel: 'Affordability assessment in progress.',
    etaDays: 1,
  },
  agent_review: {
    actor: 'agent',
    waitingLabel: 'Agent is reviewing your application.',
  },
  landlord_review: {
    actor: 'agent',
    waitingLabel: 'Waiting for landlord approval.',
  },
  viewing_scheduled: {
    actor: 'both',
    waitingLabel: 'Viewing scheduled — confirm attendance.',
  },
  conditionally_approved: {
    actor: 'applicant',
    waitingLabel: 'Congratulations — prepare for deposit and lease.',
  },
  deposit_invoice_sent: {
    actor: 'applicant',
    waitingLabel: 'Deposit payment required.',
  },
  deposit_paid: {
    actor: 'agent',
    waitingLabel: 'Deposit submitted — awaiting verification.',
  },
  lease_sent: {
    actor: 'applicant',
    waitingLabel: 'Lease ready for your signature.',
  },
  tenant_signed: {
    actor: 'agent',
    waitingLabel: 'Waiting for landlord signature.',
  },
  active_tenancy: {
    actor: 'both',
    waitingLabel: 'Tenancy active — complete move-in checklist.',
  },
  offer_started: { actor: 'applicant', waitingLabel: 'Complete and submit your offer.' },
  offer_submitted: { actor: 'agent', waitingLabel: 'Seller is reviewing your offer.' },
  bond_application: {
    actor: 'agent',
    waitingLabel: 'Await bank letter — staff will record bond outcome (not live bank feed).',
    etaDays: 7,
  },
  transfer_processing: {
    actor: 'agent',
    waitingLabel: 'Transfer attorney processing — update checklist from attorney pack (not live Deeds).',
    etaDays: 14,
  },
  deeds_lodgement: {
    actor: 'agent',
    waitingLabel: 'Mark lodgement recorded when attorney confirms — not e-filing.',
  },
}

export function getStageRequirements(status: WorkflowStatusKey): StageRequirements | null {
  return STAGE_REQUIREMENTS[status] ?? null
}

export function milestoneVisualState(
  type: Application['type'],
  currentStatus: WorkflowStatusKey,
  milestoneKey: WorkflowStatusKey,
): WorkflowStageState {
  const milestones = getLifecycleMilestones(type)
  const currentIdx = milestones.findIndex((m) => m.key === currentStatus)
  const milestoneIdx = milestones.findIndex((m) => m.key === milestoneKey)
  if (milestoneIdx < 0) return 'skipped'

  const currentDef = getStageDef(type, currentStatus)
  const milestoneDef = getStageDef(type, milestoneKey)
  if (!currentDef || !milestoneDef) return 'upcoming'

  if (milestoneKey === currentStatus) return 'current'
  if (currentDef.terminal && milestoneKey !== currentStatus) {
    return milestoneDef.order < currentDef.order ? 'completed' : 'skipped'
  }

  if (currentIdx >= 0 && milestoneIdx >= 0) {
    if (milestoneIdx < currentIdx) return 'completed'
    if (milestoneIdx === currentIdx) return 'current'
    return 'upcoming'
  }

  if (milestoneDef.order < currentDef.order) return 'completed'
  return 'upcoming'
}

export function documentsForStage(
  application: Application,
  stageKey: WorkflowStatusKey,
): ApplicationDocument[] {
  const req = getStageRequirements(stageKey)
  if (!req?.documentKeys?.length) return []
  const keys = new Set(req.documentKeys)
  return application.documents.filter((d) => keys.has(d.key))
}
