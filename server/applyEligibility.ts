/**
 * Database side of the mandatory-viewing rule.
 * Rule decisions live in src/lib/applyEligibility.ts.
 */
import { query } from './db.js'
import { isUuid, resolveUuid } from './entityMap.js'
import {
  attendanceDecision,
  canSetUnitViewingOverride,
  dbRoleToFrontend,
  evaluateApplyEligibility,
  isLetStatus,
  normEmail,
  parseOverrideReason,
  type ApplyEligibility,
  type CompletedBooking,
  type EligibilityFacts,
  type ViewingEvidence,
  type ViewingMode,
  OVERRIDE_TTL_DAYS,
} from '../src/lib/applyEligibility.js'
import type { DemoActor } from './actor.js'

export {
  VIEWING_REQUIRED,
  LOGIN_REQUIRED,
  ATTENDANCE_TOO_EARLY,
  OVERRIDE_REASON_REQUIRED,
  viewingIdsForWrite,
  coApplicantEmailsFromPayload,
} from '../src/lib/applyEligibility.js'

const UNIT_CONTEXT_SQL = `/* apply-eligibility */
SELECT u.id::text AS unit_id,
       u.client_id::text AS client_id,
       u.building_id::text AS building_id,
       u.listing_type,
       u.require_viewing_to_apply,
       c.settings,
       COALESCE((
         SELECT json_agg(json_build_object(
           'id', b.id,
           'unitId', b.unit_id,
           'buildingId', bu.building_id,
           'viewingMode', b.viewing_mode,
           'applicantId', b.applicant_id,
           'visitorEmail', b.visitor_email,
           'visitorPhone', b.visitor_phone,
           'attendedAt', b.attended_marked_at,
           'attendedBy', b.attended_marked_by
         ))
         FROM bookings b
         JOIN units bu ON bu.id = b.unit_id
         WHERE b.status = 'COMPLETED'
           -- Only staff-marked attendance counts: a plain booking save can write
           -- COMPLETED before markBookingAttendance runs (and reverts on failure).
           AND b.attended_marked_by IS NOT NULL
           AND b.client_id = u.client_id
           AND (b.unit_id = u.id OR bu.building_id = u.building_id)
       ), '[]'::json) AS completed_bookings,
       (
         SELECT json_build_object(
           'id', o.id,
           'reasonCode', o.reason_code,
           'reasonText', o.reason_text
         )
         FROM apply_overrides o
         WHERE o.unit_id = u.id
           AND o.revoked_at IS NULL
           AND o.expires_at > NOW()
           AND (
             ($2::uuid IS NOT NULL AND o.applicant_id = $2::uuid)
             OR ($3 <> '' AND o.applicant_email = lower($3))
           )
         ORDER BY o.created_at DESC
         LIMIT 1
       ) AS live_override
  FROM units u
  JOIN clients c ON c.id = u.client_id
 WHERE u.id = $1::uuid`

