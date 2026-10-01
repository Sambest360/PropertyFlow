import { describe, expect, it } from 'vitest'
import type { Application } from '../../types/domain'
import { buildDocumentChecklist } from '../workflow'
import { applyWorkflowTransition, getAvailableTransitions, normalizeApplication } from '../applicationWorkflow'
import {
  MockDevScreeningProvider,
  TpnScreeningProviderPlaceholder,
  captureScreeningConsent,
  creditCheckLabelFromScreening,
  hasScreeningConsent,
  ingestScreeningWebhook,
  overrideScreening,
  resolveScreening,
  screeningProviderFromEnv,
  startScreening,
} from './index'

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
    let app = captureScreeningConsent(rentalApp(), {
      method: 'portal',
      grantedBy: 'U-TENANT',
    })
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
