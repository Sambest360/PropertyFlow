import { describe, expect, it } from 'vitest'
import type { Application } from '../types/domain'
import { findOwnApplicationForProperty } from './applicantApplication'

function app(overrides: Partial<Application> = {}): Application {
  return {
    id: 'APP-1',
    agencyId: 'ag-1',
    propertyId: 'PR-1011',
    unitId: null,
    agentId: null,
    applicantUserId: 'u-tenant',
    applicantName: 'Sam Tenant',
    email: 'sam@example.com',
    phone: '',
    type: 'Rental',
    workflowStatus: 'application_submitted',
    stage: 'Application submitted',
    progress: 0,
    income: 0,
    employment: '',
    documents: [],
    docs: [],
    creditCheck: 'Not Started',
    creditConsent: false,
    viewingSlotId: null,
    notes: '',
    submittedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  }
}

describe('findOwnApplicationForProperty', () => {
  const user = { id: 'u-tenant', email: 'sam@example.com' }

  it('matches by applicantUserId', () => {
    const found = findOwnApplicationForProperty([app()], user, 'PR-1011')
    expect(found?.id).toBe('APP-1')
  })

  it('matches by email when user id differs', () => {
    const found = findOwnApplicationForProperty(
      [app({ applicantUserId: null })],
      user,
      'PR-1011',
    )
    expect(found?.id).toBe('APP-1')
  })

  it('returns null for guest or other listing', () => {
    expect(findOwnApplicationForProperty([app()], { id: 'guest', email: '' }, 'PR-1011')).toBeNull()
    expect(findOwnApplicationForProperty([app()], user, 'PR-9999')).toBeNull()
  })
})
