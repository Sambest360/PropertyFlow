/**
 * Advertise a tenanted rental until a successor lease starts.
 * available_from is stored on the unit for the public marketplace RPC.
 */
import { query } from './db.js'
import { isUuid, resolveUuid, type EntityType } from './entityMap.js'
import { forbiddenError, type DemoActor } from './actor.js'
import { addSaBusinessDays, isoAddDays } from './saPublicHolidays.js'
import {
  MIN_OCCUPIED_VIEWING_NOTICE_HOURS,
  POPIA_PHOTO_WARNING,
  isOccupiedAdvert,
} from '../src/lib/occupiedAdvert.js'

export { POPIA_PHOTO_WARNING, isOccupiedAdvert }

export const LEASE_OVERLAP = 'LEASE_OVERLAP'
export const NOTICE_TOO_SHORT = 'NOTICE_TOO_SHORT'
export const OUTSIDE_VIEWING_WINDOW = 'OUTSIDE_VIEWING_WINDOW'
export const AVAILABLE_FROM_REQUIRED = 'AVAILABLE_FROM_REQUIRED'

/** Predicate copied into get_public_marketplace_bootstrap (migration 027). */
export const PUBLIC_OCCUPIED_ADVERT_SQL = `u.advertise_while_occupied = true
          AND u.available_from IS NOT NULL
          AND upper(u.status_config_key) = 'OCCUPIED'
          AND lower(coalesce(u.listing_type, 'rent')) IN ('rent', 'both')`

/** Keys a public unit must never carry (tenant, lease or visitor PII, credentials). */
export const PUBLIC_UNIT_FORBIDDEN_KEYS = [
  'tenant_id',
  'tenant_name',
  'tenant_email',
  'tenant_phone',
  'lease_id',
  'lease_reference',
  'notice_given_at',
  'notice_given_by',
  'notice_end_date',
  'visitor_name',
  'visitor_email',
  'visitor_phone',
  'password_hash',
  'auth_user_id',
  'idempotency_key',
] as const

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type LeaseSpan = { start: string; end: string | null }

export type ViewingWindowInput = {
  weekday: number | null
  windowDate: string | null
  startTime: string
  endTime: string
}

type Row = Record<string, unknown>
type QueryFn = (sql: string, params?: unknown[]) => Promise<Row[]>

/** DB and scope access, injectable for tests (see leaseReminders deps). */
export type OccupiedDeps = {
  query: QueryFn
  resolveUuid: (type: EntityType, id: string) => Promise<string | null>
  assertUnitManageable: (actor: DemoActor, unitId: string) => Promise<{ clientId: string }>
  canPublish: (actor: DemoActor) => Promise<boolean>
  now: () => Date
}

export const defaultOccupiedDeps: OccupiedDeps = {
  query: (sql, params) => query(sql, params),
  resolveUuid,
  // Lazy: scopeGate -> portalWritePolicy -> writes -> occupiedListing is a cycle.
  assertUnitManageable: async (actor, unitId) => (await import('./scopeGate.js')).assertUnitManageable(actor, unitId),
  canPublish: async (actor) => (await import('./scopeGate.js')).actorStoredCan(actor, ['listings.publish']),
  now: () => new Date(),
}

function coded(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code })
}

export function addCalendarDays(iso: string, days: number): string {
  return isoAddDays(iso.slice(0, 10), days)
}

/** Add calendar months, clamping the day to the target month. */
export function addCalendarMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate()
  dt.setUTCDate(Math.min(d, last))
  return dt.toISOString().slice(0, 10)
}

export function formatDayMonth(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export function turnoverDaysFromSettings(settings: unknown): number {
  const raw = settings && typeof settings === 'object' ? (settings as { turnoverDays?: unknown }).turnoverDays : undefined
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 0) return 1
  return Math.floor(n)
}

type NoticePeriod = { unit: 'business_days' | 'calendar_months'; count: number }

