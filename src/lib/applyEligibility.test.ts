import { describe, expect, it } from 'vitest'
import {
  ATTENDANCE_TOO_EARLY,
  BOOK_VIEWING_FIRST,
  LOGIN_REQUIRED,
  OVERRIDE_REASON_REQUIRED,
  VIEWING_REQUIRED,
  attendanceDecision,
  evaluateApplyEligibility,
  parseOverrideReason,
  rentalApplyButton,
  viewingEvidenceLabel,
  viewingIdsForWrite,
  viewingRuleEnabled,
  type CompletedBooking,
  type EligibilityFacts,
} from './applyEligibility'

const UNIT = 'unit-1'
const OTHER_UNIT = 'unit-2'
const BUILDING = 'building-1'

function booking(patch: Partial<CompletedBooking> = {}): CompletedBooking {
  return {
    id: 'booking-1',
    unitId: UNIT,
    buildingId: BUILDING,
    viewingMode: 'IN_PERSON',
    applicantId: 'applicant-1',
    visitorEmail: 'e2e-tenant@example.com',
    visitorPhone: '0820000000',
    attendedAt: '2026-11-12T08:00:00.000Z',
    ...patch,
  }
}

function facts(patch: Partial<EligibilityFacts> = {}): EligibilityFacts {
  return {
    authenticated: true,
    applicationType: 'RENTAL',
    listingType: 'RENT',
    actorRole: 'tenant',
    unitRequire: null,
    agencyRequire: undefined,
    buildingViewingCounts: false,
    mainApplicantCoversCoApplicants: true,
    targetUnitId: UNIT,
    targetBuildingId: BUILDING,
    applicantId: 'applicant-1',
    applicantEmail: 'e2e-tenant@example.com',
    applicantPhone: '0820000000',
    coApplicantEmails: [],
    completedBookings: [],
    override: null,
    ...patch,
  }
}

