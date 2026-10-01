import { describe, expect, it } from 'vitest'
import type { Application } from '../types/domain'
import {
  applyWorkflowTransition,
  activeCategoryStages,
  activeWorkflowCategory,
  categoryProgress,
  documentsForStage,
  getAvailableTransitions,
  getLifecycleMilestones,
  getStageRequirements,
  normalizeApplication,
  primaryNextTransition,
  resolveWorkflowStatus,
  workflowProgress,
  workflowStageLabel,
} from './applicationWorkflow'
import { buildDocumentChecklist, ensureApplicationDocuments } from './workflow'

function rentalApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'APP-1',
    agencyId: 'AG-1',
    propertyId: 'P-1',
    agentId: 'U-1',
    applicantUserId: null,
    applicantName: 'Amy Visser',
    email: 'amy@media.com',
    phone: '+27 73 880 5511',
    type: 'Rental',
    stage: 'Documents Pending',
    progress: 20,
    income: 45_000,
    employment: 'Employed',
    creditCheck: 'Not Started',
    creditConsent: true,
    documents: buildDocumentChecklist('Rental'),
    docs: [],
    viewingSlotId: null,
    notes: '',
    submittedAt: '2026-07-20',
    updatedAt: '2026-07-20',
    ...overrides,
  }
}

describe('applicationWorkflow', () => {
  it('maps legacy stages to workflow status', () => {
    const app = rentalApp({ stage: 'Documents Pending' })
    expect(resolveWorkflowStatus(app)).toBe('documents_requested')
    expect(normalizeApplication(app).stage).toBe('Documents requested')
  })

  it('offers document upload transition from documents_requested', () => {
    const app = normalizeApplication(
      rentalApp({
        documents: buildDocumentChecklist('Rental').map((d) => ({ ...d, status: 'uploaded' as const })),
      }),
    )
    const actions = getAvailableTransitions(app, ['applications.review'])
    expect(actions.some((a) => a.actionKey === 'UPLOAD_DOCS')).toBe(true)
  })

  it('advances through screening chain', () => {
    let app = normalizeApplication(
      rentalApp({
        workflowStatus: 'documents_uploaded',
        documents: buildDocumentChecklist('Rental').map((d) => ({ ...d, status: 'uploaded' as const })),
      }),
    )
    app = applyWorkflowTransition(app, 'fica_verification')
    expect(app.workflowStatus).toBe('fica_verification')
    expect(workflowStageLabel('Rental', 'fica_verification')).toBe('FICA verification')
    expect(workflowProgress('Rental', 'fica_verification')).toBeGreaterThan(0)
  })

  it('backfills empty document checklists on normalize', () => {
    const app = normalizeApplication(
      rentalApp({ documents: [], stage: 'Application started', workflowStatus: 'application_started' }),
    )
    expect(app.documents.length).toBeGreaterThan(0)
    expect(app.documents.every((d) => d.status === 'required')).toBe(true)
  })

  it('ensureApplicationDocuments preserves uploaded statuses', () => {
    const partial = ensureApplicationDocuments({
      type: 'Rental',
      documents: [{ key: 'id', label: 'Old label', status: 'uploaded' }],
    })
    expect(partial.find((d) => d.key === 'id')?.status).toBe('uploaded')
    expect(partial.length).toBe(buildDocumentChecklist('Rental').length)
  })

  it('suggests the primary action from application_started', () => {
    const app = normalizeApplication(
      rentalApp({ workflowStatus: 'application_started', stage: 'Application started' }),
    )
    const next = primaryNextTransition(app, ['applications.review'])
    // P0-3: both the applicant-facing Submit and the staff Approve are primary
    // candidates from `started`; either is a valid lead action.
    expect(['SUBMIT_APPLICATION', 'AGENT_APPROVE']).toContain(next?.actionKey)
  })

  it('resolves active category and stages for current phase only', () => {
    const app = normalizeApplication(
      rentalApp({ workflowStatus: 'application_started', stage: 'Application started' }),
    )
    expect(activeWorkflowCategory(app)).toBe('application')
    const stages = activeCategoryStages(app)
    expect(stages.map((s) => s.key)).toEqual([
      'application_started',
      'application_submitted',
      'documents_requested',
      'documents_uploaded',
    ])
    expect(categoryProgress(app)).toBe(0)
  })

  it('exposes lifecycle milestones and stage document requirements', () => {
    const app = normalizeApplication(rentalApp({ workflowStatus: 'documents_requested' }))
    const milestones = getLifecycleMilestones('Rental')
    expect(milestones.some((m) => m.key === 'documents_requested')).toBe(true)
    const req = getStageRequirements('documents_requested')
    expect(req?.documentKeys?.length).toBeGreaterThan(0)
    expect(documentsForStage(app, 'documents_requested').length).toBeGreaterThan(0)
  })

  // P0-approve (R10): the stuck-71% recovery — an application past approval
  // with NO lease must surface 'Approve & create lease'; one holding a lease
  // must keep the plain deposit flow.
  describe('RECOVER_APPROVE lease recovery', () => {
    const leaselessApp = normalizeApplication(
      rentalApp({ workflowStatus: 'deposit_invoice_sent', stage: 'Deposit invoice issued' }),
    )

    it('offers Approve & create lease only when no lease exists', () => {
      const withoutLease = getAvailableTransitions(leaselessApp, ['applications.review'], false)
      const recover = withoutLease.find((t) => t.actionKey === 'RECOVER_APPROVE')
      expect(recover).toBeDefined()
      expect(recover?.effect).toBe('approve')
      expect(recover?.to).toBe('conditionally_approved')

      const withLease = getAvailableTransitions(leaselessApp, ['applications.review'], true)
      expect(withLease.find((t) => t.actionKey === 'RECOVER_APPROVE')).toBeUndefined()
      // Deposit flow remains available in both cases
      expect(withLease.some((t) => t.actionKey === 'CONFIRM_DEPOSIT_PAID')).toBe(true)
    })

    it('defaults to lease-exists behavior for legacy callers', () => {
      const legacy = getAvailableTransitions(leaselessApp, ['applications.review'])
      expect(legacy.find((t) => t.actionKey === 'RECOVER_APPROVE')).toBeUndefined()
    })

    it('is permission-gated behind applications.review', () => {
      const denied = getAvailableTransitions(leaselessApp, [], false)
      expect(denied.find((t) => t.actionKey === 'RECOVER_APPROVE')).toBeUndefined()
    })

    it('never appears for applications already holding an applicant-side approval flow', () => {
      // A lease-less app still at review stage follows the normal approve path
      const early = normalizeApplication(rentalApp({ workflowStatus: 'agent_review' }))
      const transitions = getAvailableTransitions(early, ['applications.review'], false)
      expect(transitions.find((t) => t.actionKey === 'RECOVER_APPROVE')).toBeUndefined()
      expect(transitions.some((t) => t.actionKey === 'AGENT_APPROVE')).toBe(true)
    })
  })
})