function noticePeriodFromMetadata(metadata: unknown): NoticePeriod | null {
  if (!metadata || typeof metadata !== 'object') return null
  const raw = (metadata as { noticePeriod?: unknown }).noticePeriod
  if (!raw || typeof raw !== 'object') return null
  const unit = (raw as { unit?: unknown }).unit
  const count = Number((raw as { count?: unknown }).count)
  if ((unit !== 'business_days' && unit !== 'calendar_months') || !Number.isFinite(count) || count < 1) return null
  return { unit, count }
}

/**
 * Fixed-term notice is 20 SA business days after givenAt (CPA s14
 * cancellation; confirm with counsel), but never past the lease's own end.
 * Month-to-month (no end_date) is one calendar month unless
 * metadata.noticePeriod says otherwise.
 */
export function computeNoticeEndDate(input: {
  givenAt: string
  endDate: string | null
  metadata?: unknown
}): string {
  const given = input.givenAt.slice(0, 10)
  const custom = noticePeriodFromMetadata(input.metadata)
  let end: string
  if (custom?.unit === 'business_days') end = addSaBusinessDays(given, custom.count)
  else if (custom?.unit === 'calendar_months') end = addCalendarMonths(given, custom.count)
  else if (!input.endDate) end = addCalendarMonths(given, 1)
  else end = addSaBusinessDays(given, 20)
  const leaseEnd = input.endDate?.slice(0, 10)
  return leaseEnd && leaseEnd < end ? leaseEnd : end
}

export function computeAvailableFrom(input: {
  status: string
  endDate: string | null
  noticeEndDate: string | null
  noticeGivenAt?: string | null
  turnoverDays: number
  expectedAvailableFrom?: string | null
  expectedReason?: string | null
}): { availableFrom: string; reason: string } | { error: typeof AVAILABLE_FROM_REQUIRED } {
  const turnover = Number.isFinite(input.turnoverDays) ? input.turnoverDays : 1
  const notice = input.status === 'NOTICE' ? input.noticeEndDate : null
  const base = notice || input.endDate
  if (base) {
    const availableFrom = addCalendarDays(base, turnover)
    const reason = notice
      ? `Notice given ${formatDayMonth(input.noticeGivenAt ?? notice)}`
      : `Lease ends ${formatDayMonth(input.endDate!)}`
    return { availableFrom, reason }
  }
  // Month-to-month without notice: the agent must say when and why.
  const expected = input.expectedAvailableFrom?.slice(0, 10)
  const why = input.expectedReason?.trim()
  if (expected && why) return { availableFrom: expected, reason: why }
  return { error: AVAILABLE_FROM_REQUIRED }
}

/** Half-open [start, end+1). A null end runs to infinity. */
export function rangesOverlap(a: LeaseSpan, b: LeaseSpan): boolean {
  const aEnd = a.end ? addCalendarDays(a.end, 1) : '9999-12-31'
  const bEnd = b.end ? addCalendarDays(b.end, 1) : '9999-12-31'
  return a.start < bEnd && b.start < aEnd
}

export function successorStartAllowed(input: {
  start: string
  end: string | null
  availableFrom: string | null
  openLeases: LeaseSpan[]
}): boolean {
  if (input.availableFrom && input.start < input.availableFrom) return false
  return !input.openLeases.some((lease) => rangesOverlap({ start: input.start, end: input.end }, lease))
}

export function slotInsideWindows(slotDate: string, slotTime: string, windows: ViewingWindowInput[]): boolean {
  if (!windows.length) return false
  const time = slotTime.slice(0, 5)
  const day = new Date(`${slotDate.slice(0, 10)}T00:00:00Z`).getUTCDay()
  return windows.some((w) => {
    const start = w.startTime.slice(0, 5)
    const end = w.endTime.slice(0, 5)
    if (time < start || time >= end) return false
    if (w.windowDate) return w.windowDate.slice(0, 10) === slotDate.slice(0, 10)
    return w.weekday === day
  })
}

export function noticeHoursMet(startsAt: Date, now: Date, hours: number): boolean {
  const floor = Math.max(MIN_OCCUPIED_VIEWING_NOTICE_HOURS, hours)
  return startsAt.getTime() - now.getTime() >= floor * 60 * 60 * 1000
}

