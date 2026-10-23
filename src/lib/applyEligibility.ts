/**
 * Mandatory viewing before a rental application.
 * Pure rules — the server loader in server/applyEligibility.ts supplies the rows.
 */

export const VIEWING_REQUIRED = 'VIEWING_REQUIRED'
export const LOGIN_REQUIRED = 'LOGIN_REQUIRED'
export const ATTENDANCE_TOO_EARLY = 'ATTENDANCE_TOO_EARLY'
export const OVERRIDE_REASON_REQUIRED = 'OVERRIDE_REASON_REQUIRED'

export const OVERRIDE_TTL_DAYS = 14

export const OVERRIDE_REASON_CODES = [
  'VIRTUAL_VIEWING',
  'OUT_OF_TOWN',
  'REPEAT_TENANT',
  'OTHER',
] as const

export type OverrideReasonCode = (typeof OVERRIDE_REASON_CODES)[number]

export const OVERRIDE_REASON_LABELS: Record<OverrideReasonCode, string> = {
  VIRTUAL_VIEWING: 'Virtual viewing',
  OUT_OF_TOWN: 'Out of town',
  REPEAT_TENANT: 'Repeat tenant',
  OTHER: 'Other',
}

/** Unit status_config_key values that mean the unit has been let. */
export const LET_STATUS_KEYS = new Set(['RENTED', 'OCCUPIED', 'LET'])

/** Frontend roles that may create a NOT_LISTED application without a viewing. */
export const VIEWING_STAFF_ROLES = new Set([
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
])

export const AGENCY_ADMIN_ROLES = new Set(['super_admin', 'client_admin'])

export const ASSIGNED_AGENT_ROLES = new Set(['agent_admin', 'ground_agent', 'agent'])

/**
 * Frontend roles that may set the per-unit viewing-gate override
 * (units.require_viewing_to_apply). The viewing process is the agency's call,
 * so only agency staff may; landlords, tenants and contractors may not.
 */
export const UNIT_VIEWING_OVERRIDE_ROLES: ReadonlySet<string> = VIEWING_STAFF_ROLES

export function canSetUnitViewingOverride(role: string | null | undefined): boolean {
  return Boolean(role && UNIT_VIEWING_OVERRIDE_ROLES.has(role))
}

export type ViewingMode = 'IN_PERSON' | 'VIRTUAL'

export type ViewingEvidence = {
  kind: 'in_person' | 'virtual' | 'override'
  attendedAt: string | null
  reasonCode: string | null
  reasonText: string | null
}

export type CompletedBooking = {
  id: string
  unitId: string
  buildingId: string | null
  viewingMode: ViewingMode
  applicantId: string | null
  visitorEmail: string | null
  visitorPhone: string | null
  attendedAt: string | null
  /** users.id of the staff member who marked attendance (null = not marked). */
  attendedBy?: string | null
}

export type ApplyEligibility = {
  eligible: boolean
  reason: string
  bookingId: string | null
  overrideId: string | null
  viewingMode: ViewingMode | null
  attendedAt: string | null
  evidence: ViewingEvidence | null
}

export type EligibilityFacts = {
  authenticated: boolean
  applicationType: 'RENTAL' | 'PURCHASE'
  listingType: string
  actorRole: string | null
  unitRequire: boolean | null
  /** Undefined or null means the agency has not set the key (default off). */
  agencyRequire: boolean | null | undefined
  buildingViewingCounts: boolean
  mainApplicantCoversCoApplicants: boolean
  targetUnitId: string
  targetBuildingId: string | null
  applicantId: string | null
  applicantEmail: string | null
  applicantPhone: string | null
  coApplicantEmails: string[]
  completedBookings: CompletedBooking[]
  override: { id: string; reasonCode: string | null; reasonText: string | null } | null
}

export const BOOK_VIEWING_FIRST = 'Book and attend a viewing first'

const EMPTY: Pick<ApplyEligibility, 'bookingId' | 'overrideId' | 'viewingMode' | 'attendedAt' | 'evidence'> = {
  bookingId: null,
  overrideId: null,
  viewingMode: null,
  attendedAt: null,
  evidence: null,
}

