import { describe, expect, it } from 'vitest'
import { actionNeedsModal, getActionFormSpec, validateActionCapture } from './workflowActionForms'
import type { Application } from '../types/domain'

function app(overrides: Partial<Application> = {}): Application {
  return {
    id: 'a1',
    agencyId: 'ag1',
    propertyId: 'p1',
    agentId: null,
    applicantUserId: 'u1',
    applicantName: 'Sam',
    email: 'sam@test.com',
    phone: '',
    type: 'Rental',
    stage: 'Application started',
    progress: 10,
    income: 0,
    employment: '',
    creditCheck: 'Not Started',
    creditConsent: false,
    documents: [
      { key: 'id', label: 'ID copy', status: 'required', note: '' },
      { key: 'payslip', label: 'Payslip', status: 'required', note: '' },
    ],
    docs: [],
    viewingSlotId: null,
    notes: '',
    submittedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  }
}

describe('workflowActionForms', () => {
  it('opens modal for signature and upload actions', () => {
    expect(actionNeedsModal('TENANT_SIGNED')).toBe(true)
    expect(actionNeedsModal('UPLOAD_DOCS')).toBe(true)
    expect(actionNeedsModal('LOG_ENQUIRY')).toBe(false)
  })

  it('requires signature data for signature forms', () => {
    const spec = getActionFormSpec('TENANT_SIGNED', app())
    expect(spec.kind).toBe('signature')
    expect(validateActionCapture(spec, { signerName: 'Sam' })).toMatch(/signature/i)
    expect(
      validateActionCapture(spec, {
        signerName: 'Sam',
        signatureDataUrl: 'data:image/png;base64,abc',
      }),
    ).toBeNull()
  })
})
