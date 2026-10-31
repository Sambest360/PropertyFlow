/**
 * Admin dashboard: read-only aggregates for GET /api/admin/dashboard and the
 * people list behind the Access tab (GET /api/admin/access).
 *
 * Scope is decided here, never by the page:
 * - super_admin: every agency (platform scope).
 * - client_admin / agent_admin: their own agency only (client_id = theirs).
 * - every other role: 403.
 * Each section is computed only when the viewer effectively holds one of its
 * permissions (src/lib/adminDashboardAccess.ts); the rest are left out of the
 * response. Everything is COUNT / SUM / GROUP BY in SQL, no writes.
 */
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Permission, Role } from '../src/types/domain.js'
import { normalizeStoredPermissions, roleLabels } from '../src/lib/permissions.js'
import {
  canOpenAdminDashboard,
  effectivePermissionSet,
  visibleDashboardSections,
  type DashboardSectionId,
} from '../src/lib/adminDashboardAccess.js'
import type { DemoActor } from './actor.js'
import { query } from './db.js'
import { resolveUuid, staticFrontendId } from './entityMap.js'
import { agencyFeForClient, enrichActor } from './scopeGate.js'
import { COLLECTION_PERMISSIONS, WRITE_PERMISSION } from './permissionGate.js'

const TZ = 'Africa/Johannesburg'
/** Units the marketplace counts as listed (same rule as server/unitsFeed.ts). */
const LISTED_STATUSES = `('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE')`
const OPEN_APPLICATION = `('SUBMITTED', 'UNDER_REVIEW', 'CREDIT_CHECK')`
const OPEN_TICKET = `('OPEN', 'TRIAGED', 'IN_PROGRESS', 'AWAITING_PARTS')`
/** An application waiting longer than this needs attention. */
export const STALE_APPLICATION_DAYS = 7
export const TREND_DAYS = 90

export type DashboardScope =
  | { kind: 'platform'; clientUuid: null; agencyId: null; agencyName: null }
  | { kind: 'agency'; clientUuid: string; agencyId: string; agencyName: string | null }

export type DashboardViewer = {
  actor: DemoActor
  role: Role
  scope: DashboardScope
  permissions: Set<Permission>
  sections: DashboardSectionId[]
}

function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code })
}

function storedList(v: unknown, version: unknown): Permission[] | null {
  const list = Array.isArray(v) && v.length ? v.filter((p) => typeof p === 'string') : null
  return normalizeStoredPermissions(list, version)
}

/**
 * Who is asking and what they may see. 403 for roles that cannot open the
 * dashboard and for agency admins with no agency on their account.
 */
export async function resolveDashboardViewer(raw: DemoActor): Promise<DashboardViewer> {
  const role = raw.role as Role
  if (!canOpenAdminDashboard(role)) {
    throw httpError(403, 'DASHBOARD_FORBIDDEN', 'The admin dashboard is for super admins and agency administrators.')
  }
  const actor = await enrichActor(raw)
  if (role === 'super_admin') {
    const permissions = effectivePermissionSet('super_admin', null, null)
    return {
      actor,
      role,
      scope: { kind: 'platform', clientUuid: null, agencyId: null, agencyName: null },
      permissions,
      sections: visibleDashboardSections(role, (p) => permissions.has(p)),
    }
  }
  const clientUuid = actor.agencyId ? await resolveUuid('agency', actor.agencyId) : null
  if (!clientUuid) throw httpError(403, 'NO_AGENCY', 'No agency on this account.')
  const agencyRows = await query<{ name: string | null; enabled: unknown; version: unknown }>(
    `SELECT COALESCE(NULLIF(trading_as, ''), company_name) AS name,
            settings->'enabledPermissions' AS enabled, settings->'permissionsVersion' AS version
       FROM clients WHERE id = $1::uuid LIMIT 1`,
    [clientUuid],
  )
  if (!agencyRows[0]) throw httpError(403, 'NO_AGENCY', 'No agency on this account.')
  const userUuid = await resolveUuid('user', actor.userId)
  const userRows = userUuid
    ? await query<{ enabled: unknown; version: unknown }>(
        `SELECT metadata->'enabledPermissions' AS enabled, metadata->'permissionsVersion' AS version
           FROM users WHERE id = $1::uuid LIMIT 1`,
        [userUuid],
      )
    : []
  const permissions = effectivePermissionSet(
    role,
    storedList(agencyRows[0].enabled, agencyRows[0].version),
    storedList(userRows[0]?.enabled, userRows[0]?.version),
  )
  return {
    actor,
    role,
    scope: {
      kind: 'agency',
      clientUuid,
      agencyId: (await agencyFeForClient(clientUuid)) ?? actor.agencyId ?? clientUuid,
      agencyName: agencyRows[0].name,
    },
    permissions,
    sections: visibleDashboardSections(role, (p) => permissions.has(p)),
  }
}

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}
const money = (v: unknown): number => Math.round(n(v) * 100) / 100

