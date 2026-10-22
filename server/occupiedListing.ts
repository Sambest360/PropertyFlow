/**
 * Advertise a tenanted rental until a successor lease starts.
 * available_from is stored on the unit for the public marketplace RPC.
 */
import { query } from './db.js'
import { isUuid, resolveUuid } from './entityMap.js'
import type { DemoActor } from './actor.js'
import { addSaBusinessDays, isoAddDays } from './saPublicHolidays.js'

export const LEASE_OVERLAP = 'LEASE_OVERLAP'
export const NOTICE_TOO_SHORT = 'NOTICE_TOO_SHORT'
export const OUTSIDE_VIEWING_WINDOW = 'OUTSIDE_VIEWING_WINDOW'
export const AVAILABLE_FROM_REQUIRED = 'AVAILABLE_FROM_REQUIRED'

export const POPIA_PHOTO_WARNING =
  'Do not use photos that show the tenant, their family, or their belongings. Prefer photos taken before they moved in.'

/** Predicate copied into get_public_marketplace_bootstrap (migration 024). */
export const PUBLIC_OCCUPIED_ADVERT_SQL = `u.advertise_while_occupied = true
          AND u.available_from IS NOT NULL
          AND upper(u.status_config_key) = 'OCCUPIED'
          AND lower(coalesce(u.listing_type, 'rent')) IN ('rent', 'both')`

const TENANT_PII_KEYS = [
  'tenant_id',
  'tenant_name',
  'tenant_email',
  'tenant_phone',
  'visitor_name',
  'visitor_email',
  'visitor_phone',
  'password_hash',
] as const

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type LeaseSpan = { start: string; end: string | null }

export type ViewingWindowInput = {
  weekday: number | null
  windowDate: string | null
  startTime: string
  endTime: string
}

type QueryFn = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>

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
 * Fixed-term notice is 20 SA business days after givenAt (CPA cancellation;
 * confirm with counsel). Month-to-month (no end_date) is one calendar month
 * unless metadata.noticePeriod says otherwise.
 */
export function computeNoticeEndDate(input: {
  givenAt: string
  endDate: string | null
  metadata?: unknown
}): string {
  const custom = noticePeriodFromMetadata(input.metadata)
  if (custom?.unit === 'business_days') return addSaBusinessDays(input.givenAt.slice(0, 10), custom.count)
  if (custom?.unit === 'calendar_months') return addCalendarMonths(input.givenAt.slice(0, 10), custom.count)
  if (!input.endDate) return addCalendarMonths(input.givenAt.slice(0, 10), 1)
  return addSaBusinessDays(input.givenAt.slice(0, 10), 20)
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
  const floor = Math.max(24, hours)
  return startsAt.getTime() - now.getTime() >= floor * 60 * 60 * 1000
}

