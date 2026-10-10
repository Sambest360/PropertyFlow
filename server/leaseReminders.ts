/**
 * Lease end-date reminders (daily Vercel cron, GET /api/cron/lease-reminders).
 *
 * - Fixed-term leases only: status ACTIVE/NOTICE, client_id + end_date set, and not
 *   flagged periodic via leases.metadata.renewalOps.election = 'month_to_month'.
 * - Bands: 80 and 45 SA business days before end_date (SAST, weekends + SA public
 *   holidays skipped). Only the current band fires, once; a missed higher band is
 *   never backfilled.
 * - Dedup: event_log (event_type lease_end_reminder, payload.dedup_key
 *   lease_end:<uuid>:<end_date>:<band>) under pg_advisory_xact_lock in one transaction
 *   with the notifications. A new end_date (renewal) re-arms.
 * - Recipients: lease agent (round-trip id, same agency), agency admins holding
 *   users.manage in that client_id, and the landlord. Never the tenant or another agency.
 */
import { timingSafeEqual } from 'node:crypto'
import type pg from 'pg'
import { effectiveCan } from '../src/lib/permissions.js'
import type { Permission, Role } from '../src/types/domain.js'
import {
  SA_HOLIDAY_LIST_END,
  isoAddDays,
  saBusinessDaysBetween,
  subtractSaBusinessDays,
} from './saPublicHolidays.js'

export const LEASE_REMINDER_BANDS = [80, 45] as const
export type LeaseReminderBand = (typeof LEASE_REMINDER_BANDS)[number]
export const LEASE_REMINDER_BATCH_SIZE = 200
/** CPA s14(2)(c): notice window is 80 to 40 business days before expiry. */
export const CPA_WINDOW_OPEN_BD = 80
export const CPA_WINDOW_CLOSE_BD = 40
/** Calendar-day prefilter; 80 SA business days is always well under this. */
const PREFILTER_CALENDAR_DAYS = 130

type QueryFn = <T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<T[]>

type TxClient = Pick<pg.PoolClient, 'query'>

export type LeaseReminderDeps = {
  query: QueryFn
  withTransaction: <T>(fn: (client: TxClient) => Promise<T>) => Promise<T>
  resolveFrontendId: (type: 'user' | 'tenancy', backendId: string) => Promise<string | null>
  resolveUuid: (type: 'user', frontendId: string) => Promise<string | null>
  sendEmail?: (input: { email: string; name?: string; title: string; body: string }) => Promise<unknown>
  emailEnabled?: () => boolean
  todayIso?: () => string
  log?: (msg: string, err?: unknown) => void
  warn?: (msg: string) => void
}

export type LeaseReminderResult = { ok: true; checked: number; created: number; skipped: number }

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** 503 when CRON_SECRET unset, 401 on bad header, null when authorised. */
export function checkCronAuth(
  authorization: string | null | undefined,
  secret: string | null | undefined,
): 503 | 401 | null {
  const s = (secret ?? '').trim()
  if (!s) return 503
  const header = authorization ?? ''
  const expected = Buffer.from(`Bearer ${s}`, 'utf8')
  const got = Buffer.from(header, 'utf8')
  if (got.length !== expected.length) return 401
  return timingSafeEqual(got, expected) ? null : 401
}

export async function handleLeaseRemindersCron(
  authorization: string | null | undefined,
  secret: string | null | undefined,
  deps: LeaseReminderDeps,
): Promise<{ status: 200 | 401 | 500 | 503; body: Record<string, unknown> }> {
  const denied = checkCronAuth(authorization, secret)
  if (denied === 503) return { status: 503, body: { ok: false, error: 'cron_not_configured' } }
  if (denied === 401) return { status: 401, body: { ok: false, error: 'unauthorized' } }
  try {
    const result = await runLeaseReminders(deps)
    return { status: 200, body: result }
  } catch (err) {
    ;(deps.log ?? defaultLog)('[lease-reminders] run failed', err)
    return { status: 500, body: { ok: false, error: 'run_failed' } }
  }
}

// ---------------------------------------------------------------------------
// Dates + copy
// ---------------------------------------------------------------------------