/** DB role → app role (AGENCY_ADMIN is the principal, see server/auth.ts ROLE_TO_DB). */
const DB_ROLE: Record<string, Role> = {
  SUPER_ADMIN: 'super_admin',
  AGENCY_ADMIN: 'client_admin',
  AGENT_ADMIN: 'agent_admin',
  GROUND_AGENT: 'ground_agent',
  LANDLORD: 'landlord',
  END_USER: 'tenant',
  CONTRACTOR: 'contractor',
}

/** Not a deleted (anonymised) user — see server/userDelete.ts. */
const LIVE_USER = `NOT (COALESCE(u.metadata, '{}'::jsonb) ? 'deletedAt')`

async function peopleKpis(c: string | null) {
  const rows = await query<Record<string, unknown>>(
    `SELECT u.role, COUNT(*) AS total,
            COUNT(*) FILTER (WHERE u.active) AS active,
            COUNT(*) FILTER (WHERE u.created_at >= NOW() - INTERVAL '30 days') AS new30,
            COUNT(*) FILTER (WHERE u.metadata->'verification'->>'status' = 'pending') AS pending
       FROM users u
      WHERE ($1::uuid IS NULL OR u.client_id = $1::uuid) AND ${LIVE_USER}
      GROUP BY u.role`,
    [c],
  )
  const byRole: Partial<Record<Role, number>> = {}
  let total = 0
  let inactive = 0
  let new30 = 0
  let pendingReview = 0
  for (const r of rows) {
    const role = DB_ROLE[String(r.role)] ?? 'tenant'
    byRole[role] = (byRole[role] ?? 0) + n(r.total)
    total += n(r.total)
    inactive += n(r.total) - n(r.active)
    new30 += n(r.new30)
    pendingReview += n(r.pending)
  }
  return { total, byRole, inactive, new30, pendingReview }
}

async function agencyKpis() {
  const rows = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*) AS count FROM clients GROUP BY status`,
  )
  const byStatus: Record<string, number> = {}
  for (const r of rows) byStatus[r.status] = n(r.count)
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0)
  return {
    total,
    active: (byStatus.active ?? 0) + (byStatus.trial ?? 0),
    inactive: (byStatus.suspended ?? 0) + (byStatus.cancelled ?? 0),
    byStatus,
  }
}

async function portfolioAndListings(c: string | null) {
  const rows = await query<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(*) FROM buildings b WHERE ($1::uuid IS NULL OR b.client_id = $1::uuid)) AS buildings,
       COUNT(*) FILTER (WHERE u.status_config_key <> 'DELETED') AS units,
       COUNT(*) FILTER (WHERE upper(u.status_config_key) = 'OCCUPIED') AS occupied,
       COUNT(*) FILTER (WHERE l.listed) AS published,
       COUNT(*) FILTER (WHERE l.listed AND u.listing_type IN ('SALE', 'BOTH')) AS for_sale,
       COUNT(*) FILTER (WHERE l.listed AND u.listing_type IN ('RENT', 'BOTH')) AS to_rent,
       COUNT(*) FILTER (WHERE l.listed AND u.featured) AS featured,
       COUNT(*) FILTER (WHERE l.listed AND l.photos = 0) AS no_photos,
       COUNT(*) FILTER (WHERE u.status_config_key IN ('DRAFT', 'OFF_MARKET')) AS drafts
     FROM units u
     CROSS JOIN LATERAL (
       SELECT u.status_config_key IN ${LISTED_STATUSES} AND u.listing_type <> 'NOT_LISTED' AS listed,
              CASE WHEN jsonb_typeof(u.images) = 'array' THEN jsonb_array_length(u.images) ELSE 0 END AS photos
     ) l
     WHERE ($1::uuid IS NULL OR u.client_id = $1::uuid)`,
    [c],
  )
  const r = rows[0] ?? {}
  const units = n(r.units)
  const occupied = n(r.occupied)
  return {
    portfolio: {
      buildings: n(r.buildings),
      units,
      occupied,
      vacant: Math.max(0, units - occupied),
      occupancyRate: units ? Math.round((occupied / units) * 1000) / 10 : null,
    },
    listings: {
      published: n(r.published),
      forSale: n(r.for_sale),
      toRent: n(r.to_rent),
      featured: n(r.featured),
      noPhotos: n(r.no_photos),
      drafts: n(r.drafts),
    },
  }
}

