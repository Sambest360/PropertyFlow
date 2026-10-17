import { describe, expect, it } from 'vitest'
import type { Application } from '../../types/domain'
import {
  captureAdultCreditCheckConsents,
  hasAllAdultCreditConsents,
  needsCreditConsentTask,
} from './creditConsent'

function app(overrides: Partial<Application> = {}): Application {
  return {
    id: 'APP-1',
    agencyId: 'AG-1',
    propertyId: 'PR-1',
    agentId: null,
    applicantUserId: 'U-1',
    applicantName: 'Sam Applicant',
    email: 'sam@example.com',
    phone: '0820000000',
    type: 'Rental',
    workflowStatus: 'reference_checks',
    stage: 'Reference checks',
    progress: 40,
    income: 50000,
    employment: 'Acme — Engineer',
    idNumberOrPassport: '8001015800085',
    creditCheck: 'Not Started',
    creditConsent: false,
    documents: [],
    docs: [],
    viewingSlotId: null,
    notes: '',
    submittedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  }
}

describe('hasAllAdultCreditConsents', () => {
  it('blocks credit_check until two adults consented', () => {
    const base = app({
      creditCheckConsents: {
        adults: [
          {
            name: 'Sam Applicant',
            idNumber: '8001015800085',
            signatureText: '',
            grantedAt: '',
            method: 'applicant',
          },
          {
            name: 'Co Applicant',
            idNumber: '9002025800082',
            signatureText: '',
            grantedAt: '',
            method: 'applicant',
          },
        ],
      },
    })
    expect(hasAllAdultCreditConsents(base)).toBe(false)

    let next = captureAdultCreditCheckConsents(base, {
      adults: [{ name: 'Sam Applicant', idNumber: '8001015800085', signatureText: 'Sam Applicant' }],
    })
    expect(hasAllAdultCreditConsents(next)).toBe(false)

    next = captureAdultCreditCheckConsents(next, {
      adults: [{ name: 'Co Applicant', idNumber: '9002025800082', signatureText: 'Co Applicant' }],
    })
    expect(hasAllAdultCreditConsents(next)).toBe(true)
    expect(next.creditConsent).toBe(true)
  })
})

describe('needsCreditConsentTask', () => {
  it('shows portal task when consent missing pre credit_check', () => {
    expect(needsCreditConsentTask(app())).toBe(true)
    const done = captureAdultCreditCheckConsents(app(), {
      adults: [{ name: 'Sam Applicant', idNumber: '8001015800085', signatureText: 'Sam Applicant' }],
    })
    expect(needsCreditConsentTask(done)).toBe(false)
  })
})
