import { describe, expect, it } from 'vitest'
import type { Application } from '../types/domain'
import { getAvailableTransitions, resolveWorkflowStatus, applyWorkflowTransition } from './applicationWorkflow'
import { apiStatusFromStage } from './api/actions'
import { guidedTransitionError, patchApplicationStatus } from './api/applicationStatusApi'
import type { Tenancy } from '../types/domain'
import { tenantHasApprovedOccupancy } from './tenantOccupancy'
import { buildApplicantApplicationActions } from './applicantPortalActions'

function app(overrides: Partial<Application> = {}): Application {
  return {
    id: 'APP-1',
    agencyId: 'ag-1',
    propertyId: 'PR-1',
    agentId: null,
    applicantUserId: 'u-applicant-a',
    applicantName: 'Applicant A',
    email: 'a@test.example',
    phone: '',
    type: 'Rental',
    stage: 'Application submitted',
    progress: 20,
    income: 0,
    employment: '',
    creditCheck: 'Not Started',
    creditConsent: false,
    documents: [],
    docs: [],
    viewingSlotId: null,
    notes: '',
    submittedAt: '2026-09-18',
    updatedAt: '2026-09-18',
    workflowStatus: 'application_submitted',
    ...overrides,
  }
}

const STAFF_PERMS = ['applications.review'] as import('../types/domain').Permission[]

describe('P0-3: Submitted stage machine', () => {
  it('new guest applications resolve to application_submitted', () => {
    const a = app()
    expect(resolveWorkflowStatus(a)).toBe('application_submitted')
  })

  it('Submitted offers Approve / Move to review / Reject / Request documents to staff', () => {
    const transitions = getAvailableTransitions(app(), STAFF_PERMS)
    const keys = transitions.map((t) => t.actionKey)
    expect(keys).toContain('AGENT_APPROVE')
    expect(keys).toContain('MOVE_TO_REVIEW')
    expect(keys).toContain('REJECT_APPLICATION')
    expect(keys).toContain('REQUEST_DOCUMENTS')
  })

  it('Submitted offers no staff transitions to a user without applications.review', () => {
    const transitions = getAvailableTransitions(app(), [])
    expect(transitions.map((t) => t.actionKey)).not.toContain('AGENT_APPROVE')
    expect(transitions.map((t) => t.actionKey)).not.toContain('REJECT_APPLICATION')
  })

  it("stage label 'Application submitted' maps to API SUBMITTED", () => {
    expect(apiStatusFromStage('Application submitted')).toBe('SUBMITTED')
  })

  it('staff can Approve straight from Submitted (ALLOWED map)', () => {
    const actor = {
      userId: 'u-staff',
      role: 'client_admin' as const,
      agencyId: 'ag-1',
      permissions: STAFF_PERMS,
    }
    const property = {
      id: 'PR-1',
      agencyId: 'ag-1',
      landlordId: 'u-landlord',
      agentId: null,
      unitId: 'un-1',
      title: 'QA listing',
      type: 'Apartment',
      status: 'Published',
      listingMode: 'rent',
      rent: 18500,
      price: null,
      city: 'Cape Town',
      suburb: 'CBD',
      beds: 2,
      baths: 1,
      parking: 1,
      area: 80,
      amenities: [],
      images: [],
      featured: false,
      createdAt: '2026-09-01',
    } as import('../types/domain').PropertyAsset
    const unit = {
      id: 'un-1',
      buildingId: 'bld-1',
      unitNumber: '1',
      statusKey: 'PUBLISHED',
      listingType: 'rent',
      rent: 18500,
      beds: 2,
      baths: 1,
      parking: 1,
      squareMeters: 80,
    } as import('../types/domain').Unit
    const result = patchApplicationStatus({
      application: app({ unitId: 'un-1' }),
      property,
      unit,
      viewings: [],
      slots: [],
      existingTenancies: [],
      request: { status: 'APPROVED', payment_provider: 'auto' },
      actor,
    })
    expect(result.status).toBe('SUCCESS')
    if (result.status === 'SUCCESS') {
      expect(result.application.stage).toBe('Awaiting Payment')
    }
  })

  it('Reject from Submitted lands on Rejected', () => {
    const next = applyWorkflowTransition(app(), 'rejected')
    expect(next.stage).toBe('Rejected')
    expect(next.workflowStatus).toBe('rejected')
  })

  it('Approve unlocks tenant tools only for the approved applicant', () => {
    const approved = applyWorkflowTransition(app(), 'conditionally_approved')
    const tenancies: Tenancy[] = []
    expect(tenantHasApprovedOccupancy([approved], tenancies, { id: 'u-applicant-a' })).toBe(true)
    expect(tenantHasApprovedOccupancy([approved], tenancies, { id: 'u-applicant-b' })).toBe(false)
  })
})