async function leadKpis(c: string | null) {
  const [totals, stages] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS last7,
              COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS last30,
              COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '60 days'
                                 AND created_at < NOW() - INTERVAL '30 days') AS prev30,
              COUNT(*) FILTER (WHERE interest_type = 'BUY' AND created_at >= NOW() - INTERVAL '30 days') AS buy30,
              COUNT(*) FILTER (WHERE interest_type = 'RENT' AND created_at >= NOW() - INTERVAL '30 days') AS rent30
         FROM leads WHERE ($1::uuid IS NULL OR client_id = $1::uuid)`,
      [c],
    ),
    query<{ stage: string; count: string }>(
      `SELECT stage, COUNT(*) AS count FROM leads
        WHERE ($1::uuid IS NULL OR client_id = $1::uuid)
        GROUP BY stage ORDER BY COUNT(*) DESC LIMIT 8`,
      [c],
    ),
  ])
  const t = totals[0] ?? {}
  return {
    total: n(t.total),
    last7: n(t.last7),
    last30: n(t.last30),
    prev30: n(t.prev30),
    buy30: n(t.buy30),
    rent30: n(t.rent30),
    byStage: stages.map((s) => ({ stage: s.stage, count: n(s.count) })),
  }
}

async function viewingKpis(c: string | null) {
  const rows = await query<Record<string, unknown>>(
    `SELECT COUNT(*) FILTER (WHERE starts_at >= NOW() - INTERVAL '7 days' AND starts_at < NOW()) AS last7,
            COUNT(*) FILTER (WHERE starts_at >= NOW() - INTERVAL '30 days' AND starts_at < NOW()) AS last30,
            COUNT(*) FILTER (WHERE status = 'SCHEDULED' AND starts_at >= NOW()
                               AND starts_at < NOW() + INTERVAL '7 days') AS next7,
            COUNT(*) FILTER (WHERE status = 'NO_SHOW' AND starts_at >= NOW() - INTERVAL '30 days') AS no_show30
       FROM bookings
      WHERE status <> 'CANCELLED' AND ($1::uuid IS NULL OR client_id = $1::uuid)`,
    [c],
  )
  const r = rows[0] ?? {}
  return { last7: n(r.last7), last30: n(r.last30), next7: n(r.next7), noShow30: n(r.no_show30) }
}

async function applicationKpis(c: string | null) {
  const rows = await query<{ status: string; count: string; stale: string }>(
    `SELECT status, COUNT(*) AS count,
            COUNT(*) FILTER (WHERE status IN ${OPEN_APPLICATION}
                               AND COALESCE(submitted_at, created_at) < NOW() - make_interval(days => $2)) AS stale
       FROM applications
      WHERE ($1::uuid IS NULL OR client_id = $1::uuid)
      GROUP BY status`,
    [c, STALE_APPLICATION_DAYS],
  )
  const byStatus: Record<string, number> = {}
  let stale = 0
  for (const r of rows) {
    byStatus[r.status] = n(r.count)
    stale += n(r.stale)
  }
  const open = ['SUBMITTED', 'UNDER_REVIEW', 'CREDIT_CHECK'].reduce((a, s) => a + (byStatus[s] ?? 0), 0)
  return { byStatus, open, stale, staleAfterDays: STALE_APPLICATION_DAYS }
}

async function leaseKpis(c: string | null) {
  const rows = await query<Record<string, unknown>>(
    `SELECT COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active,
            COUNT(*) FILTER (WHERE status = 'NOTICE') AS notice,
            COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
            COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'NOTICE') AND end_date >= d.today AND end_date < d.today + 30) AS exp30,
            COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'NOTICE') AND end_date >= d.today + 30 AND end_date < d.today + 60) AS exp60,
            COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'NOTICE') AND end_date >= d.today + 60 AND end_date < d.today + 90) AS exp90,
            COALESCE(SUM(rent_amount) FILTER (WHERE status IN ('ACTIVE', 'NOTICE')), 0) AS rent_roll
       FROM leases
       CROSS JOIN (SELECT timezone('${TZ}', NOW())::date AS today) d
      WHERE ($1::uuid IS NULL OR client_id = $1::uuid)`,
    [c],
  )
  const r = rows[0] ?? {}
  return {
    active: n(r.active),
    notice: n(r.notice),
    pending: n(r.pending),
    expiring: { d30: n(r.exp30), d60: n(r.exp60), d90: n(r.exp90) },
    monthlyRentRoll: money(r.rent_roll),
  }
}

async function paymentKpis(c: string | null) {
  const rows = await query<Record<string, unknown>>(
    `SELECT COUNT(*) FILTER (WHERE p.status = 'PAID' AND timezone('${TZ}', p.paid_at) >= m.start) AS paid_n,
            COALESCE(SUM(COALESCE(p.paid_amount, p.amount)) FILTER (WHERE p.status = 'PAID' AND timezone('${TZ}', p.paid_at) >= m.start), 0) AS paid_amt,
            COUNT(*) FILTER (WHERE o.overdue) AS overdue_n,
            COALESCE(SUM(o.balance) FILTER (WHERE o.overdue), 0) AS overdue_amt,
            COUNT(*) FILTER (WHERE p.status IN ('DUE', 'OVERDUE')) AS open_n,
            COALESCE(SUM(o.balance) FILTER (WHERE p.status IN ('DUE', 'OVERDUE')), 0) AS open_amt,
            COUNT(*) FILTER (WHERE p.due_date >= m.start::date AND p.due_date < (m.start + INTERVAL '1 month')::date) AS due_n,
            COALESCE(SUM(p.amount) FILTER (WHERE p.due_date >= m.start::date AND p.due_date < (m.start + INTERVAL '1 month')::date), 0) AS due_amt
       FROM payments p
       CROSS JOIN (SELECT date_trunc('month', timezone('${TZ}', NOW())) AS start, timezone('${TZ}', NOW())::date AS today) m
       CROSS JOIN LATERAL (
         SELECT (p.status = 'OVERDUE' OR (p.status = 'DUE' AND p.due_date < m.today)) AS overdue,
                GREATEST(p.amount - COALESCE(p.paid_amount, 0), 0) AS balance
       ) o
      WHERE p.status <> 'CANCELLED' AND ($1::uuid IS NULL OR p.client_id = $1::uuid)`,
    [c],
  )
  const r = rows[0] ?? {}
  return {
    paidThisMonth: { count: n(r.paid_n), amount: money(r.paid_amt) },
    overdue: { count: n(r.overdue_n), amount: money(r.overdue_amt) },
    outstanding: { count: n(r.open_n), amount: money(r.open_amt) },
    dueThisMonth: { count: n(r.due_n), amount: money(r.due_amt) },
  }
}

async function maintenanceKpis(c: string | null) {
  const rows = await query<{ priority: string; open: string; breached: string }>(
    `SELECT priority, COUNT(*) AS open,
            COUNT(*) FILTER (WHERE sla_due_at IS NOT NULL AND sla_due_at < NOW()) AS breached
       FROM maintenance_tickets
      WHERE status IN ${OPEN_TICKET} AND ($1::uuid IS NULL OR client_id = $1::uuid)
      GROUP BY priority`,
    [c],
  )
  const byPriority: Record<string, number> = {}
  let open = 0
  let slaBreached = 0
  for (const r of rows) {
    byPriority[r.priority] = n(r.open)
    open += n(r.open)
    slaBreached += n(r.breached)
  }
  return { open, byPriority, slaBreached }
}

export type TrendPoint = {
  date: string
  leads: number | null
  applications: number | null
  payments: number | null
  paymentsAmount: number | null
  users: number | null
}

/** One row per day for the last TREND_DAYS days (SAST), zero-filled. */
async function trendSeries(c: string | null, sections: Set<DashboardSectionId>): Promise<TrendPoint[]> {
  const rows = await query<Record<string, unknown>>(
    `WITH days AS (
       SELECT generate_series(timezone('${TZ}', NOW())::date - ($2::int - 1), timezone('${TZ}', NOW())::date, INTERVAL '1 day')::date AS d
     ),
     l AS (SELECT timezone('${TZ}', created_at)::date AS d, COUNT(*) AS n FROM leads
            WHERE created_at >= NOW() - make_interval(days => $2 + 1) AND ($1::uuid IS NULL OR client_id = $1::uuid) GROUP BY 1),
     a AS (SELECT timezone('${TZ}', COALESCE(submitted_at, created_at))::date AS d, COUNT(*) AS n FROM applications
            WHERE status <> 'DRAFT' AND COALESCE(submitted_at, created_at) >= NOW() - make_interval(days => $2 + 1)
              AND ($1::uuid IS NULL OR client_id = $1::uuid) GROUP BY 1),
     p AS (SELECT timezone('${TZ}', paid_at)::date AS d, COUNT(*) AS n, SUM(COALESCE(paid_amount, amount)) AS amt FROM payments
            WHERE status = 'PAID' AND paid_at >= NOW() - make_interval(days => $2 + 1)
              AND ($1::uuid IS NULL OR client_id = $1::uuid) GROUP BY 1),
     u AS (SELECT timezone('${TZ}', created_at)::date AS d, COUNT(*) AS n FROM users
            WHERE created_at >= NOW() - make_interval(days => $2 + 1) AND ($1::uuid IS NULL OR client_id = $1::uuid) GROUP BY 1)
     SELECT days.d::text AS date, COALESCE(l.n, 0) AS leads, COALESCE(a.n, 0) AS applications,
            COALESCE(p.n, 0) AS payments, COALESCE(p.amt, 0) AS payments_amount, COALESCE(u.n, 0) AS users
       FROM days
       LEFT JOIN l ON l.d = days.d LEFT JOIN a ON a.d = days.d
       LEFT JOIN p ON p.d = days.d LEFT JOIN u ON u.d = days.d
      ORDER BY days.d`,
    [c, TREND_DAYS],
  )
  return rows.map((r) => ({
    date: String(r.date),
    leads: sections.has('leads') ? n(r.leads) : null,
    applications: sections.has('applications') ? n(r.applications) : null,
    payments: sections.has('payments') ? n(r.payments) : null,
    paymentsAmount: sections.has('payments') ? money(r.payments_amount) : null,
    users: sections.has('people') ? n(r.users) : null,
  }))
}

export type AgencyRow = {
  clientId: string
  agencyId: string
  name: string
  status: string
  createdAt: string
  users: number
  staff: number
  buildings: number
  units: number
  occupied: number
  occupancyRate: number | null
  listings: number
  openApplications: number
  overdueCount: number
  overdueAmount: number
  openTickets: number
  lastActivityAt: string | null
}

/** Super admin only: one row per agency, every count grouped in SQL. */
async function agencyTable(): Promise<AgencyRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT c.id::text AS id, COALESCE(NULLIF(c.trading_as, ''), c.company_name) AS name, c.status,
            c.created_at::text AS created_at,
            COALESCE(us.n, 0) AS users, COALESCE(us.staff, 0) AS staff,
            COALESCE(bl.n, 0) AS buildings,
            COALESCE(un.units, 0) AS units, COALESCE(un.occupied, 0) AS occupied, COALESCE(un.listed, 0) AS listings,
            COALESCE(ap.n, 0) AS open_apps,
            COALESCE(pm.n, 0) AS overdue_n, COALESCE(pm.amt, 0) AS overdue_amt,
            COALESCE(tk.n, 0) AS open_tickets,
            GREATEST(ev.last_at, un.last_at, ld.last_at, ap.last_at)::text AS last_activity
       FROM clients c
       LEFT JOIN (SELECT u.client_id, COUNT(*) AS n,
                         COUNT(*) FILTER (WHERE u.role IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')) AS staff
                    FROM users u WHERE ${LIVE_USER} GROUP BY u.client_id) us ON us.client_id = c.id
       LEFT JOIN (SELECT client_id, COUNT(*) AS n FROM buildings GROUP BY client_id) bl ON bl.client_id = c.id
       LEFT JOIN (SELECT client_id,
                         COUNT(*) FILTER (WHERE status_config_key <> 'DELETED') AS units,
                         COUNT(*) FILTER (WHERE upper(status_config_key) = 'OCCUPIED') AS occupied,
                         COUNT(*) FILTER (WHERE status_config_key IN ${LISTED_STATUSES} AND listing_type <> 'NOT_LISTED') AS listed,
                         MAX(updated_at) AS last_at
                    FROM units GROUP BY client_id) un ON un.client_id = c.id
       LEFT JOIN (SELECT client_id, COUNT(*) FILTER (WHERE status IN ${OPEN_APPLICATION}) AS n, MAX(updated_at) AS last_at
                    FROM applications GROUP BY client_id) ap ON ap.client_id = c.id
       LEFT JOIN (SELECT client_id, COUNT(*) AS n, SUM(GREATEST(amount - COALESCE(paid_amount, 0), 0)) AS amt
                    FROM payments
                   WHERE status = 'OVERDUE' OR (status = 'DUE' AND due_date < timezone('${TZ}', NOW())::date)
                   GROUP BY client_id) pm ON pm.client_id = c.id
       LEFT JOIN (SELECT client_id, COUNT(*) AS n FROM maintenance_tickets WHERE status IN ${OPEN_TICKET}
                   GROUP BY client_id) tk ON tk.client_id = c.id
       LEFT JOIN (SELECT client_id, MAX(created_at) AS last_at FROM leads GROUP BY client_id) ld ON ld.client_id = c.id
       LEFT JOIN (SELECT client_id, MAX(created_at) AS last_at FROM event_log
                   WHERE client_id IS NOT NULL AND event_type <> 'impersonation' GROUP BY client_id) ev ON ev.client_id = c.id
      ORDER BY name`,
  )
  return Promise.all(
    rows.map(async (r) => {
      const units = n(r.units)
      const occupied = n(r.occupied)
      return {
        clientId: String(r.id),
        agencyId: (await agencyFeForClient(String(r.id))) ?? String(r.id),
        name: String(r.name ?? ''),
        status: String(r.status ?? ''),
        createdAt: String(r.created_at ?? ''),
        users: n(r.users),
        staff: n(r.staff),
        buildings: n(r.buildings),
        units,
        occupied,
        occupancyRate: units ? Math.round((occupied / units) * 1000) / 10 : null,
        listings: n(r.listings),
        openApplications: n(r.open_apps),
        overdueCount: n(r.overdue_n),
        overdueAmount: money(r.overdue_amt),
        openTickets: n(r.open_tickets),
        lastActivityAt: r.last_activity ? String(r.last_activity) : null,
      }
    }),
  )
}

