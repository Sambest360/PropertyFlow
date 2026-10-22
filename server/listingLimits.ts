/**
 * Per-listing enquiry and viewing caps.
 * NULL unit cap inherits clients.settings.listingLimits; both NULL means unlimited.
 * Counts start at limits_round_started_at (null = all time). Cancelled and
 * rescheduled bookings, waitlisted leads, viewing-bucket leads, and spam leads
 * do not count. Caps apply to RENT and BOTH listings only.
 */
import { query, withTransaction } from './db.js'
import { forbiddenError, type DemoActor } from './actor.js'
import { isUuid, resolveUuid } from './entityMap.js'

export const LISTING_FULL = 'LISTING_FULL'

export type LimitAction = 'CLOSE' | 'WAITLIST'

export type EffectiveLimits = {
  applies: boolean
  maxEnquiries: number | null
  maxViewings: number | null
  limitAction: LimitAction
  showRemaining: boolean
  roundStartedAt: string | null
  enquiryCount: number
  viewingCount: number
}

const STAFF_ADMIN = new Set(['super_admin', 'client_admin'])
const ASSIGNED_AGENT = new Set(['agent_admin', 'ground_agent', 'agent'])

export function limitsApply(listingType: string | null | undefined): boolean {
  const t = String(listingType ?? '').toUpperCase()
  return t === 'RENT' || t === 'BOTH'
}

export function parseLimitAction(v: unknown): LimitAction {
  return String(v ?? '').toUpperCase() === 'CLOSE' ? 'CLOSE' : 'WAITLIST'
}

/** Blank / null is unlimited at this layer. Non-integers and negatives are rejected. */
export function parseOptionalCap(v: unknown, label: string): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n) || n < 0) {
    throw Object.assign(new Error(`${label} must be a whole number or blank`), {
      status: 400,
      code: 'LIMIT_INVALID',
    })
  }
  return n
}

function optionalInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v
  if (typeof v === 'string' && v.trim() && Number.isInteger(Number(v)) && Number(v) >= 0) return Number(v)
  return null
}

export function agencyListingDefaults(settings: unknown): {
  maxEnquiries: number | null
  maxViewings: number | null
} {
  const root = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {}
  const block =
    root.listingLimits && typeof root.listingLimits === 'object'
      ? (root.listingLimits as Record<string, unknown>)
      : {}
  return {
    maxEnquiries: optionalInt(block.maxEnquiries),
    maxViewings: optionalInt(block.maxViewings),
  }
}

/** Unit value wins. Null inherits the agency default. Both null is unlimited. */
export function effectiveCap(unitCap: number | null | undefined, agencyCap: number | null | undefined): number | null {
  if (unitCap != null && Number.isInteger(Number(unitCap))) return Number(unitCap)
  if (agencyCap != null && Number.isInteger(Number(agencyCap))) return Number(agencyCap)
  return null
}

export function capacityDecision(
  count: number,
  cap: number | null,
  action: LimitAction,
): 'allow' | 'waitlist' | 'close' {
  if (cap == null || count < cap) return 'allow'
  return action === 'WAITLIST' ? 'waitlist' : 'close'
}

export function remainingCount(count: number, cap: number | null): number | null {
  if (cap == null) return null
  return Math.max(cap - count, 0)
}

export function listingFullError(waitlist: boolean, waitlistId?: string | null) {
  return Object.assign(new Error(LISTING_FULL), {
    status: 409 as const,
    code: LISTING_FULL,
    waitlist,
    waitlistId: waitlistId ?? null,
  })
}

type UnitRow = {
  id: string
  client_id: string
  agent_id: string | null
  listing_type: string | null
  max_enquiries: number | null
  max_viewings: number | null
  limit_action: string | null
  limits_round_started_at: string | null
  show_remaining: boolean | null
}

function countOf(rows: Array<{ n?: number | string | null }>): number {
  const n = Number(rows[0]?.n ?? 0)
  return Number.isFinite(n) ? n : 0
}