export function normEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function normPhone(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

/**
 * The viewing gate is an opt-in, per-agency setting (default OFF).
 * A unit flag (true/false) overrides the agency; a NULL unit flag follows the
 * agency; a missing or null agency key means the gate is off.
 */
export function viewingRuleEnabled(
  unitRequire: boolean | null | undefined,
  agencyRequire: boolean | null | undefined,
): boolean {
  if (unitRequire === true) return true
  if (unitRequire === false) return false
  return agencyRequire === true
}

export function isLetStatus(statusKey: string | null | undefined): boolean {
  return LET_STATUS_KEYS.has(String(statusKey ?? '').toUpperCase())
}

export function coApplicantEmailsFromPayload(data: Record<string, unknown> | null | undefined): string[] {
  if (!data) return []
  const raw = data.coApplicantEmails ?? data.co_applicant_emails
  if (!Array.isArray(raw)) return []
  return raw.map((value) => (typeof value === 'string' ? normEmail(value) : '')).filter(Boolean)
}

function personMatch(
  booking: CompletedBooking,
  person: { id: string | null; email: string | null; phone: string | null },
): boolean {
  if (person.id && booking.applicantId && person.id === booking.applicantId) return true
  const email = normEmail(person.email)
  if (email && normEmail(booking.visitorEmail) === email) return true
  const phone = normPhone(person.phone)
  if (phone.length >= 8 && normPhone(booking.visitorPhone) === phone) return true
  return false
}

function bookingCoversUnit(booking: CompletedBooking, facts: EligibilityFacts): boolean {
  if (booking.unitId === facts.targetUnitId) return true
  return Boolean(
    facts.buildingViewingCounts &&
      facts.targetBuildingId &&
      booking.buildingId &&
      booking.buildingId === facts.targetBuildingId,
  )
}

function evidenceForBooking(booking: CompletedBooking): ViewingEvidence {
  return {
    kind: booking.viewingMode === 'VIRTUAL' ? 'virtual' : 'in_person',
    attendedAt: booking.attendedAt,
    reasonCode: null,
    reasonText: null,
  }
}

function evidenceForOverride(override: NonNullable<EligibilityFacts['override']>): ViewingEvidence {
  return {
    kind: 'override',
    attendedAt: null,
    reasonCode: override.reasonCode,
    reasonText: override.reasonText,
  }
}

export function evaluateApplyEligibility(facts: EligibilityFacts): ApplyEligibility {
  if (!facts.authenticated) {
    return { eligible: false, reason: LOGIN_REQUIRED, ...EMPTY }
  }
  const listing = facts.listingType.toUpperCase()
  if (facts.applicationType === 'PURCHASE' || listing === 'SALE') {
    return { eligible: true, reason: 'RULE_OFF', ...EMPTY }
  }
  if (listing === 'NOT_LISTED' && facts.actorRole && VIEWING_STAFF_ROLES.has(facts.actorRole)) {
    return { eligible: true, reason: 'RULE_OFF', ...EMPTY }
  }
  if (!viewingRuleEnabled(facts.unitRequire, facts.agencyRequire)) {
    return { eligible: true, reason: 'RULE_OFF', ...EMPTY }
  }

  const primary =
    facts.completedBookings.find(
      (booking) =>
        bookingCoversUnit(booking, facts) &&
        personMatch(booking, {
          id: facts.applicantId,
          email: facts.applicantEmail,
          phone: facts.applicantPhone,
        }),
    ) ?? null

  let coApplicantsOk = true
  if (!facts.mainApplicantCoversCoApplicants) {
    const mainEmail = normEmail(facts.applicantEmail)
    for (const email of facts.coApplicantEmails) {
      if (!email || email === mainEmail) continue
      const attended = facts.completedBookings.some(
        (booking) => bookingCoversUnit(booking, facts) && normEmail(booking.visitorEmail) === email,
      )
      if (!attended) coApplicantsOk = false
    }
  }

  if (primary && coApplicantsOk) {
    return {
      eligible: true,
      reason: 'ATTENDED',
      bookingId: primary.id,
      overrideId: null,
      viewingMode: primary.viewingMode,
      attendedAt: primary.attendedAt,
      evidence: evidenceForBooking(primary),
    }
  }
  if (facts.override) {
    return {
      eligible: true,
      reason: 'OVERRIDE',
      bookingId: null,
      overrideId: facts.override.id,
      viewingMode: null,
      attendedAt: null,
      evidence: evidenceForOverride(facts.override),
    }
  }
  return { eligible: false, reason: VIEWING_REQUIRED, ...EMPTY }
}

export function attendanceDecision(input: {
  actorRole: string
  actorUserUuid: string
  actorClientId: string | null
  bookingClientId: string
  bookingAgentId: string | null
  unitAgentId: string | null
  startsAt: Date
  now: Date
}): { ok: true } | { ok: false; status: number; code: string; message: string } {
  if (input.actorRole !== 'super_admin') {
    if (!input.actorClientId || input.actorClientId !== input.bookingClientId) {
      return {
        ok: false,
        status: 403,
        code: 'FORBIDDEN',
        message: 'An agent of another agency cannot mark this attendance',
      }
    }
  }
  const admin = AGENCY_ADMIN_ROLES.has(input.actorRole)
  const assigned =
    ASSIGNED_AGENT_ROLES.has(input.actorRole) &&
    (input.bookingAgentId === input.actorUserUuid ||
      (!input.bookingAgentId && input.unitAgentId === input.actorUserUuid))
  if (!admin && !assigned) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: 'Only the assigned agent or an agency admin can mark attendance',
    }
  }
  if (input.startsAt.getTime() > input.now.getTime()) {
    return {
      ok: false,
      status: 403,
      code: ATTENDANCE_TOO_EARLY,
      message: 'Attendance cannot be marked before the viewing starts',
    }
  }
  return { ok: true }
}