type UnitContextRow = {
  unit_id: string
  client_id: string
  building_id: string | null
  listing_type: string
  require_viewing_to_apply: boolean | null
  settings: unknown
  completed_bookings: unknown
  live_override: unknown
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return asObject(JSON.parse(value))
    } catch {
      return null
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function asArray(value: unknown): unknown[] {
  if (typeof value === 'string') {
    try {
      return asArray(JSON.parse(value))
    } catch {
      return []
    }
  }
  return Array.isArray(value) ? value : []
}

function boolOrNull(value: unknown): boolean | null {
  if (value === true || value === false) return value
  return null
}

function settingsFlag(settings: unknown, key: string): boolean | null | undefined {
  const row = asObject(settings)
  if (!row || !Object.prototype.hasOwnProperty.call(row, key)) return undefined
  return boolOrNull(row[key])
}

export function mapBookings(value: unknown): CompletedBooking[] {
  return asArray(value)
    // Defence in depth with the SQL filter: unmarked attendance never counts.
    .filter((item) => Boolean(asObject(item)?.attendedBy))
    .map((item) => {
      const row = asObject(item) ?? {}
      const mode = row.viewingMode === 'VIRTUAL' ? 'VIRTUAL' : 'IN_PERSON'
      return {
        id: String(row.id ?? ''),
        unitId: String(row.unitId ?? ''),
        buildingId: row.buildingId ? String(row.buildingId) : null,
        viewingMode: mode as ViewingMode,
        applicantId: row.applicantId ? String(row.applicantId) : null,
        visitorEmail: row.visitorEmail ? String(row.visitorEmail) : null,
        visitorPhone: row.visitorPhone ? String(row.visitorPhone) : null,
        attendedAt: row.attendedAt ? String(row.attendedAt) : null,
      }
    })
    .filter((booking) => booking.id && booking.unitId)
}

function coded(status: number, code: string, message: string): Error {
  return Object.assign(new Error(message), { status, code })
}

async function resolveUserUuid(ref: string | null | undefined): Promise<string | null> {
  if (!ref) return null
  const mapped = await resolveUuid('user', ref)
  if (mapped) return mapped
  return isUuid(ref) ? ref : null
}

/**
 * Contact details used to match a completed booking to the applicant.
 * With an account, only the account's own email and phone count: typed-in
 * form values are ignored, so typing someone else's number or email cannot
 * borrow their viewing. Without an account (staff-entered walk-in) the typed
 * email is kept for override lookup, but a typed phone never matches.
 */
export async function verifiedContact(
  applicantId: string | null,
  email: string | null,
): Promise<{ email: string | null; phone: string | null }> {
  if (!applicantId) return { email: normEmail(email) || null, phone: null }
  const rows = await query<{ email: string | null; phone: string | null }>(
    `SELECT email, phone FROM users WHERE id = $1::uuid`,
    [applicantId],
  )
  const row = rows[0]
  if (!row) return { email: null, phone: null }
  return {
    email: normEmail(row.email) || null,
    phone: row.phone?.trim() || null,
  }
}

export async function loadApplyEligibility(input: {
  unitId: string
  applicationType: 'RENTAL' | 'PURCHASE'
  actorRole: string | null
  applicantId: string | null
  applicantEmail: string | null
  applicantPhone: string | null
  coApplicantEmails: string[]
  authenticated?: boolean
}): Promise<ApplyEligibility | null> {
  const contact = await verifiedContact(input.applicantId, input.applicantEmail)
  const rows = await query<UnitContextRow>(UNIT_CONTEXT_SQL, [
    input.unitId,
    input.applicantId,
    contact.email ?? '',
  ])
  const row = rows[0]
  if (!row) return null
  const agencyRequire = settingsFlag(row.settings, 'requireViewingToApply')
  const buildingFlag = settingsFlag(row.settings, 'buildingViewingCountsForAllUnits')
  const coFlag = settingsFlag(row.settings, 'mainApplicantViewingCoversCoApplicants')
  const override = asObject(row.live_override)
  const facts: EligibilityFacts = {
    authenticated: input.authenticated !== false,
    applicationType: input.applicationType,
    listingType: row.listing_type,
    actorRole: input.actorRole,
    unitRequire: boolOrNull(row.require_viewing_to_apply),
    agencyRequire: agencyRequire === undefined ? undefined : agencyRequire,
    buildingViewingCounts: buildingFlag === true,
    mainApplicantCoversCoApplicants: coFlag !== false,
    targetUnitId: row.unit_id,
    targetBuildingId: row.building_id,
    applicantId: input.applicantId,
    applicantEmail: contact.email,
    applicantPhone: contact.phone,
    coApplicantEmails: input.coApplicantEmails.map(normEmail).filter(Boolean),
    completedBookings: mapBookings(row.completed_bookings),
    override: override?.id
      ? {
          id: String(override.id),
          reasonCode: override.reasonCode ? String(override.reasonCode) : null,
          reasonText: override.reasonText ? String(override.reasonText) : null,
        }
      : null,
  }
  return evaluateApplyEligibility(facts)
}

export async function viewingEvidenceForNewApplication(input: {
  unitId: string
  applicationType: 'RENTAL' | 'PURCHASE'
  actorRole: string | null
  applicantId: string | null
  applicantEmail: string | null
  applicantPhone: string | null
  coApplicantEmails?: string[]
}): Promise<{ bookingId: string | null; overrideId: string | null; evidence: ViewingEvidence | null }> {
  const result = await loadApplyEligibility({
    ...input,
    coApplicantEmails: input.coApplicantEmails ?? [],
    authenticated: true,
  })
  // Fail closed: a unit the gate cannot load is refused, never waved through.
  if (!result) throw coded(404, 'NOT_FOUND', 'Unit not found')
  if (!result.eligible) {
    throw coded(403, result.reason, 'Book and attend a viewing before applying for this unit')
  }
  return { bookingId: result.bookingId, overrideId: result.overrideId, evidence: result.evidence }
}

type BookingAttendanceRow = {
  id: string
  client_id: string
  agent_id: string | null
  applicant_id: string | null
  starts_at: Date | string
  unit_id: string
  unit_agent_id: string | null
}

async function actorUuidAndClient(actor: DemoActor): Promise<{ userUuid: string; clientId: string | null; role: string }> {
  const userUuid = await resolveUserUuid(actor.userId)
  if (!userUuid) throw coded(403, 'FORBIDDEN', 'Only the assigned agent or an agency admin can mark attendance')
  const rows = await query<{ id: string; client_id: string | null; role: string }>(
    `/* attendance-actor */ SELECT id::text AS id, client_id::text AS client_id, role FROM users WHERE id = $1::uuid`,
    [userUuid],
  )
  const dbRole = dbRoleToFrontend(rows[0]?.role)
  const agencyUuid = actor.agencyId ? await resolveUuid('agency', actor.agencyId) : null
  return {
    userUuid,
    clientId: rows[0]?.client_id ?? agencyUuid,
    role: dbRole ?? actor.role,
  }
}

export async function markBookingAttendance(
  actor: DemoActor,
  bookingRef: string,
  body: { status?: unknown; viewingMode?: unknown },
  now = new Date(),
): Promise<{ id: string; status: string; viewingMode: ViewingMode }> {
  const status = body.status === 'NO_SHOW' ? 'NO_SHOW' : body.status === 'COMPLETED' ? 'COMPLETED' : null
  if (!status) throw coded(400, 'ATTENDANCE_STATUS_INVALID', 'Status must be COMPLETED or NO_SHOW')
  const viewingMode: ViewingMode = body.viewingMode === 'VIRTUAL' ? 'VIRTUAL' : 'IN_PERSON'
  if (body.viewingMode != null && body.viewingMode !== 'IN_PERSON' && body.viewingMode !== 'VIRTUAL') {
    throw coded(400, 'VIEWING_MODE_INVALID', 'viewingMode must be IN_PERSON or VIRTUAL')
  }
  const bookingId = (await resolveUuid('viewing', bookingRef)) ?? (isUuid(bookingRef) ? bookingRef : null)
  if (!bookingId) throw coded(404, 'NOT_FOUND', 'Booking not found')
  const bookings = await query<BookingAttendanceRow>(
    `/* booking-attendance */
     SELECT b.id::text AS id, b.client_id::text AS client_id, b.agent_id::text AS agent_id,
            b.applicant_id::text AS applicant_id, b.starts_at, b.unit_id::text AS unit_id,
            u.agent_id::text AS unit_agent_id
       FROM bookings b
       JOIN units u ON u.id = b.unit_id
      WHERE b.id = $1::uuid`,
    [bookingId],
  )
  const booking = bookings[0]
  if (!booking) throw coded(404, 'NOT_FOUND', 'Booking not found')
  const who = await actorUuidAndClient(actor)
  const decision = attendanceDecision({
    actorRole: who.role,
    actorUserUuid: who.userUuid,
    actorClientId: who.clientId,
    bookingClientId: booking.client_id,
    bookingAgentId: booking.agent_id,
    unitAgentId: booking.unit_agent_id,
    startsAt: new Date(booking.starts_at),
    now,
  })
  if (!decision.ok) throw coded(decision.status, decision.code, decision.message)
  await query(
    `UPDATE bookings
        SET status = $2,
            viewing_mode = $3,
            attended_marked_by = $4::uuid,
            attended_marked_at = NOW(),
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [booking.id, status, viewingMode, who.userUuid],
  )
  await query(
    `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, actor_user_id, payload)
     VALUES ($1::uuid, 'viewing_attendance_marked', 'booking', $2::uuid, $3::uuid, $4::jsonb)`,
    [booking.client_id, booking.id, who.userUuid, JSON.stringify({ status, viewingMode })],
  )
  if (booking.applicant_id) {
    await query(
      `INSERT INTO notifications (client_id, user_id, title, body, link_path, resource_type, action_type)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'booking', 'updated')`,
      [
        booking.client_id,
        booking.applicant_id,
        status === 'COMPLETED' ? 'Viewing attended' : 'Viewing marked as no-show',
        status === 'COMPLETED'
          ? 'Your viewing was marked attended. You can apply for this unit.'
          : 'The agent marked this viewing as a no-show.',
        '/workspace/portals/tenant/viewings',
      ],
    )
  }
  return { id: booking.id, status, viewingMode }
}

export async function grantApplyOverride(
  actor: DemoActor,
  unitRef: string,
  body: {
    applicantId?: unknown
    applicantEmail?: unknown
    reasonCode?: unknown
    reasonText?: unknown
    expiresAt?: unknown
  },
): Promise<{ id: string }> {
  const reason = parseOverrideReason(body)
  const unitId =
    (await resolveUuid('unit', unitRef)) ??
    (await resolveUuid('property', unitRef)) ??
    (isUuid(unitRef) ? unitRef : null)
  if (!unitId) throw coded(404, 'NOT_FOUND', 'Unit not found')
  const units = await query<{ id: string; client_id: string; agent_id: string | null }>(
    `SELECT id::text AS id, client_id::text AS client_id, agent_id::text AS agent_id
       FROM units WHERE id = $1::uuid`,
    [unitId],
  )
  const unit = units[0]
  if (!unit) throw coded(404, 'NOT_FOUND', 'Unit not found')
  const who = await actorUuidAndClient(actor)
  const sameAgency = who.role === 'super_admin' || (who.clientId != null && who.clientId === unit.client_id)
  const admin = who.role === 'super_admin' || (who.role === 'client_admin' && sameAgency)
  const assignedAgent =
    (who.role === 'agent_admin' || who.role === 'ground_agent' || who.role === 'agent') &&
    unit.agent_id === who.userUuid &&
    sameAgency
  if (!admin && !assignedAgent) {
    throw coded(403, 'FORBIDDEN', 'Only the unit agent or an agency admin can grant an apply override')
  }
  const applicantRef = typeof body.applicantId === 'string' ? body.applicantId : null
  const applicantId = await resolveUserUuid(applicantRef)
  const email = normEmail(typeof body.applicantEmail === 'string' ? body.applicantEmail : null)
  if (!applicantId && !email) {
    throw coded(400, 'APPLICANT_REQUIRED', 'An override needs an applicant')
  }
  const expires =
    typeof body.expiresAt === 'string' && body.expiresAt
      ? body.expiresAt
      : new Date(Date.now() + OVERRIDE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const inserted = await query<{ id: string }>(
    `INSERT INTO apply_overrides (
       client_id, unit_id, applicant_id, applicant_email, granted_by, reason_code, reason_text, expires_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, NULLIF($4, ''), $5::uuid, $6, $7, $8::timestamptz
     )
     RETURNING id::text AS id`,
    [unit.client_id, unit.id, applicantId, email, who.userUuid, reason.reasonCode, reason.reasonText, expires],
  )
  const id = inserted[0]?.id
  if (!id) throw coded(500, 'OVERRIDE_NOT_STORED', 'Override was not stored')
  await query(
    `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, actor_user_id, payload)
     VALUES ($1::uuid, 'apply_override_granted', 'apply_override', $2::uuid, $3::uuid, $4::jsonb)`,
    [unit.client_id, id, who.userUuid, JSON.stringify({ reasonCode: reason.reasonCode, unitId: unit.id })],
  )
  if (applicantId) {
    await query(
      `INSERT INTO notifications (client_id, user_id, title, body, link_path, resource_type, action_type)
       VALUES ($1::uuid, $2::uuid, 'You can apply', $3, $4, 'unit', 'created')`,
      [unit.client_id, applicantId, `An agent allowed you to apply. ${reason.reasonText}`, `/listing/${unitRef}`],
    )
  }
  return { id }
}

export async function listApplyOverrides(
  actor: DemoActor,
  agencyRef: string | null,
): Promise<Array<Record<string, unknown>>> {
  const who = await actorUuidAndClient(actor)
  if (who.role !== 'super_admin' && who.role !== 'client_admin') {
    throw coded(403, 'FORBIDDEN', 'Only an agency admin can view apply overrides')
  }
  let clientId = who.clientId
  if (who.role === 'super_admin' && agencyRef) {
    clientId = (await resolveUuid('agency', agencyRef)) ?? (isUuid(agencyRef) ? agencyRef : clientId)
  }
  if (!clientId) return []
  return query(
    `SELECT o.id::text AS id, o.unit_id::text AS unit_id, u.title AS unit_title,
            o.applicant_id::text AS applicant_id, o.applicant_email, o.reason_code, o.reason_text,
            o.expires_at, o.revoked_at, o.created_at, o.granted_by::text AS granted_by
       FROM apply_overrides o
       LEFT JOIN units u ON u.id = o.unit_id
      WHERE o.client_id = $1::uuid
      ORDER BY o.created_at DESC
      LIMIT 100`,
    [clientId],
  )
}

export async function revokeApplyOverridesForLetUnit(unitId: string): Promise<void> {
  const rows = await query<{ id: string; client_id: string }>(
    `UPDATE apply_overrides
        SET revoked_at = NOW()
      WHERE unit_id = $1::uuid
        AND revoked_at IS NULL
      RETURNING id::text AS id, client_id::text AS client_id`,
    [unitId],
  )
  for (const row of rows) {
    await query(
      `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, payload)
       VALUES ($1::uuid, 'apply_override_revoked', 'apply_override', $2::uuid, '{"reason":"unit_let"}'::jsonb)`,
      [row.client_id, row.id],
    )
  }
}

export async function revokeApplyOverridesForLetStatus(unitId: string, statusKey: string): Promise<void> {
  if (!isLetStatus(statusKey)) return
  await revokeApplyOverridesForLetUnit(unitId)
}

export function requireViewingColumn(data: Record<string, unknown>): { value: boolean | null; sent: boolean } {
  if (!Object.prototype.hasOwnProperty.call(data, 'requireViewingToApply')) {
    return { value: null, sent: false }
  }
  if (data.requireViewingToApply === true || data.requireViewingToApply === false) {
    return { value: data.requireViewingToApply, sent: true }
  }
  return { value: null, sent: true }
}

/**
 * Per-unit viewing-gate override, authorised (Michael: the viewing process is
 * the agency's call). Agency staff may set it. Anyone else (in practice a
 * landlord editing their own listing) may not change it: a write that repeats
 * the stored value (or sends nothing) keeps the stored value, a write that
 * would change it is refused with 403 VIEWING_OVERRIDE_STAFF_ONLY. Runs before
 * any row is written, so a refused write changes nothing.
 */
export async function authorizedRequireViewingColumn(
  actorRole: string | null,
  data: Record<string, unknown>,
  unitUuid: string | null,
): Promise<{ value: boolean | null; sent: boolean }> {
  const rule = requireViewingColumn(data)
  if (!rule.sent || canSetUnitViewingOverride(actorRole)) return rule
  // A unit not created yet has no override (null).
  const rows = unitUuid
    ? await query<{ require_viewing_to_apply: boolean | null }>(
        `/* unit-viewing-override */ SELECT require_viewing_to_apply FROM units WHERE id = $1::uuid`,
        [unitUuid],
      )
    : []
  const current = boolOrNull(rows[0]?.require_viewing_to_apply)
  if (rule.value === current) return { value: null, sent: false }
  throw coded(
    403,
    'VIEWING_OVERRIDE_STAFF_ONLY',
    'Only agency staff can change whether this unit requires a viewing before applying',
  )
}

export async function readUnitApplyEligibilityForActor(actor: DemoActor, unitRef: string): Promise<ApplyEligibility> {
  const unitId =
    (await resolveUuid('unit', unitRef)) ??
    (await resolveUuid('property', unitRef)) ??
    (isUuid(unitRef) ? unitRef : null)
  if (!unitId) throw coded(404, 'NOT_FOUND', 'Unit not found')
  const applicantId = await resolveUserUuid(actor.userId)
  const result = await loadApplyEligibility({
    unitId,
    applicationType: 'RENTAL',
    actorRole: actor.role,
    applicantId,
    applicantEmail: null,
    applicantPhone: null,
    coApplicantEmails: [],
    authenticated: true,
  })
  if (!result) throw coded(404, 'NOT_FOUND', 'Unit not found')
  return result
}
