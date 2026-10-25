/**
 * End-to-end lifecycle walk: from the first stage a new application lands on
 * to the last, every step must be offered to the right person (agent or
 * tenant) and its guard must be satisfiable by what that person can do in the
 * app (upload / verify documents, consent, screening, PCR sign-off).
 */
import { describe, expect, it } from 'vitest'
import type { Application } from '../types/domain'
import { buildApplicationActions } from './api/actions'
import { buildApplicantApplicationActions } from './applicantPortalActions'
import { applyWorkflowTransition, resolveWorkflowStatus, type WorkflowStatusKey } from './applicationWorkflow'
import { initialWorkflowForCreate } from './createApplicationInitialStatus'
import { rolePermissions } from './permissions'
import { buildDocumentChecklist } from './workflow'
import { captureAdultCreditCheckConsents } from './screening/creditConsent'
import { overrideScreening } from './screening/pipeline'
import { ensureIngoingInspection, softSignStaff, softSignTenant, upsertInspectionOnApplication } from './pcr/inspections'

const STAFF = { userId: 'u-agent', role: 'agent_admin' as const, agencyId: 'ag-1', permissions: rolePermissions.agent_admin }
const TENANT_PERMS = rolePermissions.tenant

function newApp(type: Application['type']): Application {
  const start = initialWorkflowForCreate(type)
  return {
    id: 'APP-walk',
    agencyId: 'ag-1',
    propertyId: 'P-1',
    agentId: 'u-agent',
    applicantUserId: 'u-tenant',
    applicantName: 'Alec Powers',
    email: 'alec@example.com',
    phone: '0820000000',
    idNumberOrPassport: '0205316178180',
    type,
    stage: start.stage,
    workflowStatus: start.workflowStatus,
    progress: 0,
    income: 30_000,
    employment: 'Teacher',
    creditCheck: 'Not Started',
    creditConsent: false,
    documents: buildDocumentChecklist(type),
    docs: [],
    viewingSlotId: null,
    notes: '',
    submittedAt: '2026-10-25',
    updatedAt: '2026-10-25',
  } as Application
}

/** What the people involved do at a stage before the next move (real app tools). */
function prepare(app: Application, status: WorkflowStatusKey): Application {
  let a = app
  if (status === 'documents_requested') {
    // Tenant uploads every document.
    a = { ...a, documents: a.documents.map((d) => ({ ...d, status: 'uploaded' as const })) }
  }
  if (status === 'fica_verification' || status === 'documents_uploaded') {
    // Agent verifies the pack.
    a = { ...a, documents: a.documents.map((d) => ({ ...d, status: 'verified' as const })) }
  }
  if (status === 'reference_checks') {
    // Tenant signs credit-check consent (Your details tab).
    a = captureAdultCreditCheckConsents(a, {
      adults: [{ name: a.applicantName, idNumber: a.idNumberOrPassport!, signatureText: a.applicantName }],
      grantedBy: 'u-tenant',
    })
  }
  if (status === 'affordability_assessment' && a.type === 'Rental') {
    // Agent records the screening result.
    const r = overrideScreening(a, { newStatus: 'passed', reason: 'Bureau report reviewed', byUserId: 'u-agent', byName: 'Agent' })
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
    a = r.application
  }
  if (status === 'inspection_completed' && a.type === 'Rental') {
    // Agent runs the incoming PCR and both sides sign off.
    const created = ensureIngoingInspection(a, new Date().toISOString(), null).application
    let insp = created.pcrInspections!.find((i) => i.kind === 'incoming')!
    // The agent checks every item first (sign-off needs a full report).
    insp = {
      ...insp,
      rooms: insp.rooms.map((r) => ({ ...r, items: r.items.map((it) => ({ ...it, condition: 'good' as const })) })),
    }
    const s1 = softSignStaff(insp, { userId: 'u-agent', name: 'Agent' }, new Date().toISOString())
    expect(s1.ok).toBe(true)
    if (s1.ok) insp = s1.inspection
    const s2 = softSignTenant(insp, { userId: 'u-tenant', name: a.applicantName, method: 'staff_recorded' }, new Date().toISOString(), 'ack')
    expect(s2.ok).toBe(true)
    if (s2.ok) insp = s2.inspection
    a = upsertInspectionOnApplication(created, insp)
  }
  return a
}