/** event_log types shown in the feed, with a short label. Others are routine noise. */
export const ACTIVITY_LABELS: Readonly<Record<string, string>> = {
  user_created: 'Account created',
  user_deleted: 'User deleted',
  user_delete_failed: 'User delete failed',
  impersonation: 'Signed in as another user',
  email_change_requested: 'Email change requested',
  email_changed: 'Email changed',
  password_reset: 'Password reset',
  activity: 'Activity',
  property_event: 'Listing changed',
  lease_signed: 'Lease signed',
  deposit_refund_recorded: 'Deposit refund recorded',
  deposit_deductions_approved: 'Deposit deductions approved',
  escalation: 'Escalation',
  support_ticket: 'Help desk ticket',
  viewing_attendance_marked: 'Viewing attendance marked',
  maintenance_rule_set_saved: 'Maintenance rules saved',
  payfast_itn_rejected: 'Payment notification rejected',
}
/** Platform-only types: never shown to an agency admin. */
const PLATFORM_ONLY_ACTIVITY = new Set(['impersonation', 'user_delete_failed'])

export type ActivityItem = {
  id: string
  at: string
  type: string
  label: string
  detail: string | null
  actorName: string | null
  actorRole: Role | null
  agencyName: string | null
}

function str(v: unknown, max = 160): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}

