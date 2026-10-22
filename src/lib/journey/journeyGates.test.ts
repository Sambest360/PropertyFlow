import { describe, expect, it } from 'vitest'
import type { Application } from '../../types/domain'
import { DEFAULT_RENTAL_JOURNEY } from './defaultRentalJourney'
import { canTransition } from './journeyGates'

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
    stage: 'Documents uploaded',
    progress: 40,
    income: 0,
    employment: '',
    creditCheck: 'Not Started',
    creditConsent: false,
    documents: [],
    docs: [],
    viewingSlotId: null,
    notes: '',
    submittedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    journeySnapshot: DEFAULT_RENTAL_JOURNEY,
    workflowStatus: 'documents_uploaded',
    ...overrides,
  }
}

describe('journeyGates.canTransition', () => {
  it('blocks credit_check without adult consents when consent step required', () => {
    const result = canTransition(app(), 'documents_uploaded', 'credit_check')
    expect(result).toMatch(/consent/i)
  })

  it('allows reject paths regardless of snapshot', () => {
    expect(canTransition(app(), 'agent_review', 'rejected')).toBe(true)
  })
})