export function sanitizePublicUnit<T extends Record<string, unknown>>(unit: T): T {
  const out = { ...unit }
  for (const key of TENANT_PII_KEYS) delete out[key]
  return out
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

/** Withdraw or recompute the occupied advert after a lease save. */
export async function syncAdvertAfterLeaseSave(input: {
  unitId: string
  previousStatus: string | null
  previousEnd: string | null
  nextStatus: string
  nextEnd: string | null
}): Promise<void> {
  const units = await query<{ advertise_while_occupied: boolean }>(
    `SELECT advertise_while_occupied FROM units WHERE id = $1::uuid`,
    [input.unitId],
  )
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
    const reason = noticeWithdrawn
      ? 'notice withdrawn'
      : openEnded
        ? 'lease no longer ending'
        : 'lease end moved'
    await clearOccupiedAdvert(input.unitId, null, reason)
    return
  }
  if (input.nextStatus === 'NOTICE') return
  if (!input.previousEnd || !input.nextEnd || input.nextEnd >= input.previousEnd) return
  const settings = await query<{ settings: unknown }>(
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
  await query(`UPDATE units SET available_from = $2::date, updated_at = NOW() WHERE id = $1::uuid`, [
    input.unitId,
    computed.availableFrom,
  ])
}

export async function resolveUnitUuid(id: string): Promise<string | null> {
  const fromUnit = await resolveUuid('unit', id)
  if (fromUnit) return fromUnit
  const fromProperty = await resolveUuid('property', id)
  if (fromProperty) return fromProperty
  return isUuid(id) ? id : null
}

async function resolveLeaseUuid(id: string): Promise<string | null> {
  const mapped = await resolveUuid('tenancy', id)
  if (mapped) return mapped
  return isUuid(id) ? id : null
}

async function resolveBookingUuid(id: string): Promise<string | null> {
  const mapped = await resolveUuid('viewing', id)
  if (mapped) return mapped
  return isUuid(id) ? id : null
}

async function actorUserUuid(actor: DemoActor): Promise<string | null> {
  const mapped = await resolveUuid('user', actor.userId)
  if (mapped) return mapped
  return isUuid(actor.userId) ? actor.userId : null
}

const STAFF = new Set(['super_admin', 'client_admin', 'agent_admin', 'ground_agent', 'agent'])

async function assertCanManageUnit(actor: DemoActor, unitId: string): Promise<{ clientId: string; tenantId: string | null }> {
  const rows = await query<{
    client_id: string
    agent_id: string | null
    landlord_id: string | null
    tenant_id: string | null
  }>(
    `SELECT u.client_id::text AS client_id, u.agent_id::text AS agent_id, b.landlord_id::text AS landlord_id,
            (SELECT l.tenant_id::text FROM leases l
              WHERE l.unit_id = u.id AND l.status IN ('ACTIVE', 'NOTICE')
              ORDER BY l.start_date DESC LIMIT 1) AS tenant_id
       FROM units u
       JOIN buildings b ON b.id = u.building_id
      WHERE u.id = $1::uuid`,
    [unitId],
  )
  const row = rows[0]
  if (!row) throw coded(404, 'NOT_FOUND', 'Unit not found')
  if (actor.role === 'super_admin') return { clientId: row.client_id, tenantId: row.tenant_id }
  const userUuid = await actorUserUuid(actor)
  if (!userUuid) throw coded(403, 'FORBIDDEN', 'Forbidden')
  const actorRows = await query<{ client_id: string | null }>(
    `SELECT client_id::text AS client_id FROM users WHERE id = $1::uuid`,
    [userUuid],
  )
  const sameAgency = actorRows[0]?.client_id === row.client_id
  const isAgent = STAFF.has(actor.role) && actor.role !== 'client_admin' && actor.role !== 'super_admin'
  if (actor.role === 'client_admin' && sameAgency) return { clientId: row.client_id, tenantId: row.tenant_id }
  if (isAgent && sameAgency && row.agent_id === userUuid) return { clientId: row.client_id, tenantId: row.tenant_id }
  if (actor.role === 'landlord' && row.landlord_id === userUuid) return { clientId: row.client_id, tenantId: row.tenant_id }
  throw coded(403, 'FORBIDDEN', 'Forbidden')
}

async function writeEvent(clientId: string, eventType: string, subjectType: string, subjectId: string, actor: DemoActor, payload: Record<string, unknown>) {
  const actorUuid = await actorUserUuid(actor)
  await query(
    `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, actor_user_id, payload)
     VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6::jsonb)`,
    [clientId, eventType, subjectType, subjectId, actorUuid, JSON.stringify(payload)],
  )
}

async function notifyUser(clientId: string, userId: string, title: string, body: string, linkPath: string) {
  await query(
    `INSERT INTO notifications (client_id, user_id, title, body, link_path, resource_type, action_type)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'unit', 'updated')`,
    [clientId, userId, title, body, linkPath],
  )
}

export async function clearOccupiedAdvert(unitId: string, actor: DemoActor | null, reason: string): Promise<void> {
  const rows = await query<{ client_id: string; advertise_while_occupied: boolean }>(
    `UPDATE units SET advertise_while_occupied = false, available_from = NULL, updated_at = NOW()
      WHERE id = $1::uuid AND advertise_while_occupied = true
      RETURNING client_id::text AS client_id, advertise_while_occupied`,
    [unitId],
  )
  if (!rows[0]) return
  if (actor) {
    await writeEvent(rows[0].client_id, 'occupied_listing_withdrawn', 'unit', unitId, actor, { reason })
  } else {
    await query(
      `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, payload)
       VALUES ($1::uuid, 'occupied_listing_withdrawn', 'unit', $2::uuid, $3::jsonb)`,
      [rows[0].client_id, unitId, JSON.stringify({ reason })],
    )
  }
  const apps = await query<{ applicant_id: string | null }>(
    `SELECT applicant_id::text AS applicant_id FROM applications
      WHERE unit_id = $1::uuid AND status IN ('SUBMITTED', 'UNDER_REVIEW', 'CREDIT_CHECK')`,
    [unitId],
  )
  for (const app of apps) {
    if (!app.applicant_id) continue
    await notifyUser(
      rows[0].client_id,
      app.applicant_id,
      'Listing withdrawn',
      'This home is no longer being advertised while the current tenant stays.',
      '/workspace/portals/tenant/applications',
    )
  }
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
): Promise<{ advertiseWhileOccupied: boolean; availableFrom: string | null; reason: string | null; popiaWarning: string }> {
  const unitId = await resolveUnitUuid(unitRef)
  if (!unitId) throw coded(404, 'NOT_FOUND', 'Unit not found')
  const access = await assertCanManageUnit(actor, unitId)
  const enabled = Boolean(body.enabled)
  if (!enabled) {
    await clearOccupiedAdvert(unitId, actor, 'turned off')
    return { advertiseWhileOccupied: false, availableFrom: null, reason: null, popiaWarning: POPIA_PHOTO_WARNING }
  }
  const leases = await query<{
    status: string
    end_date: string | null
    notice_end_date: string | null
    notice_given_at: string | null
    settings: unknown
  }>(
    `SELECT l.status, l.end_date::text AS end_date, l.notice_end_date::text AS notice_end_date,
            l.notice_given_at::text AS notice_given_at, c.settings
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
    status: lease.status,
    endDate: lease.end_date,
    noticeEndDate: lease.notice_end_date,
    noticeGivenAt: lease.notice_given_at,
    turnoverDays: turnoverDaysFromSettings(lease.settings),
    expectedAvailableFrom: body.expectedAvailableFrom,
    expectedReason: body.reason,
  })
  if ('error' in computed) {
    throw coded(400, AVAILABLE_FROM_REQUIRED, 'A month-to-month lease needs an expected available date and a reason')
  }
  await query(
    `UPDATE units SET advertise_while_occupied = true, available_from = $2::date, updated_at = NOW() WHERE id = $1::uuid`,
    [unitId, computed.availableFrom],
  )
  await writeEvent(access.clientId, 'listing_advertised_while_occupied', 'unit', unitId, actor, {
    availableFrom: computed.availableFrom,
    reason: computed.reason,
    advertisePhotoMode: body.photoMode === 'PRE_OCCUPATION' ? 'PRE_OCCUPATION' : 'CURRENT',
  })
  if (access.tenantId) {
    await notifyUser(
      access.clientId,
      access.tenantId,
      'Your home is being advertised',
      `Viewings may be booked from ${formatDayMonth(computed.availableFrom)}. Set the times you can host them.`,
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
): Promise<{ noticeEndDate: string; status: 'NOTICE' }> {
  const leaseId = await resolveLeaseUuid(leaseRef)
  if (!leaseId) throw coded(404, 'NOT_FOUND', 'Lease not found')
  const givenBy = body.givenBy === 'LANDLORD' ? 'LANDLORD' : body.givenBy === 'TENANT' ? 'TENANT' : null
  const givenAt = body.givenAt?.slice(0, 10)
  if (!givenBy || !givenAt) throw coded(400, 'NOTICE_INVALID', 'givenBy and givenAt are required')
  const rows = await query<{
    client_id: string
    unit_id: string
    tenant_id: string | null
    end_date: string | null
    metadata: unknown
    advertise_while_occupied: boolean
  }>(
    `SELECT l.client_id::text AS client_id, l.unit_id::text AS unit_id, l.tenant_id::text AS tenant_id,
            l.end_date::text AS end_date, l.metadata, u.advertise_while_occupied
       FROM leases l JOIN units u ON u.id = l.unit_id
      WHERE l.id = $1::uuid`,
    [leaseId],
  )
  const lease = rows[0]
  if (!lease) throw coded(404, 'NOT_FOUND', 'Lease not found')
  const userUuid = await actorUserUuid(actor)
  if (givenBy === 'TENANT') {
    if (actor.role !== 'tenant' || userUuid !== lease.tenant_id) throw coded(403, 'FORBIDDEN', 'Forbidden')
  } else {
    await assertCanManageUnit(actor, lease.unit_id)
  }
  const noticeEndDate = computeNoticeEndDate({
    givenAt,
    endDate: lease.end_date,
    metadata: lease.metadata,
  })
  await query(
    `UPDATE leases SET status = 'NOTICE', notice_given_at = $2::date, notice_given_by = $3,
            notice_end_date = $4::date, updated_at = NOW()
      WHERE id = $1::uuid`,
    [leaseId, givenAt, givenBy, noticeEndDate],
  )
  await writeEvent(lease.client_id, 'lease_notice_given', 'lease', leaseId, actor, { givenBy, givenAt, noticeEndDate })
  if (lease.advertise_while_occupied) {
    const settings = await query<{ settings: unknown }>(`SELECT settings FROM clients WHERE id = $1::uuid`, [lease.client_id])
    const computed = computeAvailableFrom({
      status: 'NOTICE',
      endDate: lease.end_date,
      noticeEndDate,
      turnoverDays: turnoverDaysFromSettings(settings[0]?.settings),
    })
    if (!('error' in computed)) {
      await query(`UPDATE units SET available_from = $2::date, updated_at = NOW() WHERE id = $1::uuid`, [
        lease.unit_id,
        computed.availableFrom,
      ])
    }
  }
  return { noticeEndDate, status: 'NOTICE' }
}

export async function getViewingWindows(actor: DemoActor, leaseRef: string): Promise<ViewingWindowInput[]> {
  const lease = await loadLeaseForTenant(actor, leaseRef)
  const rows = await query<{ weekday: number | null; window_date: string | null; start_time: string; end_time: string }>(
    `SELECT weekday, window_date::text AS window_date, start_time, end_time
       FROM tenant_viewing_windows WHERE lease_id = $1::uuid ORDER BY weekday NULLS LAST, window_date, start_time`,
    [lease.id],
  )
  return rows.map((r) => ({
    weekday: r.weekday,
    windowDate: r.window_date,
    startTime: r.start_time,
    endTime: r.end_time,
  }))
}

export async function putViewingWindows(actor: DemoActor, leaseRef: string, windows: ViewingWindowInput[]): Promise<ViewingWindowInput[]> {
  const lease = await loadLeaseForTenant(actor, leaseRef)
  for (const w of windows) {
    const hasDay = w.weekday != null
    const hasDate = Boolean(w.windowDate)
    if (hasDay === hasDate) throw coded(400, 'WINDOW_INVALID', 'Each window needs a weekday or a date, not both')
    if (!w.startTime || !w.endTime || w.startTime.slice(0, 5) >= w.endTime.slice(0, 5)) {
      throw coded(400, 'WINDOW_INVALID', 'Window end must be after the start')
    }
  }
  await query(`DELETE FROM tenant_viewing_windows WHERE lease_id = $1::uuid`, [lease.id])
  for (const w of windows) {
    await query(
      `INSERT INTO tenant_viewing_windows (client_id, unit_id, lease_id, weekday, window_date, start_time, end_time)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::date, $6, $7)`,
      [lease.client_id, lease.unit_id, lease.id, w.weekday, w.windowDate, w.startTime.slice(0, 5), w.endTime.slice(0, 5)],
    )
  }
  return getViewingWindows(actor, leaseRef)
}

async function loadLeaseForTenant(actor: DemoActor, leaseRef: string): Promise<{ id: string; client_id: string; unit_id: string; tenant_id: string | null }> {
  const leaseId = await resolveLeaseUuid(leaseRef)
  if (!leaseId) throw coded(404, 'NOT_FOUND', 'Lease not found')
  const rows = await query<{ id: string; client_id: string; unit_id: string; tenant_id: string | null }>(
    `SELECT id::text AS id, client_id::text AS client_id, unit_id::text AS unit_id, tenant_id::text AS tenant_id
       FROM leases WHERE id = $1::uuid`,
    [leaseId],
  )
  const lease = rows[0]
  if (!lease) throw coded(404, 'NOT_FOUND', 'Lease not found')
  const userUuid = await actorUserUuid(actor)
  if (actor.role !== 'tenant' || !userUuid || userUuid !== lease.tenant_id) throw coded(403, 'FORBIDDEN', 'Forbidden')
  return lease
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
  const hours = Math.max(24, input.noticeHours || 24)
  if (!noticeHoursMet(input.startsAt, input.now, hours)) {
    throw coded(400, NOTICE_TOO_SHORT, `Viewings of an occupied home need at least ${hours} hours' notice`)
  }
  if (!slotInsideWindows(input.slotDate, input.slotTime, input.windows)) {
    throw coded(400, OUTSIDE_VIEWING_WINDOW, 'That time is outside the tenant’s viewing windows')
  }
  return 'PENDING'
}

