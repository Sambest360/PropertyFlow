/**
 * Escalations: issue escalation (maintenance faults and help-desk tickets that
 * sit too long) and rent escalation (yearly rent increases on leases).
 *
 * Issue escalation levels
 *   1  past the response time: the assigned / unit agent and agency admins
 *   2  twice the response time with nobody on it, or past the fix time:
 *      agency admins again (louder)
 *   3  twice the fix time: super admins
 * Records live in event_log (event_type 'escalation'); a ticket's
 * maintenance_tickets.escalated_at is stamped when it first escalates.
 *
 * Rent escalation
 *   rentNoticeDays before leases.metadata.billingSchedule.nextEscalationOn the
 *   tenant, landlord and agent are told the new rent; on the date the rent is
 *   raised (when autoApplyRent is on) and the next date moves a year on. An
 *   agency default % gives every active lease without a schedule one, starting
 *   on the next lease anniversary.
 *
 * Settings: clients.settings.escalation (see EscalationSettings).
 */
import { query } from './db.js'
import { resolveFrontendId } from './entityMap.js'
import { notifyUsers, superAdminUuids } from './supportDesk.js'
import type { DemoActor } from './actor.js'

export type Priority = 'EMERGENCY' | 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
const PRIORITIES: Priority[] = ['EMERGENCY', 'URGENT', 'HIGH', 'MEDIUM', 'LOW']

export type EscalationSettings = {
  enabled: boolean
  /** Hours until someone must respond (contractor assigned / work started). */
  responseHours: Record<Priority, number>
  /** Hours until the fault should be fixed. */
  resolveHours: Record<Priority, number>
  /** Help-desk ticket untouched this long escalates. */
  supportResponseHours: number
  /** Days before a rent increase that tenant, landlord and agent are told. */
  rentNoticeDays: number
  /** Raise the rent automatically on the escalation date. */
  autoApplyRent: boolean
  /** Agency default yearly increase for leases without their own (null = none). */
  defaultRentEscalationPct: number | null
}

export const DEFAULT_ESCALATION_SETTINGS: EscalationSettings = {
  enabled: true,
  responseHours: { EMERGENCY: 2, URGENT: 8, HIGH: 24, MEDIUM: 72, LOW: 168 },
  resolveHours: { EMERGENCY: 24, URGENT: 72, HIGH: 168, MEDIUM: 336, LOW: 720 },
  supportResponseHours: 48,
  rentNoticeDays: 60,
  autoApplyRent: true,
  defaultRentEscalationPct: null,
}

const HOUR = 3600_000
const DAY = 24 * HOUR

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback
}

/** Merge stored settings over the defaults, clamping every value. */
export function readEscalationSettings(raw: unknown): EscalationSettings {
  const s =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? ((raw as { escalation?: unknown }).escalation as Record<string, unknown> | undefined)
      : undefined
  const d = DEFAULT_ESCALATION_SETTINGS
  if (!s || typeof s !== 'object') return { ...d, responseHours: { ...d.responseHours }, resolveHours: { ...d.resolveHours } }
  const hours = (src: unknown, def: Record<Priority, number>) => {
    const o = src && typeof src === 'object' ? (src as Record<string, unknown>) : {}
    return Object.fromEntries(PRIORITIES.map((p) => [p, num(o[p], def[p], 0.25, 24 * 365)])) as Record<Priority, number>
  }
  const pct = s.defaultRentEscalationPct
  return {
    enabled: s.enabled !== false,
    responseHours: hours(s.responseHours, d.responseHours),
    resolveHours: hours(s.resolveHours, d.resolveHours),
    supportResponseHours: num(s.supportResponseHours, d.supportResponseHours, 1, 24 * 60),
    rentNoticeDays: num(s.rentNoticeDays, d.rentNoticeDays, 0, 365),
    autoApplyRent: s.autoApplyRent !== false,
    defaultRentEscalationPct: pct == null || pct === '' ? null : num(pct, 0, 0.01, 100) || null,
  }
}