export function shouldClearAdvert(input: {
  advertising: boolean
  noticeWithdrawn?: boolean
  previousEnd?: string | null
  nextEnd?: string | null
  /** Lease lost its end date and is not on notice, so it is no longer coming free. */
  openEnded?: boolean
}): boolean {
  if (!input.advertising) return false
  if (input.noticeWithdrawn) return true
  if (input.openEnded) return true
  if (input.previousEnd && input.nextEnd && input.nextEnd > input.previousEnd) return true
  return false
}

/** The DB exclusion constraint fired (two writers raced past assertNoLeaseOverlap). */
export function leaseOverlapFromDbError(err: unknown): (Error & { status: number; code: string }) | null {
  if (!err || typeof err !== 'object') return null
  const e = err as { code?: unknown; constraint?: unknown }
  if (e.code === '23P01' && e.constraint === 'leases_no_date_overlap') {
    return coded(409, LEASE_OVERLAP, 'That start date overlaps the current lease')
  }
  return null
}

async function writeEvent(
  deps: OccupiedDeps,
  clientId: string,
  eventType: string,
  subjectType: string,
  subjectId: string,
  actor: DemoActor | null,
  payload: Record<string, unknown>,
) {
  const actorUuid = actor ? await actorUserUuid(deps, actor) : null
  await deps.query(
    `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, actor_user_id, payload)
     VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6::jsonb)`,
    [clientId, eventType, subjectType, subjectId, actorUuid, JSON.stringify(payload)],
  )
}

async function notifyUser(
  deps: OccupiedDeps,
  clientId: string,
  userId: string,
  title: string,
  body: string,
  linkPath: string,
  resourceType = 'unit',
) {
  await deps.query(
    `INSERT INTO notifications (client_id, user_id, title, body, link_path, resource_type, action_type)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 'updated')`,
    [clientId, userId, title, body, linkPath, resourceType],
  )
}

async function resolveOr(deps: OccupiedDeps, type: EntityType, id: string): Promise<string | null> {
  const mapped = await deps.resolveUuid(type, id)
  if (mapped) return mapped
  return isUuid(id) ? id : null
}

export async function resolveUnitUuid(id: string, deps: OccupiedDeps = defaultOccupiedDeps): Promise<string | null> {
  const fromUnit = await deps.resolveUuid('unit', id)
  if (fromUnit) return fromUnit
  return resolveOr(deps, 'property', id)
}

async function actorUserUuid(deps: OccupiedDeps, actor: DemoActor): Promise<string | null> {
  return resolveOr(deps, 'user', actor.userId)
}

async function currentTenantId(deps: OccupiedDeps, unitId: string): Promise<string | null> {
  const rows = await deps.query(
    `SELECT tenant_id::text AS tenant_id FROM leases
      WHERE unit_id = $1::uuid AND status IN ('ACTIVE', 'NOTICE')
      ORDER BY start_date DESC LIMIT 1`,
    [unitId],
  )
  return (rows[0]?.tenant_id as string | null | undefined) ?? null
}

export async function clearOccupiedAdvert(
  unitId: string,
  actor: DemoActor | null,
  reason: string,
  deps: OccupiedDeps = defaultOccupiedDeps,
): Promise<void> {
  const rows = await deps.query(
    `UPDATE units SET advertise_while_occupied = false, available_from = NULL, updated_at = NOW()
      WHERE id = $1::uuid AND advertise_while_occupied = true
      RETURNING client_id::text AS client_id`,
    [unitId],
  )
  const clientId = rows[0]?.client_id as string | undefined
  if (!clientId) return
  await writeEvent(deps, clientId, 'occupied_listing_withdrawn', 'unit', unitId, actor, { reason })
  const apps = await deps.query(
    `SELECT applicant_id::text AS applicant_id FROM applications
      WHERE unit_id = $1::uuid AND status IN ('SUBMITTED', 'UNDER_REVIEW', 'CREDIT_CHECK')`,
    [unitId],
  )
  for (const app of apps) {
    if (!app.applicant_id) continue
    await notifyUser(
      deps,
      clientId,
      String(app.applicant_id),
      'Listing withdrawn',
      'This home is no longer coming free, so it has been taken off the market.',
      '/workspace/portals/tenant/applications',
      'application',
    )
  }
}

