/**
 * Real screening pipeline types (roadmap Step 4).
 * Async bureau status is structured — not free-text badges alone.
 */

export type ScreeningAsyncStatus =
  | 'pending'
  | 'in_progress'
  | 'passed'
  | 'failed'
  | 'manual_override'

/** Legacy Application.creditCheck labels kept in sync for older UI/seed. */
export type CreditCheckLabel =
  | 'Not Started'
  | 'Consent Received'
  | 'In Progress'
  | 'Passed'
  | 'Failed'
  | 'Pending'

export type ScreeningConsentMethod = 'document' | 'checkbox' | 'portal' | 'staff'

export type ScreeningConsent = {
  granted: boolean
  grantedAt?: string
  /** Applicant user id when known; otherwise display name / 'applicant'. */
  grantedBy?: string | null
  method?: ScreeningConsentMethod
  note?: string
}

export type ScreeningOverrideAudit = {
  byUserId: string
  byName: string
  at: string
  reason: string
  previousStatus: ScreeningAsyncStatus
  /** Status after override (usually passed | failed | manual_override). */
  newStatus: ScreeningAsyncStatus
}

export type ScreeningResult = {
  status: ScreeningAsyncStatus
  /** Provider id that produced or owns this check. */
  provider?: string
  externalReference?: string | null
  score?: number | null
  band?: string | null
  summary?: string | null
  checkedAt?: string | null
  /** Latest override (also appended to overrideHistory). */
  override?: ScreeningOverrideAudit | null
  overrideHistory?: ScreeningOverrideAudit[]
}

/** Inbound vendor webhook shape (TPN-like). No live credentials. */
export type ScreeningWebhookPayload = {
  applicationId: string
  externalReference?: string
  status: 'passed' | 'failed' | 'in_progress' | 'pending'
  score?: number | null
  band?: string | null
  summary?: string | null
  checkedAt?: string
  /** Opaque vendor payload — stored summary only, not full bureau dump. */
  providerEventId?: string
}

export type ScreeningSubject = {
  applicationId: string
  agencyId: string
  applicantName: string
  idNumberOrPassport?: string
  email: string
  phone?: string
  income?: number
}

export type ScreeningStartRequest = {
  subject: ScreeningSubject
  consent: ScreeningConsent
  actorUserId?: string | null
  actorName?: string | null
}

export type ScreeningStartResponse = {
  ok: boolean
  status: ScreeningAsyncStatus
  provider: string
  externalReference?: string | null
  summary?: string | null
  error?: string
}

export type ScreeningProvider = {
  readonly id: string
  /** True when this provider can initiate a live bureau call. */
  readonly live: boolean
  startCheck(request: ScreeningStartRequest): Promise<ScreeningStartResponse>
  /**
   * Map a vendor webhook into a structured result patch.
   * Implementations must not invent credentials or call out.
   */
  parseWebhook(payload: ScreeningWebhookPayload): {
    status: ScreeningAsyncStatus
    externalReference?: string | null
    score?: number | null
    band?: string | null
    summary?: string | null
    checkedAt?: string | null
  }
}
