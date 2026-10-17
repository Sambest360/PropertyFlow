import { describe, expect, it } from 'vitest'
import type { Application } from '../../types/domain'
import { buildDocumentChecklist } from '../workflow'
import { applyWorkflowTransition, getAvailableTransitions, normalizeApplication } from '../applicationWorkflow'
import { patchApplicationStatus } from '../api/applicationStatusApi'
import {
  MockDevScreeningProvider,
  TpnScreeningProviderPlaceholder,
  applicationPassesScreeningSoftGate,
  captureAdultCreditCheckConsents,
  captureScreeningConsent,
  creditCheckLabelFromScreening,
  hasScreeningConsent,
  ingestScreeningWebhook,
  isScreeningClearedForLease,
  isScreeningSoftGatedAction,
  overrideScreening,
  resolveScreening,
  screeningProviderFromEnv,
  screeningSoftGate,
  SCREENING_MODE_A_COPY,
  startScreening,
} from './index'

const PRIMARY_ID = '9001015800084'

function withPrimaryAdultConsent(app: Application): Application {
  return captureAdultCreditCheckConsents(
    { ...app, idNumberOrPassport: PRIMARY_ID },
    {
      adults: [{ name: app.applicantName, idNumber: PRIMARY_ID, signatureText: app.applicantName }],
    },
  )
}

function rentalApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'APP-SCR-1',
    agencyId: 'AG-1',
    propertyId: 'P-1',
    agentId: 'U-1',
    applicantUserId: 'U-TENANT',
    applicantName: 'Amy Visser',
    email: 'amy@media.com',
    phone: '+27 73 880 5511',
    type: 'Rental',
    stage: 'Documents Pending',
    progress: 20,
    income: 45_000,
    employment: 'Employed',
    creditCheck: 'Not Started',
    creditConsent: false,
    documents: buildDocumentChecklist('Rental'),
    docs: [],
    viewingSlotId: null,
    notes: '',
    submittedAt: '2026-07-20',
    updatedAt: '2026-07-20',
    ...overrides,
  }
}