// ── P0-1 (R4): Approve stage machine on normalized / create-your-own apps ──
const STAFF_ACTOR = {
  userId: 'u-staff',
  role: 'client_admin' as const,
  agencyId: 'ag-1',
  permissions: STAFF_PERMS,
}

function mkListing() {
  const property = {
    id: 'PR-1',
    agencyId: 'ag-1',
    landlordId: 'u-landlord',
    agentId: null,
    unitId: 'un-1',
    title: 'QA listing',
    type: 'Apartment',
    status: 'Published',
    listingMode: 'rent',
    rent: 18500,
    price: null,
    city: 'Cape Town',
    suburb: 'CBD',
    beds: 2,
    baths: 1,
    parking: 1,
    area: 80,
    amenities: [],
    images: [],
    featured: false,
    createdAt: '2026-09-01',
  } as import('../types/domain').PropertyAsset
  const unit = {
    id: 'un-1',
    buildingId: 'bld-1',
    unitNumber: '1',
    statusKey: 'PUBLISHED',
    listingType: 'rent',
    rent: 18500,
    beds: 2,
    baths: 1,
    parking: 1,
    squareMeters: 80,
  } as import('../types/domain').Unit
  return { property, unit }
}

function approveFrom(stage: string, workflowStatus?: string) {
  const { property, unit } = mkListing()
  return patchApplicationStatus({
    application: app({ stage, ...(workflowStatus ? { workflowStatus } : {}) }),
    property,
    unit,
    viewings: [],
    slots: [],
    existingTenancies: [],
    request: { status: 'APPROVED', payment_provider: 'auto' },
    actor: STAFF_ACTOR,
  })
}

describe('P0-1 (R4): Approve works on every real application shape', () => {
  it('Approve succeeds from engine label "Application started" (the E2E #4 error)', () => {
    const result = approveFrom('Application started', 'application_started')
    expect(result.status).toBe('SUCCESS')
    if (result.status === 'SUCCESS') expect(result.application.stage).toBe('Awaiting Payment')
  })

  it('Approve succeeds from "Documents Pending" (fresh create-your-own submit)', () => {
    const result = approveFrom('Documents Pending')
    expect(result.status).toBe('SUCCESS')
  })

  it('normalized legacy stages keep their transitions after engine relabel', () => {
    for (const stage of ['Documents requested', 'Documents uploaded', 'Agent review', 'Credit check']) {
      expect(approveFrom(stage).status, stage).toBe('SUCCESS')
    }
  })

  it('guided error copy tells staff what to do next instead of raw engine text', () => {
    const copy = guidedTransitionError({
      status: 'ERROR',
      httpStatus: 422,
      error: 'Cannot transition from Blocked to APPROVED',
      code: 'INVALID_TRANSITION',
    })
    expect(copy).toContain('lifecycle panel')
  })

  it('applicant can submit their own started application without applications.review', () => {
    const started = app({ stage: 'Application started', workflowStatus: 'application_started' })
    const tenantPerms = ['portal.tenant'] as import('../types/domain').Permission[]
    const actions = buildApplicantApplicationActions({ application: started, permissions: tenantPerms })
    expect(actions.some((a) => a.key === 'SUBMIT_APPLICATION')).toBe(true)
    const submitted = applyWorkflowTransition(started, 'application_submitted')
    expect(submitted.workflowStatus).toBe('application_submitted')
    expect(submitted.stage).toBe('Application submitted')
  })
})
