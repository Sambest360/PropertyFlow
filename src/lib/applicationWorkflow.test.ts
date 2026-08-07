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

  it('suggests submit application from application_started', () => {
    const app = normalizeApplication(
      rentalApp({ workflowStatus: 'application_started', stage: 'Application started' }),
    )
    const next = primaryNextTransition(app, ['applications.review'])
    expect(next?.actionKey).toBe('SUBMIT_APPLICATION')
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
})