describe('screening pipeline', () => {
  it('blocks start without consent', async () => {
    const app = rentalApp()
    const result = await startScreening(app)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/consent/i)
  })

  it('captures consent then starts mock screening as in_progress', async () => {
    let app = withPrimaryAdultConsent(
      captureScreeningConsent(rentalApp(), {
        method: 'portal',
        grantedBy: 'U-TENANT',
      }),
    )
    expect(hasScreeningConsent(app)).toBe(true)
    expect(app.creditConsent).toBe(true)
    expect(app.creditCheck).toBe('Consent Received')
    expect(app.screeningConsent?.granted).toBe(true)

    const started = await startScreening(app, { provider: new MockDevScreeningProvider() })
    expect(started.ok).toBe(true)
    if (!started.ok) return
    app = started.application
    expect(app.screening?.status).toBe('in_progress')
    expect(app.creditCheck).toBe('In Progress')
    expect(app.screening?.provider).toBe('mock')
    expect(app.workflowEvents?.some((e) => e.actionKey === 'SCREENING_STARTED')).toBe(true)
  })

  it('ingests webhook result without inventing credentials', () => {
    let app = captureScreeningConsent(rentalApp(), { method: 'document', grantedBy: 'Amy' })
    const ingested = ingestScreeningWebhook(
      { ...app, screening: { status: 'in_progress', provider: 'mock' } },
      {
        applicationId: app.id,
        status: 'passed',
        score: 720,
        band: 'Good',
        summary: 'Mock bureau pass',
        externalReference: 'MOCK-99',
      },
      new MockDevScreeningProvider(),
    )
    expect(ingested.ok).toBe(true)
    if (!ingested.ok) return
    app = ingested.application
    expect(app.screening?.status).toBe('passed')
    expect(app.creditCheck).toBe('Passed')
    expect(app.screening?.score).toBe(720)
    expect(app.screening?.band).toBe('Good')
  })

  it('requires audited reason for agent override', () => {
    const app = captureScreeningConsent(rentalApp(), { method: 'staff', grantedBy: 'agent-1' })
    const denied = overrideScreening(app, {
      newStatus: 'passed',
      reason: '   ',
      byUserId: 'agent-1',
      byName: 'Agent One',
    })
    expect(denied.ok).toBe(false)

    const ok = overrideScreening(app, {
      newStatus: 'manual_override',
      reason: 'Landlord waived bureau after prior tenancy history',
      byUserId: 'agent-1',
      byName: 'Agent One',
    })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.application.screening?.status).toBe('manual_override')
    expect(ok.application.screening?.override?.reason).toMatch(/waived/)
    expect(ok.application.screening?.overrideHistory).toHaveLength(1)
    expect(ok.application.workflowEvents?.some((e) => e.actionKey === 'SCREENING_OVERRIDE')).toBe(
      true,
    )
  })

  it('approve workflow transition does not invent Passed', () => {
    let app = normalizeApplication(
      rentalApp({
        creditConsent: true,
        creditCheck: 'Consent Received',
        screeningConsent: { granted: true, method: 'portal' },
        screening: { status: 'pending', provider: 'mock' },
        workflowStatus: 'agent_review',
        documents: buildDocumentChecklist('Rental').map((d) => ({
          ...d,
          status: 'verified' as const,
        })),
      }),
    )
    // Soft-gate hides approve until passed|manual_override
    expect(
      getAvailableTransitions(app, ['applications.review']).some((a) => a.actionKey === 'AGENT_APPROVE'),
    ).toBe(false)
    // Direct status jump (legacy helper) still must not invent Passed
    app = applyWorkflowTransition(app, 'conditionally_approved')
    expect(app.workflowStatus).toBe('conditionally_approved')
    expect(app.creditCheck).not.toBe('Passed')
    expect(resolveScreening(app).status).toBe('pending')
  })

  it('credit_check stage marks in_progress when consent present', () => {
    let app = normalizeApplication(
      rentalApp({
        creditConsent: true,
        screeningConsent: { granted: true, method: 'document' },
        workflowStatus: 'reference_checks',
        documents: buildDocumentChecklist('Rental').map((d) => ({
          ...d,
          status: 'verified' as const,
        })),
      }),
    )
    app = applyWorkflowTransition(app, 'credit_check')
    expect(app.workflowStatus).toBe('credit_check')
    expect(app.creditCheck).toBe('In Progress')
    expect(app.screening?.status).toBe('in_progress')
  })

  it('START_CREDIT_CHECK is guarded without consent', () => {
    const app = normalizeApplication(
      rentalApp({
        creditConsent: false,
        workflowStatus: 'reference_checks',
        documents: buildDocumentChecklist('Rental').map((d) => ({
          ...d,
          status: 'verified' as const,
        })),
      }),
    )
    const actions = getAvailableTransitions(app, ['applications.review'])
    const start = actions.find((a) => a.actionKey === 'START_CREDIT_CHECK')
    // Guarded transitions are filtered out or present with guard failure via getAvailableTransitions
    // getAvailableTransitions typically filters by guard — ensure start is absent or blocked
    expect(start).toBeUndefined()
  })

  it('maps async status to legacy creditCheck labels', () => {
    expect(creditCheckLabelFromScreening('pending', false)).toBe('Not Started')
    expect(creditCheckLabelFromScreening('pending', true)).toBe('Consent Received')
    expect(creditCheckLabelFromScreening('in_progress', true)).toBe('In Progress')
    expect(creditCheckLabelFromScreening('passed', true)).toBe('Passed')
    expect(creditCheckLabelFromScreening('failed', true)).toBe('Failed')
    expect(creditCheckLabelFromScreening('manual_override', true)).toBe('Passed')
  })

  it('TPN placeholder refuses without partner keys', async () => {
    const tpn = new TpnScreeningProviderPlaceholder({})
    const app = captureScreeningConsent(rentalApp(), { method: 'portal' })
    const result = await tpn.startCheck({
      subject: {
        applicationId: app.id,
        agencyId: app.agencyId,
        applicantName: app.applicantName,
        email: app.email,
      },
      consent: { granted: true },
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not configured|partner/i)
  })

  it('TPN placeholder refuses live call even when keys present (no invented HTTP)', async () => {
    const tpn = new TpnScreeningProviderPlaceholder({
      apiKey: 'partner-key',
      apiUrl: 'https://example.invalid/tpn',
    })
    expect(tpn.configured).toBe(true)
    const result = await tpn.startCheck({
      subject: {
        applicationId: 'APP-1',
        agencyId: 'AG-1',
        applicantName: 'Test',
        email: 't@example.com',
      },
      consent: { granted: true },
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/placeholder|not implemented/i)
  })

  it('screeningProviderFromEnv defaults to mock', () => {
    const p = screeningProviderFromEnv({ SCREENING_PROVIDER: undefined })
    expect(p.id).toBe('mock')
    const tpn = screeningProviderFromEnv({ SCREENING_PROVIDER: 'tpn' })
    expect(tpn.id).toBe('tpn')
  })
})