export function sastTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** D MMM YYYY, e.g. 3 Apr 2026. */
export function formatDMMMYYYY(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** Current band for N business days left, or null when outside both bands. */
export function currentBand(businessDaysLeft: number): LeaseReminderBand | null {
  if (businessDaysLeft <= 0) return null
  if (businessDaysLeft <= 45) return 45
  if (businessDaysLeft <= 80) return 80
  return null
}

export function dedupKey(leaseId: string, endDateIso: string, band: LeaseReminderBand): string {
  return `lease_end:${leaseId}:${endDateIso}:${band}bd`
}

export function buildReminderCopy(input: {
  propertyLabel: string
  leaseReference: string
  endDateIso: string
  businessDaysLeft: number
  band: LeaseReminderBand
}): { title: string; body: string } {
  const title = `Lease ends in ${input.businessDaysLeft} business days`
  const lines = [
    `${input.propertyLabel} (lease ${input.leaseReference}) ends on ${formatDMMMYYYY(input.endDateIso)}.`,
  ]
  if (input.businessDaysLeft >= CPA_WINDOW_CLOSE_BD) {
    const open = subtractSaBusinessDays(input.endDateIso, CPA_WINDOW_OPEN_BD)
    const close = subtractSaBusinessDays(input.endDateIso, CPA_WINDOW_CLOSE_BD)
    lines.push(
      `Tenant expiry notice: send between ${formatDMMMYYYY(open)} and ${formatDMMMYYYY(close)} if the Consumer Protection Act applies to this lease.`,
    )
  }
  if (input.band === 45) {
    lines.push('Plan the joint outgoing inspection with the tenant before the lease ends.')
  }
  return { title, body: lines.join('\n') }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

type LeaseRow = {
  id: string
  client_id: string
  end_date: string
  landlord_id: string | null
  agent_id: string | null
  tenant_id: string | null
  lease_reference: string
  unit_number: string | null
  building_name: string | null
  unit_client_id: string | null
  building_client_id: string | null
}

type UserRow = {
  id: string
  client_id: string | null
  role: string
  email: string | null
  first_name: string | null
  metadata: Record<string, unknown> | null
}

const DB_TO_FE_ROLE: Record<string, Role> = {
  AGENCY_ADMIN: 'client_admin',
  AGENT_ADMIN: 'agent_admin',
}

export const LEASE_BATCH_SQL = `SELECT l.id::text AS id, l.client_id::text AS client_id, l.end_date::text AS end_date,
       l.landlord_id::text AS landlord_id, l.agent_id::text AS agent_id, l.tenant_id::text AS tenant_id,
       l.lease_reference, u.unit_number, b.name AS building_name,
       u.client_id::text AS unit_client_id, b.client_id::text AS building_client_id
  FROM leases l
  JOIN units u ON u.id = l.unit_id
  JOIN buildings b ON b.id = u.building_id
 WHERE l.status IN ('ACTIVE', 'NOTICE')
   AND l.client_id IS NOT NULL
   AND l.end_date IS NOT NULL
   AND l.end_date > $1::date
   AND l.end_date <= $2::date
   AND COALESCE(l.metadata->'renewalOps'->>'election', '') <> 'month_to_month'
   AND ($3::uuid IS NULL OR l.id > $3::uuid)
 ORDER BY l.id
 LIMIT ${LEASE_REMINDER_BATCH_SIZE}`

function defaultLog(msg: string, err?: unknown) {
  console.error(msg, err instanceof Error ? err.message : err ?? '')
}

export async function runLeaseReminders(deps: LeaseReminderDeps): Promise<LeaseReminderResult> {
  const today = (deps.todayIso ?? (() => sastTodayIso()))()
  const horizon = isoAddDays(today, PREFILTER_CALENDAR_DAYS)
  const log = deps.log ?? defaultLog
  if (horizon > SA_HOLIDAY_LIST_END) {
    ;(deps.warn ?? ((m: string) => console.warn(m)))(
      `[lease-reminders] SA public holiday list ends ${SA_HOLIDAY_LIST_END}; extend server/saPublicHolidays.ts (business days past it skip weekends only)`,
    )
  }
  let checked = 0
  let created = 0
  let cursor: string | null = null

  for (;;) {
    const rows: LeaseRow[] = await deps.query<LeaseRow>(LEASE_BATCH_SQL, [today, horizon, cursor])
    for (const lease of rows) {
      checked++
      try {
        if (await processLease(lease, today, deps)) created++
      } catch (err) {
        log(`[lease-reminders] lease ${lease.id} failed`, err)
      }
    }
    if (rows.length < LEASE_REMINDER_BATCH_SIZE) break
    cursor = rows[rows.length - 1].id
  }
  return { ok: true, checked, created, skipped: checked - created }
}

async function resolveRecipients(lease: LeaseRow, deps: LeaseReminderDeps): Promise<UserRow[]> {
  const ids = [lease.agent_id, lease.landlord_id].filter((x): x is string => Boolean(x))
  const users = await deps.query<UserRow>(
    `SELECT id::text AS id, client_id::text AS client_id, role, email, first_name, metadata
       FROM users
      WHERE active = TRUE
        AND ((client_id = $1::uuid AND role IN ('AGENCY_ADMIN', 'AGENT_ADMIN')) OR id = ANY($2::uuid[]))`,
    [lease.client_id, ids],
  )
  // Agency module pack (clients.settings.enabledPermissions) intersects admin permissions.
  // Not persisted today (bootstrap sends null -> AppStore defaults), so absent = no restriction.
  const clientRows = await deps.query<{ enabled: unknown }>(
    `SELECT settings->'enabledPermissions' AS enabled FROM clients WHERE id = $1::uuid`,
    [lease.client_id],
  )
  const agencyEnabledRaw = clientRows[0]?.enabled
  const agencyEnabled = Array.isArray(agencyEnabledRaw) ? (agencyEnabledRaw as Permission[]) : undefined
  const out = new Map<string, UserRow>()
  const propertyInAgency =
    lease.unit_client_id === lease.client_id && lease.building_client_id === lease.client_id

  for (const u of users) {
    if (u.id === lease.tenant_id || u.role === 'END_USER') continue
    if (u.id === lease.agent_id && u.client_id === lease.client_id) {
      const fe = await deps.resolveFrontendId('user', u.id)
      const back = fe ? await deps.resolveUuid('user', fe) : null
      if (back === u.id) out.set(u.id, u)
    }
    if (u.client_id === lease.client_id && DB_TO_FE_ROLE[u.role]) {
      const enabled = u.metadata?.enabledPermissions
      const can = effectiveCan(
        DB_TO_FE_ROLE[u.role],
        'users.manage',
        agencyEnabled,
        Array.isArray(enabled) ? (enabled as Permission[]) : undefined,
      )
      if (can) out.set(u.id, u)
    }
    if (
      u.id === lease.landlord_id &&
      u.role === 'LANDLORD' &&
      propertyInAgency &&
      (u.client_id === null || u.client_id === lease.client_id)
    ) {
      out.set(u.id, u)
    }
  }
  return [...out.values()]
}

async function processLease(lease: LeaseRow, today: string, deps: LeaseReminderDeps): Promise<boolean> {
  const endIso = lease.end_date.slice(0, 10)
  const bd = saBusinessDaysBetween(today, endIso)
  const band = currentBand(bd)
  if (!band) return false

  const recipients = await resolveRecipients(lease, deps)
  if (recipients.length === 0) return false

  const key = dedupKey(lease.id, endIso, band)
  const propertyLabel = [lease.building_name, lease.unit_number ? `unit ${lease.unit_number}` : null]
    .filter(Boolean)
    .join(', ') || 'Property'
  const copy = buildReminderCopy({
    propertyLabel,
    leaseReference: lease.lease_reference,
    endDateIso: endIso,
    businessDaysLeft: bd,
    band,
  })
  const tenancyFe = (await deps.resolveFrontendId('tenancy', lease.id)) ?? lease.id
  const linkPath = `/leases?tenancy=${encodeURIComponent(tenancyFe)}`

  const inserted = await deps.withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key])
    const existing = await client.query(
      `SELECT 1 FROM event_log WHERE event_type = 'lease_end_reminder' AND payload->>'dedup_key' = $1 LIMIT 1`,
      [key],
    )
    if (existing.rows.length > 0) return false
    await client.query(
      `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, payload)
       VALUES ($1::uuid, 'lease_end_reminder', 'lease', $2::uuid, $3::jsonb)`,
      [
        lease.client_id,
        lease.id,
        JSON.stringify({
          dedup_key: key,
          band: `${band}bd`,
          business_days: bd,
          end_date: endIso,
          recipients: recipients.map((r) => r.id),
        }),
      ],
    )
    for (const r of recipients) {
      await client.query(
        `INSERT INTO notifications (client_id, user_id, title, body, link_path, resource_type, action_type)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'lease', 'reminder')`,
        [lease.client_id, r.id, copy.title, copy.body, linkPath],
      )
    }
    return true
  })
  if (!inserted) return false

  // Best effort, after COMMIT: failures are logged only.
  if (deps.sendEmail && (deps.emailEnabled?.() ?? false)) {
    for (const r of recipients) {
      if (!r.email) continue
      try {
        await deps.sendEmail({ email: r.email, name: r.first_name ?? undefined, ...copy })
      } catch (err) {
        ;(deps.log ?? defaultLog)(`[lease-reminders] email failed for lease ${lease.id}`, err)
      }
    }
  }
  return true
}
