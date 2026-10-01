/**
 * In-app screening pipeline: consent → start → ingest → audited override.
 * Keeps Application.creditCheck / creditConsent in sync for legacy surfaces.
 */

import type { Application } from '../../types/domain'
import { appendWorkflowEvent } from '../applicationWorkflowEvents'
import { MockDevScreeningProvider } from './providers'
import type { ScreeningProvider } from './types'
import type {
  CreditCheckLabel,
  ScreeningAsyncStatus,
  ScreeningConsent,
  ScreeningConsentMethod,
  ScreeningOverrideAudit,
  ScreeningResult,
  ScreeningWebhookPayload,
} from './types'

export function emptyScreeningResult(provider = 'mock'): ScreeningResult {
  return {
    status: 'pending',
    provider,
    externalReference: null,
    score: null,
    band: null,
    summary: null,
    checkedAt: null,
    override: null,
    overrideHistory: [],
  }
}

export function creditCheckLabelFromScreening(
  status: ScreeningAsyncStatus,
  consentGranted: boolean,
): CreditCheckLabel {
  switch (status) {
    case 'in_progress':
      return 'In Progress'
    case 'passed':
      return 'Passed'
    case 'failed':
      return 'Failed'
    case 'manual_override':
      return 'Passed'
    case 'pending':
    default:
      if (consentGranted) return 'Consent Received'
      return 'Not Started'
  }
}

export function screeningStatusLabel(status: ScreeningAsyncStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'in_progress':
      return 'In progress'
    case 'passed':
      return 'Passed'
    case 'failed':
      return 'Failed'
    case 'manual_override':
      return 'Manual override'
    default:
      return status
  }
}

export function resolveScreening(app: Application): ScreeningResult {
  if (app.screening) return app.screening
  // Derive from legacy creditCheck when screening blob is absent.
  const legacy = app.creditCheck
  let status: ScreeningAsyncStatus = 'pending'
  if (legacy === 'In Progress') status = 'in_progress'
  else if (legacy === 'Passed') status = 'passed'
  else if (legacy === 'Failed') status = 'failed'
  else status = 'pending'
  return {
    ...emptyScreeningResult(),
    status,
    summary: legacy && legacy !== 'Not Started' ? `Legacy credit check: ${legacy}` : null,
  }
}

export function resolveConsent(app: Application): ScreeningConsent {
  if (app.screeningConsent) return app.screeningConsent
  return {
    granted: Boolean(app.creditConsent),
    grantedAt: app.creditConsent ? app.updatedAt : undefined,
    method: app.creditConsent ? 'document' : undefined,
  }
}

export function hasScreeningConsent(app: Application): boolean {
  return resolveConsent(app).granted === true
}

function syncCompat(app: Application, screening: ScreeningResult, consent: ScreeningConsent): Application {
  return {
    ...app,
    screening,
    screeningConsent: consent,
    creditConsent: consent.granted,
    creditCheck: creditCheckLabelFromScreening(screening.status, consent.granted),
  }
}

export function captureScreeningConsent(
  app: Application,
  input: {
    grantedBy?: string | null
    method?: ScreeningConsentMethod
    note?: string
    at?: string
  },
): Application {
  const at = input.at ?? new Date().toISOString()
  const consent: ScreeningConsent = {
    granted: true,
    grantedAt: at,
    grantedBy: input.grantedBy ?? null,
    method: input.method ?? 'portal',
    note: input.note,
  }
  const screening = resolveScreening(app)
  const nextStatus: ScreeningAsyncStatus =
    screening.status === 'pending' || screening.status === 'in_progress'
      ? screening.status
      : screening.status
  // Consent alone does not pass screening.
  const nextScreening: ScreeningResult = {
    ...screening,
    status: nextStatus === 'passed' || nextStatus === 'failed' || nextStatus === 'manual_override'
      ? nextStatus
      : 'pending',
  }
  let updated = syncCompat(app, nextScreening, consent)
  updated = appendWorkflowEvent(updated, {
    stage: updated.workflowStatus ?? updated.stage,
    actionKey: 'SCREENING_CONSENT',
    actorUserId: input.grantedBy ?? null,
    actorName: input.grantedBy ?? 'Applicant',
    summary: `Credit-check consent captured (${consent.method ?? 'portal'})`,
    payload: { method: consent.method, grantedAt: at },
    at,
  })
  return { ...updated, updatedAt: at.slice(0, 10) }
}

export type StartScreeningResult =
  | { ok: true; application: Application }
  | { ok: false; error: string; application: Application }