describe('DQ-C3 screening soft-gate Mode A', () => {
  const verifiedDocs = () =>
    buildDocumentChecklist('Rental').map((d) => ({ ...d, status: 'verified' as const }))

  it('honesty copy denies live TPN', () => {
    expect(SCREENING_MODE_A_COPY).toMatch(/not live TPN/i)
    expect(SCREENING_MODE_A_COPY).toMatch(/mock or manual/i)
  })

  it('clears soft-gate only for passed or manual_override', () => {
    const pending = rentalApp({ screening: { status: 'pending', provider: 'mock' } })
    expect(isScreeningClearedForLease(pending)).toBe(false)
    expect(applicationPassesScreeningSoftGate(pending)).toBe(false)
    expect(screeningSoftGate(pending)).toMatch(/blocked until screening/i)

    const failed = rentalApp({ screening: { status: 'failed', provider: 'mock' } })
    expect(isScreeningClearedForLease(failed)).toBe(false)

    const passed = rentalApp({ screening: { status: 'passed', provider: 'mock' } })
    expect(isScreeningClearedForLease(passed)).toBe(true)
    expect(screeningSoftGate(passed)).toBe(true)

    const overridden = rentalApp({ screening: { status: 'manual_override', provider: 'manual' } })
    expect(isScreeningClearedForLease(overridden)).toBe(true)

    // Purchase paths are not gated on tenant TPN/manual screening
    expect(
      applicationPassesScreeningSoftGate(
        rentalApp({ type: 'Purchase', screening: { status: 'pending', provider: 'mock' } }),
      ),
    ).toBe(true)
  })

  it('soft-gates AGENT_APPROVE / GENERATE_LEASE until screening cleared', () => {
    const incomplete = normalizeApplication(
      rentalApp({
        workflowStatus: 'conditionally_approved',
        documents: verifiedDocs(),
        screening: { status: 'pending', provider: 'mock' },
        creditConsent: true,
      }),
    )
    const blocked = getAvailableTransitions(incomplete, ['applications.review'])
    expect(blocked.some((t) => t.actionKey === 'GENERATE_LEASE')).toBe(false)

    const ready = normalizeApplication(
      rentalApp({
        workflowStatus: 'conditionally_approved',
        documents: verifiedDocs(),
        screening: { status: 'manual_override', provider: 'manual' },
        creditCheck: 'Passed',
        creditConsent: true,
      }),
    )
    const open = getAvailableTransitions(ready, ['applications.review'])
    expect(open.some((t) => t.actionKey === 'GENERATE_LEASE')).toBe(true)

    const review = normalizeApplication(
      rentalApp({
        workflowStatus: 'agent_review',
        documents: verifiedDocs(),
        screening: { status: 'in_progress', provider: 'mock' },
        creditConsent: true,
      }),
    )
    expect(
      getAvailableTransitions(review, ['applications.review']).some(
        (t) => t.actionKey === 'AGENT_APPROVE',
      ),
    ).toBe(false)

    expect(isScreeningSoftGatedAction('AGENT_APPROVE')).toBe(true)
    expect(isScreeningSoftGatedAction('GENERATE_LEASE')).toBe(true)
    expect(isScreeningSoftGatedAction('SCHEDULE_MOVE_IN')).toBe(true)
  })

  it('START_CREDIT_CHECK copy clarifies mock/manual not live bureau', () => {
    const app = normalizeApplication(
      withPrimaryAdultConsent(
        rentalApp({
          creditConsent: true,
          screeningConsent: { granted: true, method: 'portal' },
          workflowStatus: 'reference_checks',
          documents: verifiedDocs(),
        }),
      ),
    )
    const start = getAvailableTransitions(app, ['applications.review']).find(
      (a) => a.actionKey === 'START_CREDIT_CHECK',
    )
    expect(start).toBeDefined()
    expect(start!.label).toMatch(/mock\/manual/i)
    expect(start!.hint).toMatch(/not live TPN/i)
  })

  it('manual override accepts optional score and external ref', () => {
    const app = captureScreeningConsent(rentalApp(), { method: 'staff', grantedBy: 'agent-1' })
    const ok = overrideScreening(app, {
      newStatus: 'manual_override',
      reason: 'Prior landlord reference on file',
      byUserId: 'agent-1',
      byName: 'Agent One',
      score: 655,
      externalReference: 'STAFF-REF-42',
    })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.application.screening?.score).toBe(655)
    expect(ok.application.screening?.externalReference).toBe('STAFF-REF-42')
    expect(isScreeningClearedForLease(ok.application)).toBe(true)
  })

  it('APPROVED path soft-gates until screening passed or manual_override', () => {
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
    } as import('../../types/domain').PropertyAsset
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
    } as import('../../types/domain').Unit

    const blocked = patchApplicationStatus({
      application: rentalApp({
        unitId: 'un-1',
        stage: 'Application submitted',
        workflowStatus: 'application_submitted',
        documents: verifiedDocs(),
        screening: { status: 'pending', provider: 'mock' },
        creditConsent: true,
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
      expect(blocked.code).toBe('SCREENING_INCOMPLETE')
      expect(blocked.error).toMatch(/not live TPN/i)
    }

    const ok = patchApplicationStatus({
      application: rentalApp({
        unitId: 'un-1',
        stage: 'Application submitted',
        workflowStatus: 'application_submitted',
        documents: verifiedDocs(),
        screening: { status: 'passed', provider: 'mock' },
        creditCheck: 'Passed',
        creditConsent: true,
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
      // Invent-kill: approve must not invent Passed from a non-cleared state —
      // here screening was already passed and must stay as-is.
      expect(ok.application.screening?.status).toBe('passed')
      expect(ok.application.creditCheck).toBe('Passed')
    }
  })
})
