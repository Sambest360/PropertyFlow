import { describe, expect, it } from 'vitest'
import type { Application } from '../types/domain'
import { applicationPipelineBucket, matchesPipelineBucket } from './applicationPipeline'
import { resolveWorkflowStatus } from './applicationWorkflow'

function app(overrides: Partial<Application> = {}): Application {
  return {
    id: 'a1',
    agencyId: 'ag1',
    propertyId: 'p1',
    agentId: null,
    applicantUserId: 'u1',
    applicantName: 'Test',
    email: 't@test.com',
    phone: '',
    type: 'Rental',
    stage: 'Started',
    progress: 0,
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
    workflowStatus: 'application_submitted',
    ...overrides,
  }
}

describe('applicationPipeline', () => {
  it('maps workflow statuses to pipeline buckets', () => {
    expect(applicationPipelineBucket(app({ workflowStatus: 'application_submitted' }))).toBe('new')
    expect(applicationPipelineBucket(app({ workflowStatus: 'documents_requested' }))).toBe('documents_pending')
    expect(applicationPipelineBucket(app({ workflowStatus: 'credit_check' }))).toBe('credit_checks')
    expect(applicationPipelineBucket(app({ workflowStatus: 'agent_review' }))).toBe('awaiting_approval')
    expect(applicationPipelineBucket(app({ workflowStatus: 'deposit_invoice_sent' }))).toBe('deposit_pending')
    expect(applicationPipelineBucket(app({ workflowStatus: 'lease_sent' }))).toBe('lease_signing')
    expect(applicationPipelineBucket(app({ workflowStatus: 'active_tenancy' }))).toBe('completed')
    expect(applicationPipelineBucket(app({ workflowStatus: 'rejected' }))).toBe('rejected')
  })

  it('filters by bucket', () => {
    const submitted = app({ workflowStatus: 'application_submitted' })
    expect(matchesPipelineBucket(submitted, 'new')).toBe(true)
    expect(matchesPipelineBucket(submitted, 'documents_pending')).toBe(false)
  })

  it('resolves legacy stage labels', () => {
    const legacy = app({ stage: 'Documents Pending', workflowStatus: undefined })
    expect(resolveWorkflowStatus(legacy)).toBe('documents_requested')
    expect(applicationPipelineBucket(legacy)).toBe('documents_pending')
  })
})