export async function lockAndCount(unitId: string): Promise<EffectiveLimits & { clientId: string; agentId: string | null }> {
  const rows = await query<UnitRow>(
    `SELECT id::text AS id, client_id::text AS client_id, agent_id::text AS agent_id, listing_type, max_enquiries, max_viewings, limit_action, limits_round_started_at::text AS limits_round_started_at, show_remaining FROM units WHERE id = $1::uuid FOR UPDATE -- listing_limit_lock`,
    [unitId],
  )
  const unit = rows[0]
  if (!unit) {
    throw Object.assign(new Error('property_not_found'), { status: 404 })
  }
  const settingsRows = await query<{ settings: unknown }>(
    `SELECT settings FROM clients WHERE id = $1::uuid -- listing_limit_agency`,
    [unit.client_id],
  )
  const agency = agencyListingDefaults(settingsRows[0]?.settings)
  const applies = limitsApply(unit.listing_type)
  const maxEnquiries = applies ? effectiveCap(unit.max_enquiries, agency.maxEnquiries) : null
  const maxViewings = applies ? effectiveCap(unit.max_viewings, agency.maxViewings) : null
  const round = unit.limits_round_started_at
  const enquiryRows = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM leads
      WHERE unit_id = $1::uuid
        AND COALESCE(is_waitlisted, false) = false
        AND COALESCE(metadata->>'limit_bucket', '') <> 'viewing'
        AND COALESCE(metadata->>'spam', '') <> 'true'
        AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz) -- listing_limit_count`,
    [unitId, round],
  )
  const viewingRows = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM bookings
      WHERE unit_id = $1::uuid
        AND status IN ('SCHEDULED', 'COMPLETED', 'NO_SHOW')
        AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz) -- listing_limit_count`,
    [unitId, round],
  )
  return {
    applies,
    maxEnquiries,
    maxViewings,
    limitAction: parseLimitAction(unit.limit_action),
    showRemaining: Boolean(unit.show_remaining),
    roundStartedAt: round,
    enquiryCount: countOf(enquiryRows),
    viewingCount: countOf(viewingRows),
    clientId: unit.client_id,
    agentId: unit.agent_id,
  }
}

