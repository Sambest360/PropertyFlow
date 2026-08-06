import { describe, expect, it } from 'vitest'
import type { Application } from '../types/domain'
import {
  applyWorkflowTransition,
  getAvailableTransitions,
  normalizeApplication,
  resolveWorkflowStatus,
  workflowProgress,
  workflowStageLabel,
} from './applicationWorkflow'
import { buildDocumentChecklist } from './workflow'

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
})