/** Withdraw or recompute the occupied advert after a lease save. */
export async function syncAdvertAfterLeaseSave(
  input: {
    unitId: string
    previousStatus: string | null
    previousEnd: string | null
    nextStatus: string
    nextEnd: string | null
  },
  deps: OccupiedDeps = defaultOccupiedDeps,
): Promise<void> {
  const units = await deps.query(`SELECT advertise_while_occupied FROM units WHERE id = $1::uuid`, [input.unitId])
  if (!units[0]?.advertise_while_occupied) return
  const noticeWithdrawn = input.previousStatus === 'NOTICE' && input.nextStatus !== 'NOTICE'
  const openEnded = Boolean(input.previousEnd) && !input.nextEnd && input.nextStatus !== 'NOTICE'
  if (
    shouldClearAdvert({
      advertising: true,
      noticeWithdrawn,
      openEnded,
      previousEnd: input.previousEnd,
      nextEnd: input.nextEnd,
    })
  ) {
    const reason = noticeWithdrawn ? 'notice withdrawn' : openEnded ? 'lease no longer ending' : 'lease renewed'
    await clearOccupiedAdvert(input.unitId, null, reason, deps)
    return
  }
  if (input.nextStatus === 'NOTICE') return
  if (!input.previousEnd || !input.nextEnd || input.nextEnd >= input.previousEnd) return
  const settings = await deps.query(
    `SELECT c.settings FROM units u JOIN clients c ON c.id = u.client_id WHERE u.id = $1::uuid`,
    [input.unitId],
  )
  const computed = computeAvailableFrom({
    status: input.nextStatus,
    endDate: input.nextEnd,
    noticeEndDate: null,
    turnoverDays: turnoverDaysFromSettings(settings[0]?.settings),
  })
  if ('error' in computed) return
  await deps.query(`UPDATE units SET available_from = $2::date, updated_at = NOW() WHERE id = $1::uuid`, [
    input.unitId,
    computed.availableFrom,
  ])
}

export async function patchAdvertiseWhileOccupied(
  actor: DemoActor,
  unitRef: string,
  body: {
    enabled?: boolean
    expectedAvailableFrom?: string | null
    reason?: string | null
    photoMode?: 'CURRENT' | 'PRE_OCCUPATION' | null
  },
  deps: OccupiedDeps = defaultOccupiedDeps,
): Promise<{ advertiseWhileOccupied: boolean; availableFrom: string | null; reason: string | null; popiaWarning: string }> {
  const unitId = await resolveUnitUuid(unitRef, deps)
  if (!unitId) throw coded(404, 'NOT_FOUND', 'Unit not found')
  const access = await deps.assertUnitManageable(actor, unitId)
  if (actor.role !== 'super_admin' && actor.role !== 'landlord' && !(await deps.canPublish(actor))) {
    throw forbiddenError(`Forbidden: ${actor.role} ${actor.userId} cannot advertise this unit (missing listings.publish)`)
  }
  if (!body.enabled) {
    await clearOccupiedAdvert(unitId, actor, 'turned off', deps)
    return { advertiseWhileOccupied: false, availableFrom: null, reason: null, popiaWarning: POPIA_PHOTO_WARNING }
  }
  const leases = await deps.query(
    `SELECT l.status, l.end_date::text AS end_date, l.notice_end_date::text AS notice_end_date,
            l.notice_given_at::text AS notice_given_at, l.tenant_id::text AS tenant_id, c.settings
       FROM units u
       JOIN clients c ON c.id = u.client_id
       LEFT JOIN leases l ON l.unit_id = u.id AND l.status IN ('ACTIVE', 'NOTICE')
      WHERE u.id = $1::uuid
      ORDER BY l.start_date DESC NULLS LAST
      LIMIT 1`,
    [unitId],
  )
  const lease = leases[0]
  if (!lease?.status) throw coded(400, AVAILABLE_FROM_REQUIRED, 'An active or notice lease is required')
  const computed = computeAvailableFrom({
    status: String(lease.status),
    endDate: (lease.end_date as string | null) ?? null,
    noticeEndDate: (lease.notice_end_date as string | null) ?? null,
    noticeGivenAt: (lease.notice_given_at as string | null) ?? null,
    turnoverDays: turnoverDaysFromSettings(lease.settings),
    expectedAvailableFrom: body.expectedAvailableFrom,
    expectedReason: body.reason,
  })
  if ('error' in computed) {
    throw coded(400, AVAILABLE_FROM_REQUIRED, 'A month-to-month lease needs an expected available date and a reason')
  }
  await deps.query(
    `UPDATE units SET advertise_while_occupied = true, available_from = $2::date, updated_at = NOW() WHERE id = $1::uuid`,
    [unitId, computed.availableFrom],
  )
  await writeEvent(deps, access.clientId, 'listing_advertised_while_occupied', 'unit', unitId, actor, {
    availableFrom: computed.availableFrom,
    reason: computed.reason,
    advertisePhotoMode: body.photoMode === 'PRE_OCCUPATION' ? 'PRE_OCCUPATION' : 'CURRENT',
  })
  if (lease.tenant_id) {
    await notifyUser(
      deps,
      access.clientId,
      String(lease.tenant_id),
      'Your home is being advertised',
      `It is listed as available from ${formatDayMonth(computed.availableFrom)}. Set the times you can host viewings.`,
      '/workspace/portals/tenant',
    )
  }
  return {
    advertiseWhileOccupied: true,
    availableFrom: computed.availableFrom,
    reason: computed.reason,
    popiaWarning: POPIA_PHOTO_WARNING,
  }
}