export async function findDuplicateLead(
  unitId: string,
  roundStartedAt: string | null,
  email: string,
  phone: string,
): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id
       FROM leads
      WHERE unit_id = $1::uuid
        AND COALESCE(is_waitlisted, false) = false
        AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
        AND (
          lower(email) = lower($3)
          OR ($4 <> '' AND phone IS NOT NULL AND phone = $4)
        ) -- listing_limit_duplicate
      LIMIT 1`,
    [unitId, roundStartedAt, email, phone],
  )
  return rows[0]?.id ?? null
}

async function resolveUnitId(id: string): Promise<string | null> {
  const fromUnit = await resolveUuid('unit', id)
  if (fromUnit) return fromUnit
  const fromProperty = await resolveUuid('property', id)
  if (fromProperty) return fromProperty
  if (!isUuid(id)) return null
  const rows = await query<{ id: string }>(`SELECT id::text AS id FROM units WHERE id = $1::uuid`, [id])
  return rows[0]?.id ?? null
}

async function actorUserUuid(actor: DemoActor): Promise<string | null> {
  const mapped = await resolveUuid('user', actor.userId)
  if (mapped) return mapped
  if (isUuid(actor.userId)) return actor.userId
  return null
}

async function actorClientUuid(actor: DemoActor, userUuid: string | null): Promise<string | null> {
  if (actor.agencyId) {
    const mapped = await resolveUuid('agency', actor.agencyId)
    if (mapped) return mapped
    if (isUuid(actor.agencyId)) return actor.agencyId
  }
  if (!userUuid) return null
  const rows = await query<{ client_id: string | null }>(
    `SELECT client_id::text AS client_id FROM users WHERE id = $1::uuid`,
    [userUuid],
  )
  return rows[0]?.client_id ?? null
}

export async function assertCanManageListingLimits(actor: DemoActor, unitId: string): Promise<UnitRow> {
  const rows = await query<UnitRow>(
    `SELECT id::text AS id, client_id::text AS client_id, agent_id::text AS agent_id,
            listing_type, max_enquiries, max_viewings, limit_action,
            limits_round_started_at::text AS limits_round_started_at, show_remaining
       FROM units WHERE id = $1::uuid`,
    [unitId],
  )
  const unit = rows[0]
  if (!unit) throw Object.assign(new Error('property_not_found'), { status: 404 })
  if (actor.role === 'super_admin') return unit
  const userUuid = await actorUserUuid(actor)
  const clientUuid = await actorClientUuid(actor, userUuid)
  if (!clientUuid || clientUuid !== unit.client_id) {
    throw Object.assign(forbiddenError('Another agency cannot change listing limits'), { code: 'FORBIDDEN' })
  }
  if (STAFF_ADMIN.has(actor.role)) return unit
  if (ASSIGNED_AGENT.has(actor.role) && userUuid && unit.agent_id === userUuid) return unit
  throw Object.assign(forbiddenError('Only the assigned agent or an agency admin can change listing limits'), {
    code: 'FORBIDDEN',
  })
}

async function writeEvent(
  clientId: string,
  eventType: string,
  subjectId: string,
  actorUserId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  await query(
    `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, actor_user_id, payload)
     VALUES ($1::uuid, $2, 'unit', $3::uuid, $4::uuid, $5::jsonb)`,
    [clientId, eventType, subjectId, actorUserId, JSON.stringify(payload)],
  )
}

export async function getListingLimits(actor: DemoActor, unitRef: string) {
  const unitId = await resolveUnitId(unitRef)
  if (!unitId) throw Object.assign(new Error('property_not_found'), { status: 404 })
  await assertCanManageListingLimits(actor, unitId)
  const snap = await lockAndCount(unitId)
  const waitlist = await query(
    `SELECT id::text AS id, name, email, phone, created_at
       FROM viewing_waitlist
      WHERE unit_id = $1::uuid AND promoted_at IS NULL
      ORDER BY created_at ASC`,
    [unitId],
  )
  const waitlistedLeads = await query(
    `SELECT id::text AS id, name, email, phone, created_at
       FROM leads
      WHERE unit_id = $1::uuid AND is_waitlisted = true
      ORDER BY created_at ASC`,
    [unitId],
  )
  return {
    ...snap,
    remainingViewings: snap.showRemaining ? remainingCount(snap.viewingCount, snap.maxViewings) : null,
    remainingEnquiries: snap.showRemaining ? remainingCount(snap.enquiryCount, snap.maxEnquiries) : null,
    fullyBooked:
      (snap.maxViewings != null && snap.viewingCount >= snap.maxViewings) ||
      (snap.maxEnquiries != null && snap.enquiryCount >= snap.maxEnquiries),
    waitlist,
    waitlistedLeads,
  }
}

export async function patchListingLimits(
  actor: DemoActor,
  unitRef: string,
  body: Record<string, unknown>,
) {
  const unitId = await resolveUnitId(unitRef)
  if (!unitId) throw Object.assign(new Error('property_not_found'), { status: 404 })
  const unit = await assertCanManageListingLimits(actor, unitId)
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)
  const maxEnquiries = has('maxEnquiries') ? parseOptionalCap(body.maxEnquiries, 'maxEnquiries') : unit.max_enquiries
  const maxViewings = has('maxViewings') ? parseOptionalCap(body.maxViewings, 'maxViewings') : unit.max_viewings
  const limitAction = has('limitAction') ? parseLimitAction(body.limitAction) : parseLimitAction(unit.limit_action)
  if (has('limitAction') && !['CLOSE', 'WAITLIST'].includes(String(body.limitAction).toUpperCase())) {
    throw Object.assign(new Error('limitAction must be CLOSE or WAITLIST'), { status: 400, code: 'LIMIT_INVALID' })
  }
  const showRemaining = has('showRemaining') ? Boolean(body.showRemaining) : Boolean(unit.show_remaining)
  await query(
    `UPDATE units
        SET max_enquiries = $2,
            max_viewings = $3,
            limit_action = $4,
            show_remaining = $5,
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [unitId, maxEnquiries, maxViewings, limitAction, showRemaining],
  )
  const actorUuid = await actorUserUuid(actor)
  await writeEvent(unit.client_id, 'listing_limits_updated', unitId, actorUuid, {
    maxEnquiries,
    maxViewings,
    limitAction,
    showRemaining,
  })
  return { ok: true, maxEnquiries, maxViewings, limitAction, showRemaining }
}