export async function startScreening(
  app: Application,
  input: {
    actorUserId?: string | null
    actorName?: string | null
    provider?: ScreeningProvider
  } = {},
): Promise<StartScreeningResult> {
  const consent = resolveConsent(app)
  if (!consent.granted) {
    return {
      ok: false,
      error: 'POPIA credit-check consent is required before screening can start.',
      application: app,
    }
  }
  const screening = resolveScreening(app)
  if (screening.status === 'in_progress') {
    return { ok: true, application: syncCompat(app, screening, consent) }
  }
  if (screening.status === 'passed' || screening.status === 'manual_override') {
    return {
      ok: false,
      error: 'Screening already completed. Use a manual override to change the outcome.',
      application: app,
    }
  }

  const provider = input.provider ?? new MockDevScreeningProvider()
  const response = await provider.startCheck({
    subject: {
      applicationId: app.id,
      agencyId: app.agencyId,
      applicantName: app.applicantName,
      idNumberOrPassport: app.idNumberOrPassport,
      email: app.email,
      phone: app.phone,
      income: app.income,
    },
    consent,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
  })

  if (!response.ok) {
    return { ok: false, error: response.error ?? 'Screening provider refused to start.', application: app }
  }

  const at = new Date().toISOString()
  const nextScreening: ScreeningResult = {
    ...screening,
    status: response.status,
    provider: response.provider,
    externalReference: response.externalReference ?? null,
    summary: response.summary ?? screening.summary,
    checkedAt: null,
    override: screening.override ?? null,
  }
  let updated = syncCompat(app, nextScreening, consent)
  updated = appendWorkflowEvent(updated, {
    stage: 'credit_check',
    actionKey: 'SCREENING_STARTED',
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? 'Agency',
    summary: `Screening started via ${response.provider}`,
    payload: {
      provider: response.provider,
      externalReference: response.externalReference,
      status: response.status,
    },
    at,
  })
  return { ok: true, application: { ...updated, updatedAt: at.slice(0, 10) } }
}

export function ingestScreeningWebhook(
  app: Application,
  payload: ScreeningWebhookPayload,
  provider?: ScreeningProvider,
): StartScreeningResult {
  if (payload.applicationId !== app.id) {
    return { ok: false, error: 'Webhook applicationId does not match.', application: app }
  }
  const consent = resolveConsent(app)
  if (!consent.granted) {
    return {
      ok: false,
      error: 'Cannot ingest screening result without consent on file.',
      application: app,
    }
  }
  const adapter = provider ?? new MockDevScreeningProvider()
  const parsed = adapter.parseWebhook(payload)
  const screening = resolveScreening(app)
  const at = parsed.checkedAt ?? new Date().toISOString()
  const nextScreening: ScreeningResult = {
    ...screening,
    status: parsed.status,
    provider: adapter.id,
    externalReference: parsed.externalReference ?? screening.externalReference ?? null,
    score: parsed.score ?? null,
    band: parsed.band ?? null,
    summary: parsed.summary ?? screening.summary,
    checkedAt: at,
  }
  let updated = syncCompat(app, nextScreening, consent)
  updated = appendWorkflowEvent(updated, {
    stage: 'credit_check',
    actionKey: 'SCREENING_RESULT',
    actorName: adapter.id,
    summary: `Screening result ingested: ${parsed.status}`,
    payload: {
      provider: adapter.id,
      status: parsed.status,
      score: parsed.score,
      band: parsed.band,
      externalReference: parsed.externalReference,
    },
    at,
  })
  return { ok: true, application: { ...updated, updatedAt: at.slice(0, 10) } }
}

export function overrideScreening(
  app: Application,
  input: {
    newStatus: Extract<ScreeningAsyncStatus, 'passed' | 'failed' | 'manual_override'>
    reason: string
    byUserId: string
    byName: string
    at?: string
  },
): StartScreeningResult {
  const reason = input.reason.trim()
  if (!reason) {
    return { ok: false, error: 'Override reason is required for audit.', application: app }
  }
  const consent = resolveConsent(app)
  const screening = resolveScreening(app)
  const at = input.at ?? new Date().toISOString()
  const audit: ScreeningOverrideAudit = {
    byUserId: input.byUserId,
    byName: input.byName,
    at,
    reason,
    previousStatus: screening.status,
    newStatus: input.newStatus,
  }
  const nextScreening: ScreeningResult = {
    ...screening,
    status: input.newStatus,
    provider: screening.provider ?? 'manual',
    summary: `Manual override → ${input.newStatus}: ${reason}`,
    checkedAt: at,
    override: audit,
    overrideHistory: [...(screening.overrideHistory ?? []), audit],
  }
  let updated = syncCompat(app, nextScreening, consent)
  updated = appendWorkflowEvent(updated, {
    stage: updated.workflowStatus ?? updated.stage,
    actionKey: 'SCREENING_OVERRIDE',
    actorUserId: input.byUserId,
    actorName: input.byName,
    summary: `Screening override by ${input.byName}: ${screening.status} → ${input.newStatus}`,
    payload: { ...audit },
    at,
  })
  return { ok: true, application: { ...updated, updatedAt: at.slice(0, 10) } }
}

/** Apply credit_check workflow entry without inventing a Passed outcome. */
export function markScreeningInProgressOnWorkflow(app: Application): Application {
  const consent = resolveConsent(app)
  const screening = resolveScreening(app)
  if (screening.status === 'passed' || screening.status === 'failed' || screening.status === 'manual_override') {
    return syncCompat(app, screening, consent)
  }
  const next: ScreeningResult = {
    ...screening,
    status: consent.granted ? 'in_progress' : 'pending',
    summary:
      screening.summary ??
      (consent.granted ? 'Credit check stage entered — awaiting bureau result.' : 'Consent required before bureau check.'),
  }
  return syncCompat(app, next, consent)
}