/** Level a maintenance ticket should be at now (0 = fine). */
export function maintenanceLevel(
  t: { priority: string; status: string; contractorAssigned: boolean; ageMs: number },
  s: EscalationSettings,
): { level: 0 | 1 | 2 | 3; reason: string } {
  const p = (PRIORITIES as string[]).includes(t.priority) ? (t.priority as Priority) : 'MEDIUM'
  const response = s.responseHours[p] * HOUR
  const resolve = s.resolveHours[p] * HOUR
  const waiting = !t.contractorAssigned && (t.status === 'OPEN' || t.status === 'TRIAGED')
  const label = p.charAt(0) + p.slice(1).toLowerCase()
  if (t.ageMs >= 2 * resolve) return { level: 3, reason: `${label} fault still not fixed after ${hrs(2 * resolve)}` }
  if (t.ageMs >= resolve) return { level: 2, reason: `${label} fault not fixed within ${hrs(resolve)}` }
  if (waiting && t.ageMs >= 2 * response) return { level: 2, reason: `Nobody assigned after ${hrs(2 * response)}` }
  if (waiting && t.ageMs >= response) return { level: 1, reason: `No response within ${hrs(response)}` }
  return { level: 0, reason: '' }
}

function hrs(ms: number): string {
  const h = ms / HOUR
  if (h >= 48) return `${Math.round(h / 24)} days`
  return `${+h.toFixed(1)} hours`
}

export type EscalationRecord = {
  id: string
  agencyId: string | null
  subjectType: 'maintenance_ticket' | 'support_ticket' | 'saas_invoice' | 'rent_payment'
  subjectId: string
  title: string
  reason: string
  level: number
  status: 'open' | 'acknowledged' | 'resolved'
  link: string
  manual: boolean
  createdAt: string
  updatedAt: string
  history: Array<{ at: string; action: string; level?: number; by?: string | null; note?: string | null }>
}

type EventRow = { id: string; client_id: string | null; subject_id: string | null; payload: Record<string, unknown>; created_at: Date | string }

function toRecord(r: EventRow, agencyFe: string | null): EscalationRecord {
  const p = r.payload ?? {}
  return {
    id: r.id,
    agencyId: agencyFe,
    subjectType: (p.subjectType as EscalationRecord['subjectType']) ?? 'maintenance_ticket',
    subjectId: String(p.subjectRef ?? r.subject_id ?? ''),
    title: String(p.title ?? 'Escalation'),
    reason: String(p.reason ?? ''),
    level: Number(p.level ?? 1),
    status: (p.status as EscalationRecord['status']) ?? 'open',
    link: String(p.link ?? '/workspace/operations/escalations'),
    manual: p.manual === true,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: String(p.updatedAt ?? new Date(r.created_at).toISOString()),
    history: Array.isArray(p.history) ? (p.history as EscalationRecord['history']) : [],
  }
}