export async function assertOccupiedBookingAllowed(
  unitId: string,
  slot: { date: string; time: string; startsAt: Date },
  now = new Date(),
): Promise<'PENDING' | 'NOT_REQUIRED'> {
  const rows = await query<{
    advertise_while_occupied: boolean
    status_config_key: string
    occupied_viewing_notice_hours: number
  }>(
    `SELECT advertise_while_occupied, status_config_key, occupied_viewing_notice_hours
       FROM units WHERE id = $1::uuid`,
    [unitId],
  )
  const unit = rows[0]
  const occupiedAdvert = Boolean(unit?.advertise_while_occupied) && String(unit?.status_config_key ?? '').toUpperCase() === 'OCCUPIED'
  if (!occupiedAdvert) return 'NOT_REQUIRED'
  const windows = await query<{ weekday: number | null; window_date: string | null; start_time: string; end_time: string }>(
    `SELECT weekday, window_date::text AS window_date, start_time, end_time
       FROM tenant_viewing_windows WHERE unit_id = $1::uuid`,
    [unitId],
  )
  return refuseOccupiedBooking({
    occupiedAdvert,
    noticeHours: Number(unit?.occupied_viewing_notice_hours) || 24,
    startsAt: slot.startsAt,
    now,
    slotDate: slot.date,
    slotTime: slot.time,
    windows: windows.map((w) => ({
      weekday: w.weekday,
      windowDate: w.window_date,
      startTime: w.start_time,
      endTime: w.end_time,
    })),
  })
}