describe('viewing rule', () => {
  it('treats a missing agency flag as on and lets a unit false turn the rule off', () => {
    expect(viewingRuleEnabled(null, undefined)).toBe(true)
    expect(viewingRuleEnabled(null, false)).toBe(false)
    expect(viewingRuleEnabled(false, true)).toBe(false)
    expect(viewingRuleEnabled(true, false)).toBe(true)
  })

  it('requires a login before a rental application', () => {
    expect(evaluateApplyEligibility(facts({ authenticated: false })).reason).toBe(LOGIN_REQUIRED)
  })

  it('skips sale listings, purchase applications, and staff creates on unlisted units', () => {
    expect(evaluateApplyEligibility(facts({ listingType: 'SALE' })).reason).toBe('RULE_OFF')
    expect(evaluateApplyEligibility(facts({ applicationType: 'PURCHASE' })).reason).toBe('RULE_OFF')
    expect(
      evaluateApplyEligibility(facts({ listingType: 'NOT_LISTED', actorRole: 'agent' })).reason,
    ).toBe('RULE_OFF')
    expect(evaluateApplyEligibility(facts({ listingType: 'NOT_LISTED', actorRole: 'tenant' })).reason).toBe(
      VIEWING_REQUIRED,
    )
  })

  it('blocks a rental with no completed viewing', () => {
    const result = evaluateApplyEligibility(facts())
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe(VIEWING_REQUIRED)
  })

  it('unlocks on a completed in-person or virtual booking and ignores other statuses by absence', () => {
    const attended = evaluateApplyEligibility(facts({ completedBookings: [booking()] }))
    expect(attended.reason).toBe('ATTENDED')
    expect(attended.bookingId).toBe('booking-1')
    expect(attended.evidence?.kind).toBe('in_person')
    expect(viewingEvidenceLabel(attended.evidence)?.replace(/\s+/g, ' ')).toBe('Viewed in person 12 Nov')

    const virtual = evaluateApplyEligibility(
      facts({ completedBookings: [booking({ viewingMode: 'VIRTUAL' })] }),
    )
    expect(virtual.evidence?.kind).toBe('virtual')
    expect(viewingEvidenceLabel(virtual.evidence)).toBe('Virtual')
  })

  it('does not let a booking on another unit count unless the building flag is on', () => {
    const other = booking({ unitId: OTHER_UNIT })
    expect(evaluateApplyEligibility(facts({ completedBookings: [other] })).reason).toBe(VIEWING_REQUIRED)
    expect(
      evaluateApplyEligibility(facts({ buildingViewingCounts: true, completedBookings: [other] })).reason,
    ).toBe('ATTENDED')
  })

  it('requires every co-applicant when the main applicant does not cover them', () => {
    const blocked = evaluateApplyEligibility(
      facts({
        mainApplicantCoversCoApplicants: false,
        coApplicantEmails: ['e2e-co@example.com'],
        completedBookings: [booking()],
      }),
    )
    expect(blocked.reason).toBe(VIEWING_REQUIRED)
    const covered = evaluateApplyEligibility(
      facts({
        mainApplicantCoversCoApplicants: false,
        coApplicantEmails: ['e2e-co@example.com'],
        completedBookings: [booking(), booking({ id: 'booking-2', visitorEmail: 'e2e-co@example.com' })],
      }),
    )
    expect(covered.reason).toBe('ATTENDED')
  })

  it('accepts an override when there is no booking and prefers the booking when both exist', () => {
    const override = { id: 'override-1', reasonCode: 'OUT_OF_TOWN', reasonText: 'E2E TEST travelling' }
    const onlyOverride = evaluateApplyEligibility(facts({ override }))
    expect(onlyOverride.reason).toBe('OVERRIDE')
    expect(onlyOverride.overrideId).toBe('override-1')
    expect(viewingEvidenceLabel(onlyOverride.evidence)).toBe('Override: Out of town – E2E TEST travelling')

    const both = evaluateApplyEligibility(facts({ override, completedBookings: [booking()] }))
    expect(both.bookingId).toBe('booking-1')
    expect(both.overrideId).toBeNull()
  })

  it('keeps stored ids on an update and stores the booking on a create', () => {
    expect(viewingIdsForWrite(true, { bookingId: 'booking-1', overrideId: null })).toEqual({
      bookingId: null,
      overrideId: null,
    })
    expect(viewingIdsForWrite(false, { bookingId: 'booking-1', overrideId: null }).bookingId).toBe('booking-1')
  })

  it('uses the book-first label when the tenant is not eligible', () => {
    expect(rentalApplyButton(null, true).label).toBe('Checking viewing…')
    expect(rentalApplyButton({ eligible: false }, false)).toEqual({
      disabled: true,
      label: BOOK_VIEWING_FIRST,
      bookFirst: true,
    })
    expect(rentalApplyButton({ eligible: true }, false).label).toBe('Submit full application')
  })
})

describe('attendance and overrides', () => {
  const now = new Date('2026-11-12T10:00:00.000Z')
  const base = {
    actorRole: 'agent',
    actorUserUuid: 'agent-1',
    actorClientId: 'client-1',
    bookingClientId: 'client-1',
    bookingAgentId: 'agent-1',
    unitAgentId: 'agent-1',
    startsAt: new Date('2026-11-12T09:00:00.000Z'),
    now,
  }

  it('refuses another agency, an unassigned agent, and a future start', () => {
    expect(attendanceDecision({ ...base, actorClientId: 'client-2' }).ok).toBe(false)
    expect(attendanceDecision({ ...base, bookingAgentId: 'agent-2', unitAgentId: 'agent-2' }).ok).toBe(false)
    const early = attendanceDecision({ ...base, startsAt: new Date('2026-11-12T12:00:00.000Z') })
    expect(early.ok).toBe(false)
    if (!early.ok) expect(early.code).toBe(ATTENDANCE_TOO_EARLY)
  })

  it('lets the assigned agent and an agency admin mark attendance', () => {
    expect(attendanceDecision(base).ok).toBe(true)
    expect(attendanceDecision({ ...base, actorRole: 'client_admin', bookingAgentId: 'someone-else' }).ok).toBe(true)
  })

  it('rejects an override without a reason', () => {
    expect(() => parseOverrideReason({ reasonCode: 'OUT_OF_TOWN', reasonText: '  ' })).toThrowError(
      expect.objectContaining({ status: 400, code: OVERRIDE_REASON_REQUIRED }),
    )
  })
})