export async function postLeaseNotice(
  actor: DemoActor,
  leaseRef: string,
  body: { givenBy?: string; givenAt?: string },
  deps: OccupiedDeps = defaultOccupiedDeps,
): Promise<{ noticeEndDate: string; status: 'NOTICE'; availableFrom: string | null }> {
  const leaseId = await resolveOr(deps, 'tenancy', leaseRef)
  if (!leaseId) throw coded(404, 'NOT_FOUND', 'Lease not found')
  const givenBy = body.givenBy === 'LANDLORD' ? 'LANDLORD' : body.givenBy === 'TENANT' ? 'TENANT' : null
  const givenAt = body.givenAt?.slice(0, 10)
  if (!givenBy || !givenAt || !/^\d{4}-\d{2}-\d{2}$/.test(givenAt)) {
    throw coded(400, 'NOTICE_INVALID', 'givenBy and givenAt are required')
  }
  const rows = await deps.query(
    `SELECT l.client_id::text AS client_id, l.unit_id::text AS unit_id, l.tenant_id::text AS tenant_id,
            l.status, l.end_date::text AS end_date, l.metadata, u.advertise_while_occupied, c.settings
       FROM leases l
       JOIN units u ON u.id = l.unit_id
       JOIN clients c ON c.id = l.client_id
      WHERE l.id = $1::uuid`,
    [leaseId],
  )
  const lease = rows[0]
  if (!lease) throw coded(404, 'NOT_FOUND', 'Lease not found')
  if (givenBy === 'TENANT') {
    const userUuid = await actorUserUuid(deps, actor)
    if (actor.role !== 'tenant' || !userUuid || userUuid !== lease.tenant_id) throw forbiddenError('Forbidden')
  } else {
    await deps.assertUnitManageable(actor, String(lease.unit_id))
  }
  if (lease.status !== 'ACTIVE') throw coded(409, 'NOTICE_INVALID', 'Notice can only be given on an active lease')
  const endDate = (lease.end_date as string | null) ?? null
  const noticeEndDate = computeNoticeEndDate({ givenAt, endDate, metadata: lease.metadata })
  // The lease now ends on the notice date, so leases_no_date_overlap and
  // assertNoLeaseOverlap let a successor start after it. The contract end is
  // kept in metadata.originalEndDate.
  await deps.query(
    `UPDATE leases SET status = 'NOTICE', notice_given_at = $2::date, notice_given_by = $3,
            notice_end_date = $4::date, end_date = $4::date,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('originalEndDate', $5::text),
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [leaseId, givenAt, givenBy, noticeEndDate, endDate],
  )
  await writeEvent(deps, String(lease.client_id), 'lease_notice_given', 'lease', leaseId, actor, {
    givenBy,
    givenAt,
    noticeEndDate,
  })
  let availableFrom: string | null = null
  if (lease.advertise_while_occupied) {
    const computed = computeAvailableFrom({
      status: 'NOTICE',
      endDate,
      noticeEndDate,
      turnoverDays: turnoverDaysFromSettings(lease.settings),
    })
    if (!('error' in computed)) {
      availableFrom = computed.availableFrom
      await deps.query(`UPDATE units SET available_from = $2::date, updated_at = NOW() WHERE id = $1::uuid`, [
        lease.unit_id,
        availableFrom,
      ])
    }
  }
  return { noticeEndDate, status: 'NOTICE', availableFrom }
}

async function loadLeaseForTenant(
  deps: OccupiedDeps,
  actor: DemoActor,
  leaseRef: string,
): Promise<{ id: string; client_id: string; unit_id: string }> {
  const leaseId = await resolveOr(deps, 'tenancy', leaseRef)
  if (!leaseId) throw coded(404, 'NOT_FOUND', 'Lease not found')
  const rows = await deps.query(
    `SELECT id::text AS id, client_id::text AS client_id, unit_id::text AS unit_id, tenant_id::text AS tenant_id
       FROM leases WHERE id = $1::uuid`,
    [leaseId],
  )
  const lease = rows[0]
  if (!lease) throw coded(404, 'NOT_FOUND', 'Lease not found')
  const userUuid = await actorUserUuid(deps, actor)
  if (actor.role !== 'tenant' || !userUuid || userUuid !== lease.tenant_id) throw forbiddenError('Forbidden')
  return { id: String(lease.id), client_id: String(lease.client_id), unit_id: String(lease.unit_id) }
}

function windowRows(rows: Row[]): ViewingWindowInput[] {
  return rows.map((r) => ({
    weekday: r.weekday == null ? null : Number(r.weekday),
    windowDate: (r.window_date as string | null) ?? null,
    startTime: String(r.start_time),
    endTime: String(r.end_time),
  }))
}

export async function getViewingWindows(
  actor: DemoActor,
  leaseRef: string,
  deps: OccupiedDeps = defaultOccupiedDeps,
): Promise<ViewingWindowInput[]> {
  const lease = await loadLeaseForTenant(deps, actor, leaseRef)
  const rows = await deps.query(
    `SELECT weekday, window_date::text AS window_date, start_time, end_time
       FROM tenant_viewing_windows WHERE lease_id = $1::uuid ORDER BY weekday NULLS LAST, window_date, start_time`,
    [lease.id],
  )
  return windowRows(rows)
}

export async function putViewingWindows(
  actor: DemoActor,
  leaseRef: string,
  windows: ViewingWindowInput[],
  deps: OccupiedDeps = defaultOccupiedDeps,
): Promise<ViewingWindowInput[]> {
  const lease = await loadLeaseForTenant(deps, actor, leaseRef)
  for (const w of windows) {
    const hasDay = w.weekday != null
    const hasDate = Boolean(w.windowDate)
    if (hasDay === hasDate) throw coded(400, 'WINDOW_INVALID', 'Each window needs a weekday or a date, not both')
    if (hasDay && (!Number.isInteger(w.weekday) || w.weekday! < 0 || w.weekday! > 6)) {
      throw coded(400, 'WINDOW_INVALID', 'Weekday must be 0 (Sunday) to 6 (Saturday)')
    }
    if (!w.startTime || !w.endTime || w.startTime.slice(0, 5) >= w.endTime.slice(0, 5)) {
      throw coded(400, 'WINDOW_INVALID', 'Window end must be after the start')
    }
  }
  await deps.query(`DELETE FROM tenant_viewing_windows WHERE lease_id = $1::uuid`, [lease.id])
  for (const w of windows) {
    await deps.query(
      `INSERT INTO tenant_viewing_windows (client_id, unit_id, lease_id, weekday, window_date, start_time, end_time)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::date, $6, $7)`,
      [lease.client_id, lease.unit_id, lease.id, w.weekday, w.windowDate, w.startTime.slice(0, 5), w.endTime.slice(0, 5)],
    )
  }
  return getViewingWindows(actor, leaseRef, deps)
}

/**
 * Viewing requests on the tenant's own home awaiting their answer. Date and
 * time only: the visitor's name and contact details stay with the agency.
 */
export async function listTenantViewingRequests(
  actor: DemoActor,
  leaseRef: string,
  deps: OccupiedDeps = defaultOccupiedDeps,
): Promise<Array<{ id: string; startsAt: string; tenantConsentStatus: string }>> {
  const lease = await loadLeaseForTenant(deps, actor, leaseRef)
  const rows = await deps.query(
    `SELECT id::text AS id, starts_at, tenant_consent_status
       FROM bookings
      WHERE unit_id = $1::uuid AND status = 'SCHEDULED' AND tenant_consent_status = 'PENDING'
        AND starts_at > NOW()
      ORDER BY starts_at`,
    [lease.unit_id],
  )
  return rows.map((r) => ({
    id: String(r.id),
    startsAt: new Date(r.starts_at as string).toISOString(),
    tenantConsentStatus: String(r.tenant_consent_status),
  }))
}

export function refuseOccupiedBooking(input: {
  occupiedAdvert: boolean
  noticeHours: number
  startsAt: Date
  now: Date
  slotDate: string
  slotTime: string
  windows: ViewingWindowInput[]
}): 'PENDING' | 'NOT_REQUIRED' {
  if (!input.occupiedAdvert) return 'NOT_REQUIRED'
  const hours = Math.max(MIN_OCCUPIED_VIEWING_NOTICE_HOURS, input.noticeHours || MIN_OCCUPIED_VIEWING_NOTICE_HOURS)
  if (!noticeHoursMet(input.startsAt, input.now, hours)) {
    throw coded(400, NOTICE_TOO_SHORT, `Viewings of an occupied home need at least ${hours} hours' notice`)
  }
  if (!slotInsideWindows(input.slotDate, input.slotTime, input.windows)) {
    throw coded(400, OUTSIDE_VIEWING_WINDOW, 'That time is outside the tenant’s viewing windows')
  }
  return 'PENDING'
}