export async function resetListingLimits(actor: DemoActor, unitRef: string) {
  const unitId = await resolveUnitId(unitRef)
  if (!unitId) throw Object.assign(new Error('property_not_found'), { status: 404 })
  const unit = await assertCanManageListingLimits(actor, unitId)
  const rows = await query<{ started: string }>(
    `UPDATE units
        SET limits_round_started_at = NOW(), updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING limits_round_started_at::text AS started`,
    [unitId],
  )
  const actorUuid = await actorUserUuid(actor)
  await writeEvent(unit.client_id, 'listing_limits_reset', unitId, actorUuid, {
    limitsRoundStartedAt: rows[0]?.started ?? null,
  })
  return { ok: true, limitsRoundStartedAt: rows[0]?.started ?? null }
}

export async function joinViewingWaitlist(input: {
  unitRef: string
  name: string
  email: string
  phone?: string
  kind?: 'viewing' | 'enquiry'
}): Promise<{ ok: true; waitlistId: string; waitlist: true }> {
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  const phone = (input.phone ?? '').trim()
  if (!name || !email) {
    throw Object.assign(new Error('contact_required'), { status: 400 })
  }
  const unitId = await resolveUnitId(input.unitRef)
  if (!unitId) throw Object.assign(new Error('property_not_found'), { status: 404 })
  const kind = input.kind === 'enquiry' ? 'enquiry' : 'viewing'
  if (kind === 'enquiry') {
    const rows = await query<{ id: string }>(
      `INSERT INTO leads (
         client_id, unit_id, agent_id, name, email, phone, channel, stage,
         interest_type, is_waitlisted, updated_at
       )
       SELECT client_id, id, agent_id, $2, $3, NULLIF($4, ''), 'Web Form', 'Waitlist',
              'RENT', true, NOW()
         FROM units WHERE id = $1::uuid
       RETURNING id::text AS id`,
      [unitId, name, email, phone],
    )
    return { ok: true, waitlistId: rows[0]?.id ?? '', waitlist: true }
  }
  const rows = await query<{ id: string }>(
    `INSERT INTO viewing_waitlist (client_id, unit_id, name, email, phone)
     SELECT client_id, id, $2, $3, NULLIF($4, '')
       FROM units WHERE id = $1::uuid
     RETURNING id::text AS id`,
    [unitId, name, email, phone],
  )
  return { ok: true, waitlistId: rows[0]?.id ?? '', waitlist: true }
}