export async function markBookingTenantPending(bookingId: string, unitId: string): Promise<void> {
  const rows = await query<{ client_id: string; tenant_id: string | null }>(
    `UPDATE bookings SET tenant_consent_status = 'PENDING', tenant_notified_at = NOW(), updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING client_id::text AS client_id,
                (SELECT tenant_id::text FROM leases l
                  WHERE l.unit_id = bookings.unit_id AND l.status IN ('ACTIVE', 'NOTICE')
                  ORDER BY l.start_date DESC LIMIT 1) AS tenant_id`,
    [bookingId],
  )
  const row = rows[0]
  if (!row?.tenant_id) return
  await query(
    `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, payload)
     VALUES ($1::uuid, 'viewing_tenant_notified', 'booking', $2::uuid, $3::jsonb)`,
    [row.client_id, bookingId, JSON.stringify({ unitId })],
  )
  await notifyUser(
    row.client_id,
    row.tenant_id,
    'Viewing requested',
    'Someone wants to view your home. Accept or decline the time.',
    '/workspace/portals/tenant',
  )
}

export async function patchTenantBookingResponse(
  actor: DemoActor,
  bookingRef: string,
  body: { status?: string; proposedStartsAt?: string | null },
): Promise<{ status: 'ACCEPTED' | 'DECLINED' }> {
  const bookingId = await resolveBookingUuid(bookingRef)
  if (!bookingId) throw coded(404, 'NOT_FOUND', 'Booking not found')
  const status = body.status === 'ACCEPTED' ? 'ACCEPTED' : body.status === 'DECLINED' ? 'DECLINED' : null
  if (!status) throw coded(400, 'RESPONSE_INVALID', 'status must be ACCEPTED or DECLINED')
  const rows = await query<{ client_id: string; unit_id: string; tenant_id: string | null }>(
    `SELECT b.client_id::text AS client_id, b.unit_id::text AS unit_id,
            (SELECT l.tenant_id::text FROM leases l
              WHERE l.unit_id = b.unit_id AND l.status IN ('ACTIVE', 'NOTICE')
              ORDER BY l.start_date DESC LIMIT 1) AS tenant_id
       FROM bookings b WHERE b.id = $1::uuid`,
    [bookingId],
  )
  const booking = rows[0]
  if (!booking) throw coded(404, 'NOT_FOUND', 'Booking not found')
  const userUuid = await actorUserUuid(actor)
  if (actor.role !== 'tenant' || !userUuid || userUuid !== booking.tenant_id) throw coded(403, 'FORBIDDEN', 'Forbidden')
  await query(
    `UPDATE bookings SET tenant_consent_status = $2, tenant_proposed_starts_at = $3::timestamptz, updated_at = NOW()
      WHERE id = $1::uuid`,
    [bookingId, status, status === 'DECLINED' ? body.proposedStartsAt ?? null : null],
  )
  await writeEvent(booking.client_id, 'viewing_tenant_responded', 'booking', bookingId, actor, {
    status,
    proposedStartsAt: body.proposedStartsAt ?? null,
  })
  return { status }
}

export async function assertNoLeaseOverlap(
  run: QueryFn,
  unitId: string,
  start: string,
  end: string | null,
  ignoreLeaseId?: string | null,
): Promise<void> {
  const unitRows = await run(
    `SELECT available_from::text AS available_from FROM units WHERE id = $1::uuid`,
    [unitId],
  )
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