/** Refuse a booking on an occupied advert that breaks the notice floor or the tenant's windows. */
export async function assertOccupiedBookingAllowed(
  unitId: string,
  slot: { date: string; time: string; startsAt: Date },
  deps: OccupiedDeps = defaultOccupiedDeps,
): Promise<'PENDING' | 'NOT_REQUIRED'> {
  const rows = await deps.query(
    `SELECT advertise_while_occupied, status_config_key, occupied_viewing_notice_hours
       FROM units WHERE id = $1::uuid`,
    [unitId],
  )
  const unit = rows[0]
  const occupiedAdvert =
    Boolean(unit?.advertise_while_occupied) && String(unit?.status_config_key ?? '').toUpperCase() === 'OCCUPIED'
  if (!occupiedAdvert) return 'NOT_REQUIRED'
  // Windows of the sitting tenant only, never a previous lease's.
  const windows = await deps.query(
    `SELECT w.weekday, w.window_date::text AS window_date, w.start_time, w.end_time
       FROM tenant_viewing_windows w
       JOIN leases l ON l.id = w.lease_id AND l.status IN ('ACTIVE', 'NOTICE')
      WHERE w.unit_id = $1::uuid`,
    [unitId],
  )
  return refuseOccupiedBooking({
    occupiedAdvert,
    noticeHours: Number(unit?.occupied_viewing_notice_hours) || MIN_OCCUPIED_VIEWING_NOTICE_HOURS,
    startsAt: slot.startsAt,
    now: deps.now(),
    slotDate: slot.date,
    slotTime: slot.time,
    windows: windowRows(windows),
  })
}