export function parseOverrideReason(body: {
  reasonCode?: unknown
  reasonText?: unknown
}): { reasonCode: OverrideReasonCode; reasonText: string } {
  const reasonCode = typeof body.reasonCode === 'string' ? body.reasonCode.trim() : ''
  const reasonText = typeof body.reasonText === 'string' ? body.reasonText.trim() : ''
  if (!OVERRIDE_REASON_CODES.includes(reasonCode as OverrideReasonCode) || !reasonText) {
    throw Object.assign(new Error('An override needs a reason code and a reason'), {
      status: 400,
      code: OVERRIDE_REASON_REQUIRED,
    })
  }
  return { reasonCode: reasonCode as OverrideReasonCode, reasonText }
}

export function formatViewingDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Johannesburg',
  }).format(date)
}

export function viewingEvidenceLabel(evidence: ViewingEvidence | null | undefined): string | null {
  if (!evidence) return null
  if (evidence.kind === 'virtual') return 'Virtual'
  if (evidence.kind === 'in_person') {
    const day = formatViewingDay(evidence.attendedAt)
    return day ? `Viewed in person ${day}` : 'Viewed in person'
  }
  const code = OVERRIDE_REASON_LABELS[evidence.reasonCode as OverrideReasonCode] ?? 'Override'
  const text = evidence.reasonText?.trim()
  return text ? `Override: ${code} – ${text}` : `Override: ${code}`
}

export function rentalApplyButton(
  eligibility: { eligible: boolean } | null,
  loading: boolean,
): { disabled: boolean; label: string; bookFirst: boolean } {
  if (loading || !eligibility) {
    return { disabled: true, label: 'Checking viewing…', bookFirst: false }
  }
  if (!eligibility.eligible) {
    return { disabled: true, label: BOOK_VIEWING_FIRST, bookFirst: true }
  }
  return { disabled: false, label: 'Submit full application', bookFirst: false }
}

/** Existing applications are not re-checked. Null ids keep the stored columns. */
export function viewingIdsForWrite(
  existing: boolean,
  evidence: { bookingId: string | null; overrideId: string | null } | null,
): { bookingId: string | null; overrideId: string | null } {
  if (existing || !evidence) return { bookingId: null, overrideId: null }
  return { bookingId: evidence.bookingId, overrideId: evidence.overrideId }
}

export function readViewingEvidence(metadata: unknown): ViewingEvidence | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const raw = (metadata as Record<string, unknown>).viewing_evidence
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const kind = row.kind
  if (kind !== 'in_person' && kind !== 'virtual' && kind !== 'override') return null
  return {
    kind,
    attendedAt: typeof row.attendedAt === 'string' ? row.attendedAt : null,
    reasonCode: typeof row.reasonCode === 'string' ? row.reasonCode : null,
    reasonText: typeof row.reasonText === 'string' ? row.reasonText : null,
  }
}

export function agencyViewingSettingsFromJson(settings: unknown): {
  requireViewingToApply?: boolean
  buildingViewingCountsForAllUnits?: boolean
  mainApplicantViewingCoversCoApplicants?: boolean
  applicationJourney?: import('./journey/types.js').AgencyJourneyOverride
} {
  const raw = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : {}
  const out: ReturnType<typeof agencyViewingSettingsFromJson> = {}
  if (typeof raw.requireViewingToApply === 'boolean') out.requireViewingToApply = raw.requireViewingToApply
  if (typeof raw.buildingViewingCountsForAllUnits === 'boolean') {
    out.buildingViewingCountsForAllUnits = raw.buildingViewingCountsForAllUnits
  }
  if (typeof raw.mainApplicantViewingCoversCoApplicants === 'boolean') {
    out.mainApplicantViewingCoversCoApplicants = raw.mainApplicantViewingCoversCoApplicants
  }
  if (raw.applicationJourney && typeof raw.applicationJourney === 'object' && !Array.isArray(raw.applicationJourney)) {
    out.applicationJourney = raw.applicationJourney as import('./journey/types.js').AgencyJourneyOverride
  }
  return out
}

export function dbRoleToFrontend(role: string | null | undefined): string | null {
  switch (String(role ?? '').toUpperCase()) {
    case 'SUPER_ADMIN':
      return 'super_admin'
    case 'AGENCY_ADMIN':
      return 'client_admin'
    case 'AGENT_ADMIN':
      return 'agent_admin'
    case 'GROUND_AGENT':
      return 'ground_agent'
    case 'LANDLORD':
      return 'landlord'
    case 'END_USER':
      return 'tenant'
    case 'CONTRACTOR':
      return 'contractor'
    default:
      return null
  }
}
