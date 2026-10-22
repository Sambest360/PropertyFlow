import { describe, expect, it } from 'vitest'
import {
  buildApplicantApplicationActions,
  getApplicantTasks,
  isApplicantAcceptanceStatus,
  siblingApplications,
} from './applicantPortalActions'
import type { Application } from '../types/domain'

const baseApp = (overrides: Partial<Application> = {}): Application =>
  ({
    id: 'APP-1',
    agencyId: 'AG-1',
    propertyId: 'PR-1',
    agentId: 'U-agent',
    applicantUserId: 'U-tenant',
    applicantName: 'Amy Visser',
    email: 'amy@example.com',
    phone: '',
    type: 'Rental',
    workflowStatus: 'application_started',
    stage: 'Application started',
    progress: 10,
    income: 0,
    employment: '',
    creditCheck: 'Not Started',
    creditConsent: false,
    documents: [{ key: 'id', label: 'ID copy', status: 'required' }],
    docs: [],
    viewingSlotId: null,
    notes: '',
    submittedAt: '2026-01-01',
    updatedAt: '2026-01-02',
    ...overrides,
  }) as Application

describe('applicantPortalActions', () => {
  it('surfaces submit task when application not yet submitted', () => {
    const tasks = getApplicantTasks(baseApp(), [])
    expect(tasks.some((t) => t.id === 'submit')).toBe(true)
    expect(tasks.some((t) => t.id === 'details')).toBe(false)
    expect(tasks.some((t) => t.id === 'consent')).toBe(false)
  })

  it('does not surface consent task when credit consent doc is pending', () => {
    const tasks = getApplicantTasks(
      baseApp({
        documents: [
          { key: 'id', label: 'ID copy', status: 'required' },
          { key: 'credit_consent', label: 'Credit consent', status: 'required' },
        ],
      }),
      [],
    )
    expect(tasks.some((t) => t.id === 'consent')).toBe(false)
  })

  it('builds applicant submit action for portal tenant', () => {
    const actions = buildApplicantApplicationActions({
      application: baseApp(),
      permissions: ['portal.tenant'],
    })
    expect(actions.some((a) => a.key === 'SUBMIT_APPLICATION')).toBe(true)
  })

  it('finds sibling applications when one is accepted', () => {
    const accepted = baseApp({
      id: 'APP-A',
      workflowStatus: 'conditionally_approved',
      stage: 'Conditionally approved',
    })
    const sibling = baseApp({
      id: 'APP-B',
      agencyId: 'AG-2',
      propertyId: 'PR-2',
      workflowStatus: 'documents_requested',
      stage: 'Documents requested',
    })
    const siblings = siblingApplications([accepted, sibling], accepted)
    expect(siblings.map((s) => s.id)).toEqual(['APP-B'])
    expect(isApplicantAcceptanceStatus('conditionally_approved')).toBe(true)
  })
})