/** Mark a new booking as awaiting the sitting tenant and tell them. */
export async function markBookingTenantPending(
  bookingId: string,
  unitId: string,
  deps: OccupiedDeps = defaultOccupiedDeps,
): Promise<void> {
  const rows = await deps.query(
    `UPDATE bookings SET tenant_consent_status = 'PENDING', tenant_notified_at = NOW(), updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING client_id::text AS client_id`,
    [bookingId],
  )
  const clientId = rows[0]?.client_id as string | undefined
  if (!clientId) return
  const tenantId = await currentTenantId(deps, unitId)
  await writeEvent(deps, clientId, 'viewing_tenant_notified', 'booking', bookingId, null, { unitId })
  if (!tenantId) return
  await notifyUser(
    deps,
    clientId,
    tenantId,
    'Viewing requested',
    'Someone wants to view your home. Accept or decline the time.',
    '/workspace/portals/tenant',
    'viewing',
  )
}

export async function patchTenantBookingResponse(
  actor: DemoActor,
  bookingRef: string,
  body: { status?: string; proposedStartsAt?: string | null },
  deps: OccupiedDeps = defaultOccupiedDeps,
): Promise<{ status: 'ACCEPTED' | 'DECLINED' }> {
  const bookingId = await resolveOr(deps, 'viewing', bookingRef)
  if (!bookingId) throw coded(404, 'NOT_FOUND', 'Booking not found')
  const status = body.status === 'ACCEPTED' ? 'ACCEPTED' : body.status === 'DECLINED' ? 'DECLINED' : null
  if (!status) throw coded(400, 'RESPONSE_INVALID', 'status must be ACCEPTED or DECLINED')
  const rows = await deps.query(
    `SELECT b.client_id::text AS client_id, b.unit_id::text AS unit_id, b.agent_id::text AS agent_id,
            b.tenant_consent_status
       FROM bookings b WHERE b.id = $1::uuid`,
    [bookingId],
  )
  const booking = rows[0]
  if (!booking) throw coded(404, 'NOT_FOUND', 'Booking not found')
  const tenantId = await currentTenantId(deps, String(booking.unit_id))
  const userUuid = await actorUserUuid(deps, actor)
  if (actor.role !== 'tenant' || !userUuid || userUuid !== tenantId) throw forbiddenError('Forbidden')
  if (booking.tenant_consent_status === 'NOT_REQUIRED') {
    throw coded(409, 'RESPONSE_INVALID', 'This viewing does not need your answer')
  }
  const proposed = status === 'DECLINED' ? body.proposedStartsAt ?? null : null
  await deps.query(
    `UPDATE bookings SET tenant_consent_status = $2, tenant_proposed_starts_at = $3::timestamptz, updated_at = NOW()
      WHERE id = $1::uuid`,
    [bookingId, status, proposed],
  )
  await writeEvent(deps, String(booking.client_id), 'viewing_tenant_responded', 'booking', bookingId, actor, {
    status,
    proposedStartsAt: proposed,
  })
  if (booking.agent_id) {
    await notifyUser(
      deps,
      String(booking.client_id),
      String(booking.agent_id),
      status === 'ACCEPTED' ? 'Tenant accepted a viewing' : 'Tenant declined a viewing',
      status === 'ACCEPTED'
        ? 'The sitting tenant accepted the viewing time.'
        : 'The sitting tenant declined the viewing time. Offer another slot.',
      '/workspace/viewings',
      'viewing',
    )
  }
  return { status }
}

/** 409 LEASE_OVERLAP when a successor lease starts before available_from or overlaps an open lease. */
export async function assertNoLeaseOverlap(
  run: QueryFn,
  unitId: string,
  start: string,
  end: string | null,
  ignoreLeaseId?: string | null,
): Promise<void> {
  const unitRows = await run(`SELECT available_from::text AS available_from FROM units WHERE id = $1::uuid`, [unitId])
  const availableFrom = (unitRows[0]?.available_from as string | null) ?? null
  const open = await run(
    `SELECT start_date::text AS start_date, end_date::text AS end_date, id::text AS id
       FROM leases
      WHERE unit_id = $1::uuid AND status IN ('PENDING', 'ACTIVE', 'NOTICE')`,
    [unitId],
  )
  const spans: LeaseSpan[] = open
    .filter((row) => row.id !== ignoreLeaseId)
    .map((row) => ({ start: String(row.start_date), end: (row.end_date as string | null) ?? null }))
  if (!successorStartAllowed({ start, end, availableFrom, openLeases: spans })) {
    throw coded(409, LEASE_OVERLAP, 'That start date overlaps the current lease')
  }
}