/** Agency administrators and principals; agencies without one fall back to super admins. */
async function agencyAdminUuids(clientId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM users
      WHERE client_id = $1::uuid AND COALESCE(active, true)
        AND (role IN ('AGENCY_ADMIN', 'AGENT_ADMIN') OR metadata->>'frontend_role' IN ('client_admin', 'agent_admin'))`,
    [clientId],
  )
  return rows.length ? rows.map((r) => r.id) : superAdminUuids()
}

async function openEscalationFor(subjectId: string): Promise<EventRow | null> {
  const rows = await query<EventRow>(
    `SELECT id::text AS id, client_id::text AS client_id, subject_id::text AS subject_id, payload, created_at
       FROM event_log
      WHERE event_type = 'escalation' AND subject_id = $1::uuid AND COALESCE(payload->>'status', 'open') <> 'resolved'
      ORDER BY created_at DESC LIMIT 1`,
    [subjectId],
  )
  return rows[0] ?? null
}

async function savePayload(id: string, payload: Record<string, unknown>): Promise<void> {
  await query(`UPDATE event_log SET payload = $2::jsonb WHERE id = $1::uuid`, [id, JSON.stringify(payload)])
}

/**
 * Raise (or create) the escalation for one subject to `level`, notifying the
 * people for each level reached. Returns true when something changed.
 */
async function raise(input: {
  clientId: string | null
  subjectType: EscalationRecord['subjectType']
  subjectId: string
  subjectRef: string
  title: string
  reason: string
  level: number
  link: string
  levelRecipients: (level: number) => Promise<string[]>
  actorUuid?: string | null
  manual?: boolean
  now: Date
}): Promise<boolean> {
  const existing = await openEscalationFor(input.subjectId)
  const current = existing ? Number(existing.payload?.level ?? 0) : 0
  if (input.level <= current) return false
  const at = input.now.toISOString()
  const history = existing && Array.isArray(existing.payload?.history) ? [...(existing.payload.history as unknown[])] : []
  history.push({ at, action: input.manual ? 'escalated_manually' : 'escalated', level: input.level, by: input.actorUuid ?? null, note: input.reason })
  const payload = {
    ...(existing?.payload ?? {}),
    subjectType: input.subjectType,
    subjectRef: input.subjectRef,
    title: input.title,
    reason: input.reason,
    level: input.level,
    status: 'open',
    link: input.link,
    manual: input.manual === true || existing?.payload?.manual === true,
    updatedAt: at,
    history,
  }
  if (existing) await savePayload(existing.id, payload)
  else {
    await query(
      `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
       VALUES ($1::uuid, 'escalation', $2, $3::uuid, $4::uuid, $5::jsonb, NOW())`,
      [input.clientId, input.subjectType, input.subjectId, input.actorUuid ?? null, JSON.stringify(payload)],
    )
  }
  const recipients = new Set<string>()
  for (let l = current + 1; l <= input.level; l++) for (const r of await input.levelRecipients(l)) recipients.add(r)
  await notifyUsers(
    [...recipients],
    {
      clientId: input.clientId,
      title: `Escalated (level ${input.level}): ${input.title}`.slice(0, 200),
      body: input.reason,
      link: input.link,
      resource: 'escalation',
      action: 'alert',
    },
    input.actorUuid ?? null,
  )
  return true
}

type TicketRow = {
  id: string
  client_id: string
  title: string
  priority: string
  status: string
  contractor_id: string | null
  assigned_to: string | null
  unit_agent: string | null
  created_at: Date | string
  settings: unknown
}

async function ticketRecipients(t: Pick<TicketRow, 'client_id' | 'assigned_to' | 'unit_agent'>, level: number): Promise<string[]> {
  if (level >= 3) return superAdminUuids()
  const admins = await agencyAdminUuids(t.client_id)
  if (level === 1) {
    const agents = [t.assigned_to, t.unit_agent].filter((x): x is string => Boolean(x))
    return agents.length ? [...agents, ...admins] : admins
  }
  return admins
}

async function ticketLink(uuid: string): Promise<string> {
  const fe = (await resolveFrontendId('ticket', uuid).catch(() => null)) ?? uuid
  return `/workspace/operations/maintenance/${encodeURIComponent(fe)}`
}

const TICKET_SELECT = `SELECT t.id::text AS id, t.client_id::text AS client_id, t.title, t.priority, t.status,
        t.contractor_id::text AS contractor_id, t.assigned_to::text AS assigned_to,
        u.agent_id::text AS unit_agent, t.created_at, c.settings
   FROM maintenance_tickets t
   JOIN clients c ON c.id = t.client_id
   LEFT JOIN units u ON u.id = t.unit_id`

async function maintenanceSweep(now: Date): Promise<number> {
  let rows: TicketRow[]
  try {
    rows = await query<TicketRow>(
      `${TICKET_SELECT} WHERE t.status NOT IN ('RESOLVED', 'COMPLETED', 'CANCELLED')`,
    )
  } catch {
    // Older databases without units.agent_id / buildings.agent_id.
    rows = await query<TicketRow>(
      `SELECT t.id::text AS id, t.client_id::text AS client_id, t.title, t.priority, t.status,
              t.contractor_id::text AS contractor_id, t.assigned_to::text AS assigned_to, NULL::text AS unit_agent,
              t.created_at, c.settings
         FROM maintenance_tickets t JOIN clients c ON c.id = t.client_id
        WHERE t.status NOT IN ('RESOLVED', 'COMPLETED', 'CANCELLED')`,
    )
  }
  let changed = 0
  for (const t of rows) {
    const s = readEscalationSettings(t.settings)
    if (!s.enabled) continue
    const { level, reason } = maintenanceLevel(
      { priority: t.priority, status: t.status, contractorAssigned: Boolean(t.contractor_id), ageMs: now.getTime() - new Date(t.created_at).getTime() },
      s,
    )
    if (level === 0) continue
    const did = await raise({
      clientId: t.client_id,
      subjectType: 'maintenance_ticket',
      subjectId: t.id,
      subjectRef: (await resolveFrontendId('ticket', t.id).catch(() => null)) ?? t.id,
      title: t.title,
      reason,
      level,
      link: await ticketLink(t.id),
      levelRecipients: (l) => ticketRecipients(t, l),
      now,
    })
    if (did) {
      changed++
      await query(`UPDATE maintenance_tickets SET escalated_at = COALESCE(escalated_at, NOW()) WHERE id = $1::uuid`, [t.id])
    }
  }
  // Close escalations whose ticket is finished.
  await query(
    `UPDATE event_log e SET payload = e.payload || jsonb_build_object('status', 'resolved', 'updatedAt', $1::text,
        'history', COALESCE(e.payload->'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', $1::text, 'action', 'auto_resolved', 'note', 'Ticket closed')))
      FROM maintenance_tickets t
     WHERE e.event_type = 'escalation' AND e.subject_type = 'maintenance_ticket' AND e.subject_id = t.id
       AND COALESCE(e.payload->>'status', 'open') <> 'resolved'
       AND t.status IN ('RESOLVED', 'COMPLETED', 'CANCELLED')`,
    [now.toISOString()],
  )
  return changed
}

async function supportSweep(now: Date): Promise<number> {
  const rows = await query<EventRow & { settings: unknown }>(
    `SELECT e.id::text AS id, e.client_id::text AS client_id, e.id::text AS subject_id, e.payload, e.created_at, c.settings
       FROM event_log e LEFT JOIN clients c ON c.id = e.client_id
      WHERE e.event_type = 'support_ticket' AND COALESCE(e.payload->>'status', 'new') IN ('new', 'in_progress')`,
  )
  let changed = 0
  for (const r of rows) {
    const s = readEscalationSettings(r.settings)
    if (!s.enabled) continue
    const p = r.payload ?? {}
    const last = Date.parse(String(p.updatedAt ?? '')) || new Date(r.created_at).getTime()
    const idle = now.getTime() - last
    const limit = s.supportResponseHours * HOUR
    const level = idle >= 2 * limit ? 2 : idle >= limit ? 1 : 0
    if (!level) continue
    const { resolveUuid } = await import('./entityMap.js')
    const assignee =
      typeof p.assigneeUserId === 'string' && p.assigneeUserId
        ? await resolveUuid('user', p.assigneeUserId).catch(() => null)
        : null
    const did = await raise({
      clientId: r.client_id,
      subjectType: 'support_ticket',
      subjectId: r.id,
      subjectRef: String(p.id ?? r.id),
      title: `Help desk: ${String(p.subject ?? 'ticket')}`,
      reason: `No reply for ${hrs(idle)}`,
      level,
      link: `/workspace/help?ticket=${encodeURIComponent(String(p.id ?? r.id))}`,
      levelRecipients: async (l) => {
        if (r.client_id && l === 1) return [...(assignee ? [assignee] : []), ...(await agencyAdminUuids(r.client_id))]
        return superAdminUuids()
      },
      now,
    })
    if (did) changed++
  }
  return changed
}

/* ---------------------------- rent escalation ---------------------------- */

type LeaseRow = {
  id: string
  client_id: string
  lease_reference: string
  status: string
  start_date: Date | string
  end_date: Date | string | null
  rent_amount: string
  tenant_id: string | null
  landlord_id: string | null
  agent_id: string | null
  metadata: Record<string, unknown> | null
  settings: unknown
}

type Schedule = {
  id?: string
  agencyId?: string
  occupancyId?: string
  chargeType?: string
  amountCents?: number
  dayOfMonth?: number
  startOn?: string
  endOn?: string | null
  escalationPct: number | null
  nextEscalationOn: string | null
  createdAt?: string
  updatedAt?: string
}

const day = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))

export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString().slice(0, 10)
}

/** Next lease anniversary strictly after `today`. */
export function nextAnniversary(startIso: string, todayIso: string): string {
  let next = addMonthsIso(startIso, 12)
  while (next <= todayIso) next = addMonthsIso(next, 12)
  return next
}

const zar = (n: number) => `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function rentSweep(now: Date): Promise<{ noticed: number; applied: number; scheduled: number }> {
  const today = now.toISOString().slice(0, 10)
  const rows = await query<LeaseRow>(
    `SELECT l.id::text AS id, l.client_id::text AS client_id, l.lease_reference, l.status, l.start_date, l.end_date,
            l.rent_amount::text AS rent_amount, l.tenant_id::text AS tenant_id, l.landlord_id::text AS landlord_id,
            l.agent_id::text AS agent_id, l.metadata, c.settings
       FROM leases l JOIN clients c ON c.id = l.client_id
      WHERE l.status IN ('ACTIVE', 'NOTICE')`,
  )
  const out = { noticed: 0, applied: 0, scheduled: 0 }
  for (const l of rows) {
    const s = readEscalationSettings(l.settings)
    if (!s.enabled) continue
    const meta = { ...(l.metadata ?? {}) }
    let sch = (meta.billingSchedule as Schedule | null) ?? null
    const rent = Number(l.rent_amount)
    const recipients = [l.tenant_id, l.landlord_id, l.agent_id]
    const link = `/workspace/leases?lease=${encodeURIComponent(String(meta.frontend_id ?? l.id))}`
    let dirty = false

    if ((!sch || sch.escalationPct == null) && s.defaultRentEscalationPct) {
      sch = {
        ...(sch ?? {}),
        amountCents: Math.round(rent * 100),
        escalationPct: s.defaultRentEscalationPct,
        nextEscalationOn: nextAnniversary(day(l.start_date), today),
        updatedAt: now.toISOString(),
      }
      dirty = true
      out.scheduled++
    }
    if (!sch || !sch.escalationPct || sch.escalationPct <= 0 || !sch.nextEscalationOn) {
      if (dirty) await saveLease(l.id, meta, sch, null)
      continue
    }
    const pct = sch.escalationPct
    const on = sch.nextEscalationOn.slice(0, 10)
    const endsBefore = l.end_date && day(l.end_date) < on
    if (endsBefore) {
      if (dirty) await saveLease(l.id, { ...meta, billingSchedule: sch }, sch, null)
      continue
    }
    const newRent = Math.round(rent * (1 + pct / 100) * 100) / 100
        const daysLeft = Math.round((Date.parse(`${on}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY)

    if (daysLeft > 0 && daysLeft <= s.rentNoticeDays && meta.escalationNoticeFor !== on) {
      meta.escalationNoticeFor = on
      dirty = true
      out.noticed++
      await notifyUsers(recipients, {
        clientId: l.client_id,
        title: `Rent increase on ${on} (lease ${l.lease_reference})`,
        body: `Rent goes up by ${pct}% from ${on}: ${zar(rent)} → ${zar(newRent)} per month.`,
        link,
        resource: 'lease',
        action: 'rent_escalation',
      })
    }
    let applied: { from: number; to: number } | null = null
    if (on <= today && s.autoApplyRent) {
      const next = addMonthsIso(on, 12)
      sch = {
        ...sch,
        amountCents: Math.round(newRent * 100),
        nextEscalationOn: next,
        updatedAt: now.toISOString(),
      }
      const ops = (meta.renewalOps as Record<string, unknown> | null) ?? {}
      const line = `[Escalation ${today} · APPLY · automatic] +${pct}% rent ${rent} → ${newRent}; next ${next}.`
      meta.renewalOps = { ...ops, auditNotes: [String(ops.auditNotes ?? ''), line].filter(Boolean).join('\n') }
      applied = { from: rent, to: newRent }
      dirty = true
      out.applied++
      await notifyUsers(recipients, {
        clientId: l.client_id,
        title: `Rent increased (lease ${l.lease_reference})`,
        body: `From ${on} the rent is ${zar(newRent)} per month (was ${zar(rent)}, +${pct}%). Next increase ${next}.`,
        link,
        resource: 'lease',
        action: 'rent_escalation',
      })
      await query(
        `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, payload, created_at)
         VALUES ($1::uuid, 'rent_escalation', 'lease', $2::uuid, $3::jsonb, NOW())`,
        [l.client_id, l.id, JSON.stringify({ pct, from: rent, to: newRent, effectiveOn: on, nextEscalationOn: next })],
      )
    }
    if (dirty) await saveLease(l.id, { ...meta, billingSchedule: sch }, sch, applied)
  }
  return out
}

async function saveLease(
  id: string,
  meta: Record<string, unknown>,
  sch: Schedule | null,
  applied: { from: number; to: number } | null,
): Promise<void> {
  const next = { ...meta, billingSchedule: sch }
  if (applied) {
    await query(`UPDATE leases SET metadata = $2::jsonb, rent_amount = $3, updated_at = NOW() WHERE id = $1::uuid`, [
      id,
      JSON.stringify(next),
      applied.to,
    ])
  } else {
    await query(`UPDATE leases SET metadata = $2::jsonb, updated_at = NOW() WHERE id = $1::uuid`, [id, JSON.stringify(next)])
  }
}

/* ------------------------------- the engine ------------------------------ */

let lastRunAt = 0

/** Run every sweep. Each sweep fails on its own without stopping the others. */
/**
 * Lekaya subscription invoices not paid by the due date: agency admins on
 * day 1, again at 7 days (marked overdue), the platform team at 14 days.
 */
async function billingSweep(now: Date): Promise<number> {
  const { overdueInvoices, agencyAdminUuids: admins } = await import('./saasBilling.js')
  let changed = 0
  for (const inv of await overdueInvoices()) {
    const level = inv.daysOverdue >= 14 ? 3 : inv.daysOverdue >= 7 ? 2 : 1
    const did = await raise({
      clientId: inv.clientId,
      subjectType: 'saas_invoice',
      subjectId: inv.id,
      subjectRef: inv.number,
      title: `Lekaya invoice ${inv.number} unpaid`,
      reason: `R ${inv.balance.toFixed(2)} was due on ${inv.dueDate} (${inv.daysOverdue} day${inv.daysOverdue === 1 ? '' : 's'} ago). Pay and upload the proof of payment under Admin → Subscription & billing.`,
      level,
      link: '/workspace/admin/subscription',
      levelRecipients: async (l) => (l >= 3 ? superAdminUuids() : (await admins(inv.clientId)).length ? admins(inv.clientId) : superAdminUuids()),
      now,
    })
    if (did) changed++
  }
  return changed
}

/**
 * Rent, first-month rent and deposits not paid by the due date: the
 * landlord and agency admins are told (and the tenant reminded) after a day,
 * again at 7 days when the payment is marked overdue.
 */
async function arrearsSweep(now: Date): Promise<number> {
  const rows = await query<{
    id: string
    client_id: string
    party_user_id: string | null
    party_name: string
    balance: string
    due_date: Date | string
    days: string
    landlord_id: string | null
    agent_id: string | null
    title: string | null
    payment_type: string
  }>(
    `SELECT p.id::text AS id, p.client_id::text AS client_id, p.party_user_id::text AS party_user_id, p.party_name,
            (p.amount - COALESCE(p.paid_amount, 0))::text AS balance, p.due_date, (CURRENT_DATE - p.due_date)::text AS days,
            COALESCE(l.landlord_id, b.landlord_id)::text AS landlord_id, COALESCE(l.agent_id, un.agent_id)::text AS agent_id,
            COALESCE(un.title, un.unit_number::text) AS title, p.payment_type
       FROM payments p
       LEFT JOIN leases l ON l.id = p.lease_id
       LEFT JOIN units un ON un.id = COALESCE(p.unit_id, l.unit_id)
       LEFT JOIN buildings b ON b.id = un.building_id
      WHERE p.status IN ('DUE', 'OVERDUE') AND p.due_date < CURRENT_DATE AND p.due_date > CURRENT_DATE - 180
        AND p.payment_type IN ('RENT', 'FIRST_MONTH_RENT', 'DEPOSIT')
        AND p.amount > COALESCE(p.paid_amount, 0)`,
  )
  let changed = 0
  for (const r of rows) {
    const days = Number(r.days)
    const level = days >= 7 ? 2 : 1
    if (level === 2) await query(`UPDATE payments SET status = 'OVERDUE', updated_at = NOW() WHERE id = $1::uuid AND status = 'DUE'`, [r.id])
    const fe = (await resolveFrontendId('payment', r.id).catch(() => null)) ?? r.id
    const what = r.payment_type === 'DEPOSIT' ? 'Deposit' : 'Rent'
    const balance = Number(r.balance).toFixed(2)
    const due = r.due_date instanceof Date ? r.due_date.toISOString().slice(0, 10) : String(r.due_date).slice(0, 10)
    const did = await raise({
      clientId: r.client_id,
      subjectType: 'rent_payment',
      subjectId: r.id,
      subjectRef: fe,
      title: `${what} unpaid: ${r.party_name}${r.title ? ` · ${r.title}` : ''}`,
      reason: `R ${balance} was due on ${due} (${days} day${days === 1 ? '' : 's'} ago). Follow up with the tenant or record the payment.`,
      level,
      link: `/workspace/operations/payments/${encodeURIComponent(fe)}`,
      levelRecipients: async () => {
        const list = [...(await agencyAdminUuids(r.client_id))]
        if (r.landlord_id) list.push(r.landlord_id)
        if (r.agent_id) list.push(r.agent_id)
        return list
      },
      now,
    })
    if (did) {
      changed++
      if (r.party_user_id) {
        await notifyUsers([r.party_user_id], {
          clientId: r.client_id,
          title: `${what} payment overdue`,
          body: `R ${balance} was due on ${due}. Please pay, then upload your proof of payment under Payments.`,
          link: '/workspace/portals/tenant/payments',
          resource: 'payment',
          action: 'alert',
        })
      }
    }
  }
  return changed
}

export async function runEscalations(now = new Date()): Promise<Record<string, unknown>> {
  lastRunAt = now.getTime()
  const result: Record<string, unknown> = {}
  for (const [name, fn] of [
    ['maintenance', () => maintenanceSweep(now)],
    ['support', () => supportSweep(now)],
    ['rent', () => rentSweep(now)],
    ['billing', () => billingSweep(now)],
    ['arrears', () => arrearsSweep(now)],
  ] as const) {
    try {
      result[name] = await fn()
    } catch (err) {
      result[name] = { error: err instanceof Error ? err.message : String(err) }
      console.error(`[escalations] ${name}`, err)
    }
  }
  return result
}

/** Run the engine at most every 10 minutes from page loads (cron is the main trigger). */
export async function runEscalationsIfStale(): Promise<void> {
  if (Date.now() - lastRunAt < 10 * 60_000) return
  await runEscalations().catch(() => undefined)
}

/* ---------------------------------- API ---------------------------------- */

async function clientUuidFor(agencyId: string | null): Promise<string | null> {
  if (!agencyId) return null
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM clients WHERE id::text = $1 OR settings->>'frontend_id' = $1 LIMIT 1`,
    [agencyId],
  )
  return rows[0]?.id ?? null
}

const STAFF = new Set(['super_admin', 'client_admin', 'agent_admin', 'ground_agent', 'agent'])
const ADMINS = new Set(['super_admin', 'client_admin', 'agent_admin'])

function forbid(message = 'Not allowed'): Error {
  return Object.assign(new Error(message), { status: 403 })
}

export async function listEscalations(actor: DemoActor): Promise<{
  escalations: EscalationRecord[]
  rent: Array<Record<string, unknown>>
}> {
  if (!STAFF.has(actor.role)) throw forbid()
  await runEscalationsIfStale()
  const clientId = actor.role === 'super_admin' ? null : await clientUuidFor(actor.agencyId)
  if (actor.role !== 'super_admin' && !clientId) return { escalations: [], rent: [] }
  const rows = await query<EventRow & { fe: string | null }>(
    `SELECT e.id::text AS id, e.client_id::text AS client_id, e.subject_id::text AS subject_id, e.payload, e.created_at,
            COALESCE(c.settings->>'frontend_id', c.id::text) AS fe
       FROM event_log e LEFT JOIN clients c ON c.id = e.client_id
      WHERE e.event_type = 'escalation' AND ($1::uuid IS NULL OR e.client_id = $1::uuid)
        AND (COALESCE(e.payload->>'status', 'open') <> 'resolved' OR e.created_at > NOW() - INTERVAL '30 days')
      ORDER BY e.created_at DESC LIMIT 300`,
    [clientId],
  )
  const rent = await query<Record<string, unknown>>(
    `SELECT l.id::text AS id, l.lease_reference AS "reference", COALESCE(l.metadata->>'tenantName', '') AS "tenantName",
            l.rent_amount::float AS rent, (l.metadata->'billingSchedule'->>'escalationPct')::float AS pct,
            l.metadata->'billingSchedule'->>'nextEscalationOn' AS "nextOn",
            COALESCE(l.metadata->>'frontend_id', l.id::text) AS "leaseId", c.company_name AS agency
       FROM leases l JOIN clients c ON c.id = l.client_id
      WHERE l.status IN ('ACTIVE', 'NOTICE') AND ($1::uuid IS NULL OR l.client_id = $1::uuid)
        AND (l.metadata->'billingSchedule'->>'escalationPct') IS NOT NULL
      ORDER BY l.metadata->'billingSchedule'->>'nextEscalationOn' NULLS LAST LIMIT 300`,
    [clientId],
  )
  return { escalations: rows.map((r) => toRecord(r, r.fe)), rent }
}

async function loadScoped(actor: DemoActor, id: string): Promise<EventRow> {
  const rows = await query<EventRow>(
    `SELECT id::text AS id, client_id::text AS client_id, subject_id::text AS subject_id, payload, created_at
       FROM event_log WHERE id = $1::uuid AND event_type = 'escalation' LIMIT 1`,
    [id],
  )
  const row = rows[0]
  if (!row) throw Object.assign(new Error('Escalation not found'), { status: 404 })
  if (actor.role !== 'super_admin') {
    const clientId = await clientUuidFor(actor.agencyId)
    if (!clientId || row.client_id !== clientId) throw forbid()
  }
  return row
}

async function actorUuid(actor: DemoActor): Promise<string | null> {
  const { resolveUuid } = await import('./entityMap.js')
  return (await resolveUuid('user', actor.userId).catch(() => null)) ?? null
}

/** acknowledge · resolve · reopen, with an optional note. */
export async function actOnEscalation(
  actor: DemoActor,
  id: string,
  body: { action?: unknown; note?: unknown },
): Promise<EscalationRecord> {
  if (!STAFF.has(actor.role)) throw forbid()
  const row = await loadScoped(actor, id)
  const action = String(body.action ?? '')
  const status = action === 'acknowledge' ? 'acknowledged' : action === 'resolve' ? 'resolved' : action === 'reopen' ? 'open' : null
  if (!status) throw Object.assign(new Error('Unknown action'), { status: 400 })
  const at = new Date().toISOString()
  const by = await actorUuid(actor)
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : null
  const p = { ...(row.payload ?? {}) }
  p.status = status
  p.updatedAt = at
  p.history = [...(Array.isArray(p.history) ? p.history : []), { at, action, by, note }]
  await savePayload(row.id, p)
  return toRecord({ ...row, payload: p }, null)
}

/** Staff escalate a maintenance ticket by hand: one level up from where it is. */
export async function escalateManually(
  actor: DemoActor,
  body: { ticketId?: unknown; reason?: unknown },
): Promise<{ level: number }> {
  if (!STAFF.has(actor.role)) throw forbid()
  const ref = String(body.ticketId ?? '').trim()
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : 'Escalated by staff'
  if (!ref) throw Object.assign(new Error('ticketId is required'), { status: 400 })
  const { resolveUuid } = await import('./entityMap.js')
  const uuid = /^[0-9a-f-]{36}$/i.test(ref) ? ref : await resolveUuid('ticket', ref).catch(() => null)
  if (!uuid) throw Object.assign(new Error('Ticket not found'), { status: 404 })
  let rows: TicketRow[]
  try {
    rows = await query<TicketRow>(`${TICKET_SELECT} WHERE t.id = $1::uuid`, [uuid])
  } catch {
    rows = await query<TicketRow>(
      `SELECT t.id::text AS id, t.client_id::text AS client_id, t.title, t.priority, t.status, t.contractor_id::text AS contractor_id,
              t.assigned_to::text AS assigned_to, NULL::text AS unit_agent, t.created_at, NULL AS settings
         FROM maintenance_tickets t WHERE t.id = $1::uuid`,
      [uuid],
    )
  }
  const t = rows[0]
  if (!t) throw Object.assign(new Error('Ticket not found'), { status: 404 })
  if (actor.role !== 'super_admin') {
    const clientId = await clientUuidFor(actor.agencyId)
    if (clientId !== t.client_id) throw forbid()
  }
  const existing = await openEscalationFor(t.id)
  const level = Math.min(3, (existing ? Number(existing.payload?.level ?? 0) : 0) + 1)
  const by = await actorUuid(actor)
  await raise({
    clientId: t.client_id,
    subjectType: 'maintenance_ticket',
    subjectId: t.id,
    subjectRef: ref,
    title: t.title,
    reason,
    level,
    link: await ticketLink(t.id),
    levelRecipients: (l) => ticketRecipients(t, l),
    actorUuid: by,
    manual: true,
    now: new Date(),
  })
  await query(`UPDATE maintenance_tickets SET escalated_at = COALESCE(escalated_at, NOW()) WHERE id = $1::uuid`, [t.id])
  return { level }
}

export async function getEscalationSettings(actor: DemoActor, agencyId?: string | null): Promise<EscalationSettings> {
  if (!STAFF.has(actor.role)) throw forbid()
  const target = actor.role === 'super_admin' ? (agencyId ?? actor.agencyId) : actor.agencyId
  const clientId = await clientUuidFor(target ?? null)
  if (!clientId) return readEscalationSettings(null)
  const rows = await query<{ settings: unknown }>(`SELECT settings FROM clients WHERE id = $1::uuid`, [clientId])
  return readEscalationSettings(rows[0]?.settings)
}

export async function saveEscalationSettings(
  actor: DemoActor,
  agencyId: string | null | undefined,
  input: unknown,
): Promise<EscalationSettings> {
  if (!ADMINS.has(actor.role)) throw forbid('Only agency admins can change escalation settings')
  const target = actor.role === 'super_admin' ? (agencyId ?? actor.agencyId) : actor.agencyId
  const clientId = await clientUuidFor(target ?? null)
  if (!clientId) throw Object.assign(new Error('Choose an agency'), { status: 400 })
  const clean = readEscalationSettings({ escalation: input })
  await query(
    `UPDATE clients SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('escalation', $2::jsonb), updated_at = NOW()
      WHERE id = $1::uuid`,
    [clientId, JSON.stringify(clean)],
  )
  return clean
}