export async function promoteWaitlist(actor: DemoActor, waitlistId: string) {
  const rows = await query<{
    id: string
    client_id: string
    unit_id: string
    name: string
    email: string
    phone: string | null
    promoted_at: string | null
  }>(
    `SELECT id::text AS id, client_id::text AS client_id, unit_id::text AS unit_id,
            name, email, phone, promoted_at::text AS promoted_at
       FROM viewing_waitlist WHERE id = $1::uuid`,
    [waitlistId],
  )
  const row = rows[0]
  if (!row) throw Object.assign(new Error('waitlist_not_found'), { status: 404 })
  if (row.promoted_at) throw Object.assign(new Error('already_promoted'), { status: 409 })
  await assertCanManageListingLimits(actor, row.unit_id)
  const actorUuid = await actorUserUuid(actor)
  const booking = await withTransaction(async () => {
    const snap = await lockAndCount(row.unit_id)
    const decision = capacityDecision(snap.viewingCount, snap.maxViewings, snap.limitAction)
    if (decision !== 'allow') throw listingFullError(true, row.id)
    const created = await query<{ id: string }>(
    `INSERT INTO bookings (
       client_id, unit_id, agent_id, visitor_name, visitor_email, visitor_phone,
       starts_at, status, notes, updated_at
     )
     SELECT $1::uuid, $2::uuid, agent_id, $3, $4, $5, NOW(), 'SCHEDULED',
            'Promoted from waitlist', NOW()
       FROM units WHERE id = $2::uuid
     RETURNING id::text AS id`,
      [row.client_id, row.unit_id, row.name, row.email, row.phone],
    )
    await query(`UPDATE viewing_waitlist SET promoted_at = NOW() WHERE id = $1::uuid`, [row.id])
    return created
  })
  await writeEvent(row.client_id, 'waitlist_promoted', row.unit_id, actorUuid, {
    waitlistId: row.id,
    bookingId: booking[0]?.id ?? null,
    email: row.email,
  })
  await notifyUserByEmail(row.client_id, row.email, {
    title: 'A viewing spot opened',
    body: 'You have been promoted from the waitlist. The agent will confirm your viewing time.',
    linkPath: '/listing',
  })
  return { ok: true, bookingId: booking[0]?.id ?? null }
}

export async function promoteWaitlistedLead(actor: DemoActor, leadId: string) {
  const rows = await query<{
    id: string
    client_id: string
    unit_id: string | null
    is_waitlisted: boolean
    email: string | null
  }>(
    `SELECT id::text AS id, client_id::text AS client_id, unit_id::text AS unit_id,
            is_waitlisted, email
       FROM leads WHERE id = $1::uuid`,
    [leadId],
  )
  const lead = rows[0]
  if (!lead?.unit_id) throw Object.assign(new Error('lead_not_found'), { status: 404 })
  if (!lead.is_waitlisted) return { ok: true, already: true }
  await assertCanManageListingLimits(actor, lead.unit_id)
  const snap = await lockAndCount(lead.unit_id)
  const decision = capacityDecision(snap.enquiryCount, snap.maxEnquiries, snap.limitAction)
  if (decision !== 'allow') throw listingFullError(true, lead.id)
  await query(`UPDATE leads SET is_waitlisted = false, updated_at = NOW() WHERE id = $1::uuid`, [lead.id])
  const actorUuid = await actorUserUuid(actor)
  await writeEvent(lead.client_id, 'waitlist_promoted', lead.unit_id, actorUuid, {
    leadId: lead.id,
    email: lead.email,
  })
  return { ok: true }
}

async function notifyUserByEmail(
  clientId: string,
  email: string,
  note: { title: string; body: string; linkPath: string },
): Promise<void> {
  const users = await query<{ id: string }>(
    `SELECT id::text AS id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [email],
  )
  const userId = users[0]?.id
  if (!userId) return
  await query(
    `INSERT INTO notifications (client_id, user_id, title, body, link_path, resource_type, action_type)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'unit', 'updated')`,
    [clientId, userId, note.title, note.body, note.linkPath],
  )
}

/** A cancelled booking frees a listing spot. Tell the oldest waitlisted person. */
export async function notifyWaitlistSpotOpen(unitId: string): Promise<void> {
  const people = await query<{
    id: string
    client_id: string
    email: string
    name: string
  }>(
    `SELECT id::text AS id, client_id::text AS client_id, email, name
       FROM viewing_waitlist
      WHERE unit_id = $1::uuid AND promoted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1`,
    [unitId],
  )
  const person = people[0]
  if (!person) return
  await writeEvent(person.client_id, 'listing_spot_freed', unitId, null, {
    waitlistId: person.id,
    email: person.email,
  })
  await notifyUserByEmail(person.client_id, person.email, {
    title: 'A viewing spot opened',
    body: `${person.name}, a viewing spot is free. The agency can promote you from the waitlist.`,
    linkPath: '/listing',
  })
}