/** A one-line summary built from known payload keys only (no ids, emails or raw payloads). */
function activityDetail(type: string, payload: Record<string, unknown>, subjectName: string | null): string | null {
  switch (type) {
    case 'activity':
      return str(payload.text)
    case 'property_event': {
      const action = str(payload.action, 40)
      return action ? `${action}${subjectName ? ` · ${subjectName}` : ''}` : subjectName
    }
    case 'support_ticket':
      return str(payload.subject)
    case 'user_deleted':
      return str(payload.mode, 20) === 'anonymised' ? 'Anonymised, history kept' : 'Removed'
    case 'impersonation':
      return [str(payload.impersonatedRole, 30), str(payload.route, 80)].filter(Boolean).join(' · ') || null
    case 'escalation':
      return str(payload.title) ?? str(payload.reason)
    case 'viewing_attendance_marked':
      return str(payload.status, 30)
    default:
      return subjectName
  }
}

async function activityFeed(c: string | null, platform: boolean, limit = 40): Promise<ActivityItem[]> {
  const types = Object.keys(ACTIVITY_LABELS).filter((t) => t !== 'user_created' && (platform || !PLATFORM_ONLY_ACTIVITY.has(t)))
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM (
       SELECT e.id::text AS id, e.created_at, e.event_type AS type, e.payload,
              NULLIF(trim(COALESCE(a.first_name, '') || ' ' || COALESCE(a.last_name, '')), '') AS actor_name,
              a.role AS actor_role,
              CASE WHEN e.subject_type = 'user' THEN NULLIF(trim(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')), '') END AS subject_name,
              COALESCE(NULLIF(cl.trading_as, ''), cl.company_name) AS agency_name
         FROM event_log e
         LEFT JOIN users a ON a.id = e.actor_user_id
         LEFT JOIN users s ON e.subject_type = 'user' AND s.id = e.subject_id
         LEFT JOIN clients cl ON cl.id = e.client_id
        WHERE e.event_type = ANY($2::text[]) AND ($1::uuid IS NULL OR e.client_id = $1::uuid)
       UNION ALL
       SELECT 'u-' || u.id::text, u.created_at, 'user_created', jsonb_build_object('role', u.role),
              NULL, NULL,
              NULLIF(trim(u.first_name || ' ' || u.last_name), ''),
              COALESCE(NULLIF(cl.trading_as, ''), cl.company_name)
         FROM users u LEFT JOIN clients cl ON cl.id = u.client_id
        WHERE ($1::uuid IS NULL OR u.client_id = $1::uuid) AND ${LIVE_USER}
     ) feed
     ORDER BY created_at DESC
     LIMIT $3`,
    [c, types, limit],
  )
  return rows.map((r) => {
    const type = String(r.type)
    const payload = (r.payload && typeof r.payload === 'object' ? r.payload : {}) as Record<string, unknown>
    const subjectName = str(r.subject_name)
    const createdRole = type === 'user_created' ? DB_ROLE[String(payload.role)] : null
    return {
      id: String(r.id),
      at: new Date(String(r.created_at)).toISOString(),
      type,
      label: ACTIVITY_LABELS[type] ?? type,
      detail: type === 'user_created' ? [subjectName, createdRole ? roleLabels[createdRole] : null].filter(Boolean).join(' · ') || null : activityDetail(type, payload, subjectName),
      actorName: str(r.actor_name) ?? (type === 'activity' ? str(payload.user, 80) : null),
      actorRole: r.actor_role ? DB_ROLE[String(r.actor_role)] ?? null : null,
      agencyName: str(r.agency_name),
    }
  })
}

export type AttentionItem = {
  id: string
  tone: 'danger' | 'warning' | 'neutral'
  label: string
  count: number
  amount?: number
  href: string
}

export type HealthInfo = {
  database: 'up' | 'down'
  latencyMs: number | null
  commit: string | null
  authMode: string | null
  lastBackupAt: string | null
  backupDir: string | null
  emailLog: { available: boolean; failed24h: number; failed7d: number; sent24h: number; notConfigured24h: number }
}

/** Newest db-*.dump in BACKUP_DIR (deploy/backup.sh). Null when none can be read. */
export async function lastBackupAt(dir = process.env.BACKUP_DIR || '/var/backups/propertyflow'): Promise<string | null> {
  try {
    const names = (await readdir(dir)).filter((f) => /^db-.*\.dump$/.test(f))
    let newest = 0
    for (const f of names) newest = Math.max(newest, (await stat(join(dir, f))).mtimeMs)
    return newest ? new Date(newest).toISOString() : null
  } catch {
    return null
  }
}

async function emailHealth(): Promise<HealthInfo['emailLog']> {
  const exists = await query<{ t: string | null }>(`SELECT to_regclass('email_log')::text AS t`)
  if (!exists[0]?.t) return { available: false, failed24h: 0, failed7d: 0, sent24h: 0, notConfigured24h: 0 }
  const rows = await query<Record<string, unknown>>(
    `SELECT COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours') AS f24,
            COUNT(*) FILTER (WHERE status = 'failed') AS f7,
            COUNT(*) FILTER (WHERE status = 'sent' AND created_at >= NOW() - INTERVAL '24 hours') AS s24,
            COUNT(*) FILTER (WHERE status = 'logged' AND created_at >= NOW() - INTERVAL '24 hours') AS l24
       FROM email_log WHERE created_at >= NOW() - INTERVAL '7 days'`,
  )
  const r = rows[0] ?? {}
  return { available: true, failed24h: n(r.f24), failed7d: n(r.f7), sent24h: n(r.s24), notConfigured24h: n(r.l24) }
}

export type HealthDeps = { commit: () => string | null; authMode: () => string | null }

async function systemHealth(deps: HealthDeps): Promise<HealthInfo> {
  const started = Date.now()
  let database: HealthInfo['database'] = 'up'
  try {
    await query('SELECT 1')
  } catch {
    database = 'down'
  }
  const latencyMs = database === 'up' ? Date.now() - started : null
  const [backup, emailLog] = await Promise.all([
    lastBackupAt(),
    emailHealth().catch(() => ({ available: false, failed24h: 0, failed7d: 0, sent24h: 0, notConfigured24h: 0 })),
  ])
  return {
    database,
    latencyMs,
    commit: deps.commit(),
    authMode: deps.authMode(),
    lastBackupAt: backup,
    backupDir: backup ? null : process.env.BACKUP_DIR || '/var/backups/propertyflow',
    emailLog,
  }
}

export type DashboardPayload = {
  scope: { kind: 'platform' | 'agency'; agencyId: string | null; agencyName: string | null }
  viewerRole: Role
  sections: DashboardSectionId[]
  generatedAt: string
  kpis: {
    agencies?: Awaited<ReturnType<typeof agencyKpis>>
    people?: Awaited<ReturnType<typeof peopleKpis>>
    portfolio?: Awaited<ReturnType<typeof portfolioAndListings>>['portfolio']
    listings?: Awaited<ReturnType<typeof portfolioAndListings>>['listings']
    leads?: Awaited<ReturnType<typeof leadKpis>>
    viewings?: Awaited<ReturnType<typeof viewingKpis>>
    applications?: Awaited<ReturnType<typeof applicationKpis>>
    leases?: Awaited<ReturnType<typeof leaseKpis>>
    payments?: Awaited<ReturnType<typeof paymentKpis>>
    maintenance?: Awaited<ReturnType<typeof maintenanceKpis>>
  }
  trends: TrendPoint[]
  agencies?: AgencyRow[]
  activity?: ActivityItem[]
  attention: AttentionItem[]
  health?: HealthInfo
}

function attentionItems(k: DashboardPayload['kpis'], health: HealthInfo | undefined, platform: boolean): AttentionItem[] {
  const out: AttentionItem[] = []
  const push = (item: AttentionItem) => {
    if (item.count > 0) out.push(item)
  }
  if (k.payments) {
    push({ id: 'overdue-payments', tone: 'danger', label: 'Overdue payments', count: k.payments.overdue.count, amount: k.payments.overdue.amount, href: '/workspace/operations/payments' })
  }
  if (k.applications) {
    push({ id: 'stale-applications', tone: 'warning', label: `Applications waiting over ${k.applications.staleAfterDays} days`, count: k.applications.stale, href: '/workspace/sales/applications' })
  }
  if (k.maintenance) {
    const urgent = (k.maintenance.byPriority.URGENT ?? 0) + (k.maintenance.byPriority.EMERGENCY ?? 0)
    push({ id: 'urgent-tickets', tone: 'danger', label: 'Urgent or emergency tickets open', count: urgent, href: '/workspace/operations/maintenance' })
    push({ id: 'sla-breached', tone: 'warning', label: 'Tickets past their SLA', count: k.maintenance.slaBreached, href: '/workspace/operations/maintenance' })
  }
  if (k.leases) {
    push({ id: 'leases-expiring', tone: 'warning', label: 'Leases ending in the next 30 days', count: k.leases.expiring.d30, href: '/workspace/people/leases' })
  }
  if (k.listings) {
    push({ id: 'no-photos', tone: 'neutral', label: 'Published listings with no photos', count: k.listings.noPhotos, href: '/workspace/properties' })
  }
  if (k.people) {
    push({ id: 'pending-review', tone: 'warning', label: 'Landlords waiting for verification', count: k.people.pendingReview, href: platform ? '/workspace/admin/all-users' : '/workspace/people/landlords' })
    push({ id: 'disabled-users', tone: 'neutral', label: 'Disabled accounts', count: k.people.inactive, href: platform ? '/workspace/admin/all-users' : '/workspace/admin/users' })
  }
  if (k.agencies) {
    push({ id: 'inactive-agencies', tone: 'neutral', label: 'Suspended or cancelled agencies', count: k.agencies.inactive, href: '/workspace/admin/agencies' })
  }
  if (health?.emailLog.available) {
    push({ id: 'email-failures', tone: 'danger', label: 'Emails failed in the last 24 hours', count: health.emailLog.failed24h, href: '/workspace/admin/emails' })
  }
  return out
}

/** The whole dashboard for one viewer. Sections the viewer may not see are not computed. */
export async function buildDashboard(viewer: DashboardViewer, deps: HealthDeps): Promise<DashboardPayload> {
  const c = viewer.scope.clientUuid
  const platform = viewer.scope.kind === 'platform'
  const s = new Set(viewer.sections)
  const needsUnits = s.has('portfolio') || s.has('listings')
  const [agencies, people, units, leads, viewings, applications, leases, payments, maintenance, trends, table, activity, health] =
    await Promise.all([
      platform && s.has('agencies') ? agencyKpis() : undefined,
      s.has('people') ? peopleKpis(c) : undefined,
      needsUnits ? portfolioAndListings(c) : undefined,
      s.has('leads') ? leadKpis(c) : undefined,
      s.has('viewings') ? viewingKpis(c) : undefined,
      s.has('applications') ? applicationKpis(c) : undefined,
      s.has('leases') ? leaseKpis(c) : undefined,
      s.has('payments') ? paymentKpis(c) : undefined,
      s.has('maintenance') ? maintenanceKpis(c) : undefined,
      trendSeries(c, s),
      platform && s.has('agencies') ? agencyTable() : undefined,
      s.has('activity') ? activityFeed(c, platform) : undefined,
      platform && s.has('health') ? systemHealth(deps) : undefined,
    ])
  const kpis: DashboardPayload['kpis'] = {
    agencies,
    people,
    portfolio: s.has('portfolio') ? units?.portfolio : undefined,
    listings: s.has('listings') ? units?.listings : undefined,
    leads,
    viewings,
    applications,
    leases,
    payments,
    maintenance,
  }
  for (const key of Object.keys(kpis) as Array<keyof typeof kpis>) if (kpis[key] === undefined) delete kpis[key]
  return {
    scope: { kind: viewer.scope.kind, agencyId: viewer.scope.agencyId, agencyName: viewer.scope.agencyName },
    viewerRole: viewer.role,
    sections: viewer.sections,
    generatedAt: new Date().toISOString(),
    kpis,
    trends,
    ...(table ? { agencies: table } : {}),
    ...(activity ? { activity } : {}),
    attention: attentionItems(kpis, health, platform),
    ...(health ? { health } : {}),
  }
}

export type AccessPerson = {
  id: string
  name: string
  email: string | null
  role: Role
  active: boolean
  agencyId: string | null
  agencyName: string | null
  /** Saved per-user list (null = role defaults). */
  enabledPermissions: Permission[] | null
  /** The agency's enabled modules (null = all). */
  agencyEnabledPermissions: Permission[] | null
}

/**
 * People and their saved permission lists for the Access tab. Super admin:
 * everyone (deleted users left out); agency admin: their own agency only.
 * Requires the 'access' section. The page works out allowed / denied with
 * the same effectiveCan the server gates use.
 */
export async function listAccessPeople(viewer: DashboardViewer, limit = 1000): Promise<{
  people: AccessPerson[]
  collections: Record<string, readonly Permission[]>
  writes: Record<string, Permission>
}> {
  if (!viewer.sections.includes('access')) {
    throw httpError(403, 'ACCESS_VIEW_FORBIDDEN', 'You cannot view other users’ access.')
  }
  const c = viewer.scope.clientUuid
  const rows = await query<Record<string, unknown>>(
    `SELECT u.id::text AS id, u.client_id::text AS client_id, u.email, u.role, u.active,
            NULLIF(trim(u.first_name || ' ' || u.last_name), '') AS name,
            u.metadata->'enabledPermissions' AS enabled, u.metadata->'permissionsVersion' AS version,
            COALESCE(NULLIF(cl.trading_as, ''), cl.company_name) AS agency_name,
            cl.settings->'enabledPermissions' AS agency_enabled, cl.settings->'permissionsVersion' AS agency_version,
            fe.frontend_id
       FROM users u LEFT JOIN clients cl ON cl.id = u.client_id
       LEFT JOIN LATERAL (
         SELECT m.frontend_id FROM entity_id_map m
          WHERE m.entity_type = 'user' AND m.backend_id = u.id LIMIT 1
       ) fe ON TRUE
      WHERE ($1::uuid IS NULL OR u.client_id = $1::uuid) AND ${LIVE_USER}
      ORDER BY u.role, name
      LIMIT $2`,
    [c, limit],
  )
  const people = await Promise.all(
    rows.map(async (r) => ({
      id: staticFrontendId('user', String(r.id)) ?? str(r.frontend_id, 200) ?? String(r.id),
      name: str(r.name) ?? String(r.email ?? ''),
      email: str(r.email, 190),
      role: DB_ROLE[String(r.role)] ?? 'tenant',
      active: r.active === true,
      agencyId: r.client_id ? (await agencyFeForClient(String(r.client_id))) ?? String(r.client_id) : null,
      agencyName: str(r.agency_name),
      enabledPermissions: storedList(r.enabled, r.version),
      agencyEnabledPermissions: storedList(r.agency_enabled, r.agency_version),
    })),
  )
  return { people, collections: { ...COLLECTION_PERMISSIONS }, writes: { ...WRITE_PERMISSION } }
}