describe('landlord portal review transitions', () => {
  it('portal.owner can approve or decline from landlord_review', () => {
    const app = {
      id: 'APP-LL-1',
      agencyId: 'ag-horizon',
      propertyId: 'PR-1001',
      agentId: null,
      applicantUserId: 'u-tenant',
      applicantName: 'Test Applicant',
      email: 'a@example.com',
      phone: '',
      type: 'Rental' as const,
      workflowStatus: 'landlord_review',
      stage: 'Owner / landlord approval',
      progress: 40,
      income: 0,
      employment: '',
      creditCheck: 'Passed' as const,
      creditConsent: true,
      documents: [],
      docs: [],
      viewingSlotId: null,
      notes: '',
      submittedAt: '2026-01-01',
      updatedAt: '2026-01-01',
    }
    const owner = getAvailableTransitions(app, ['portal.owner'])
    expect(owner.some((t) => t.actionKey === 'CONDITIONALLY_APPROVE')).toBe(true)
    expect(owner.some((t) => t.actionKey === 'LANDLORD_REJECTED')).toBe(true)
    expect(owner.some((t) => t.actionKey === 'SEND_LANDLORD_REVIEW')).toBe(false)

    const staff = getAvailableTransitions(app, ['applications.review'])
    expect(staff.some((t) => t.actionKey === 'CONDITIONALLY_APPROVE')).toBe(true)
  })
})
