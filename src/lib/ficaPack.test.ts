import { describe, expect, it } from 'vitest'
import type { Application, ApplicationDocument } from '../types/domain'
import {
  applyWorkflowTransition,
  getAvailableTransitions,
  normalizeApplication,
} from './applicationWorkflow'
import { buildDocumentChecklist } from './workflow'
import {
  FICA_PACK_KEYS,
  ficaPackGaps,
  ficaPackSoftGate,
  ficaPackSoftGateMessage,
  isFicaPackVerified,
  isFicaSoftGatedAction,
} from './ficaPack'
import { patchApplicationStatus } from './api/applicationStatusApi'

function rentalApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'APP-FICA-1',
    agencyId: 'AG-1',
    propertyId: 'P-1',
    agentId: 'U-1',
    applicantUserId: null,
    applicantName: 'Fica Tester',
    email: 'fica@test.example',
    phone: '+27 00 000 0000',
    type: 'Rental',
    stage: 'Documents Submitted',
    progress: 35,
    income: 40_000,
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

function withPackStatus(
  status: ApplicationDocument['status'],
  keys: string[] = [...FICA_PACK_KEYS],
): ApplicationDocument[] {
  return buildDocumentChecklist('Rental').map((d) =>
    keys.includes(d.key) ? { ...d, status } : { ...d, status: 'uploaded' as const },
  )
}

describe('DQ-C2 FICA pack Mode A', () => {
  it('reports gaps until id + address + fica are verified', () => {
    const docs = withPackStatus('uploaded')
    expect(isFicaPackVerified(docs)).toBe(false)
    expect(ficaPackGaps(docs)).toEqual(['id', 'address', 'fica'])
    expect(ficaPackSoftGateMessage(docs)).toMatch(/blocked until staff verify/i)
    expect(ficaPackSoftGate({ documents: docs })).toMatch(/blocked/i)

    const verified = withPackStatus('verified')
    expect(isFicaPackVerified(verified)).toBe(true)
    expect(ficaPackGaps(verified)).toEqual([])
    expect(ficaPackSoftGate({ documents: verified })).toBe(true)
  })

  it('START_FICA / fica_verification does NOT invent verified id or fica', () => {
    let app = normalizeApplication(
      rentalApp({
        workflowStatus: 'documents_uploaded',
        documents: withPackStatus('uploaded'),
      }),
    )
    app = applyWorkflowTransition(app, 'fica_verification')
    expect(app.workflowStatus).toBe('fica_verification')
    const id = app.documents.find((d) => d.key === 'id')
    const address = app.documents.find((d) => d.key === 'address')
    const fica = app.documents.find((d) => d.key === 'fica')
    expect(id?.status).toBe('uploaded')
    expect(address?.status).toBe('uploaded')
    expect(fica?.status).toBe('uploaded')
    expect(isFicaPackVerified(app.documents)).toBe(false)
  })

  it('soft-gates GENERATE_LEASE until FICA pack is staff-verified', () => {
    const incomplete = normalizeApplication(
      rentalApp({
        workflowStatus: 'conditionally_approved',
        documents: withPackStatus('uploaded'),
      }),
    )
    const blocked = getAvailableTransitions(incomplete, ['applications.review'])
    expect(blocked.some((t) => t.actionKey === 'GENERATE_LEASE')).toBe(false)

    const ready = normalizeApplication(
      rentalApp({
        workflowStatus: 'conditionally_approved',
        documents: withPackStatus('verified'),
      }),
    )
    const open = getAvailableTransitions(ready, ['applications.review'])
    expect(open.some((t) => t.actionKey === 'GENERATE_LEASE')).toBe(true)
  })

  it('soft-gates SCHEDULE_MOVE_IN and ACTIVATE_TENANCY on incomplete pack', () => {
    const moveIn = normalizeApplication(
      rentalApp({
        workflowStatus: 'rent_verified',
        documents: withPackStatus('uploaded'),
      }),
    )
    expect(
      getAvailableTransitions(moveIn, ['applications.review']).some(
        (t) => t.actionKey === 'SCHEDULE_MOVE_IN',
      ),
    ).toBe(false)

    const activate = normalizeApplication(
      rentalApp({
        workflowStatus: 'keys_handed_over',
        documents: withPackStatus('uploaded'),
      }),
    )
    expect(
      getAvailableTransitions(activate, ['applications.review']).some(
        (t) => t.actionKey === 'ACTIVATE_TENANCY',
      ),
    ).toBe(false)

    expect(isFicaSoftGatedAction('GENERATE_LEASE')).toBe(true)
    expect(isFicaSoftGatedAction('SCHEDULE_MOVE_IN')).toBe(true)
    expect(isFicaSoftGatedAction('ACTIVATE_TENANCY')).toBe(true)
  })

  it('APPROVED path refuses lease invent when FICA pack is incomplete', () => {
    const actor = {
      userId: 'u-staff',
      role: 'client_admin' as const,
      agencyId: 'AG-1',
      permissions: ['applications.review' as const],
    }
    const property = {
      id: 'P-1',
      agencyId: 'AG-1',
      landlordId: 'u-ll',
      agentId: null,
      unitId: 'un-1',
      title: 'Unit',
      type: 'Apartment',
      status: 'Published',
      listingMode: 'rent',
      rent: 10000,
      price: null,
      city: 'Cape Town',
      suburb: 'CBD',
      beds: 1,
      baths: 1,
      parking: 0,
      area: 40,
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
      rent: 10000,
      beds: 1,
      baths: 1,
      parking: 0,
      squareMeters: 40,
    } as import('../types/domain').Unit

    const blocked = patchApplicationStatus({
      application: rentalApp({
        unitId: 'un-1',
        stage: 'Application submitted',
        workflowStatus: 'application_submitted',
        documents: withPackStatus('uploaded'),
      }),
      property,
      unit,
      viewings: [],
      slots: [],
      existingTenancies: [],
      request: { status: 'APPROVED', payment_provider: 'auto' },
      actor,
    })
    expect(blocked.status).toBe('ERROR')
    if (blocked.status === 'ERROR') {
      expect(blocked.code).toBe('FICA_PACK_INCOMPLETE')
      expect(blocked.error).toMatch(/blocked until staff verify/i)
    }

    const ok = patchApplicationStatus({
      application: rentalApp({
        unitId: 'un-1',
        stage: 'Application submitted',
        workflowStatus: 'application_submitted',
        documents: withPackStatus('verified'),
      }),
      property,
      unit,
      viewings: [],
      slots: [],
      existingTenancies: [],
      request: { status: 'APPROVED', payment_provider: 'auto' },
      actor,
    })
    expect(ok.status).toBe('SUCCESS')
    if (ok.status === 'SUCCESS') {
      // Must not invent verified status beyond what staff already set
      expect(ok.application.documents.find((d) => d.key === 'id')?.status).toBe('verified')
      expect(ok.application.documents.find((d) => d.key === 'payslips')?.status).toBe('uploaded')
    }
  })
})