/** Walk the happy path; returns every step taken and who took it. */
function walk(type: Application['type'], path: WorkflowStatusKey[]) {
  let app = newApp(type)
  const steps: string[] = []
  for (const to of path) {
    const from = resolveWorkflowStatus(app)
    app = prepare(app, from)
    const tenant = buildApplicantApplicationActions({ application: app, permissions: TENANT_PERMS })
    const staff = buildApplicationActions({ application: app, actor: STAFF })
    const byTenant = tenant.find((x) => x.payload_hint?.workflowStatus === to)
    const byStaff = staff.find((x) => x.payload_hint?.workflowStatus === to)
    const who = byTenant ? 'tenant' : byStaff ? 'agent' : null
    expect(
      who,
      `${type}: stuck at ${from} — nobody can move to ${to}. Agent sees [${staff
        .map((x) => x.payload_hint?.workflowStatus)
        .join(', ')}], tenant sees [${tenant.map((x) => x.payload_hint?.workflowStatus).join(', ')}]`,
    ).not.toBeNull()
    const next = applyWorkflowTransition(app, to)
    expect(resolveWorkflowStatus(next), `${type}: ${from} -> ${to} did not apply`).toBe(to)
    steps.push(`${from}->${to} by ${who}`)
    app = next
  }
  return { app, steps }
}

describe('application lifecycle walk', () => {
  it('rental: submitted application reaches a closed file', () => {
    const { app, steps } = walk('Rental', [
      'documents_requested',
      'documents_uploaded',
      'fica_verification',
      'employment_verification',
      'income_verification',
      'reference_checks',
      'credit_check',
      'affordability_assessment',
      'agent_review',
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
      'notice_given',
      'move_out_inspection',
      'deposit_refunded',
      'closed',
    ])
    expect(resolveWorkflowStatus(app)).toBe('closed')
    // The tenant does their own parts.
    expect(steps).toContain('documents_requested->documents_uploaded by tenant')
    expect(steps).toContain('lease_sent->tenant_signed by tenant')
  })

  it('purchase: submitted offer reaches completion', () => {
    const { app } = walk('Purchase', [
      'seller_review',
      'offer_accepted',
      'sale_agreement_signed',
      'attorney_assigned',
      'fica_verification',
      'bond_application',
      'bond_approved',
      'deposit_requested',
      'deposit_paid',
      'transfer_processing',
      'compliance_certificates',
      'rates_clearance',
      'transfer_duty_paid',
      'deeds_lodgement',
      'registration_in_progress',
      'registered',
      'purchase_price_paid',
      'occupation',
      'keys_handed_over',
      'ownership_transferred',
      'completed',
    ])
    expect(resolveWorkflowStatus(app)).toBe('completed')
  })
})

describe('tenant documents before the agency asks', () => {
  it('lets the tenant send a full upload for review straight from Application submitted', () => {
    let app = newApp('Rental')
    expect(resolveWorkflowStatus(app)).toBe('application_submitted')
    // Nothing to send until every document is uploaded.
    expect(
      buildApplicantApplicationActions({ application: app, permissions: TENANT_PERMS }).some(
        (a) => a.payload_hint?.workflowStatus === 'documents_uploaded',
      ),
    ).toBe(false)
    app = { ...app, documents: app.documents.map((d) => ({ ...d, status: 'uploaded' as const })) }
    const send = buildApplicantApplicationActions({ application: app, permissions: TENANT_PERMS }).find(
      (a) => a.payload_hint?.workflowStatus === 'documents_uploaded',
    )
    expect(send?.label).toBe('Send documents for review')
    expect(resolveWorkflowStatus(applyWorkflowTransition(app, 'documents_uploaded'))).toBe('documents_uploaded')
    // Not an agent action.
    expect(
      buildApplicationActions({ application: app, actor: STAFF }).some((a) => a.key === 'UPLOAD_DOCS'),
    ).toBe(false)
  })
})
