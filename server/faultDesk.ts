/**
 * Tenant faults (maintenance tickets seen from the tenant side).
 *
 * Routing: a fault goes to the responsible person for the property — the
 * ticket's assigned agent (the writer defaults it to the unit's agent), else
 * the agency's admins — and the landlord who owns the building is notified.
 *
 * GET  /api/tickets/:id/thread   conversation (server-checked access)
 * POST /api/tickets/:id/thread   { action: 'reply' | 'confirm' | 'reopen' }
 *
 * Thread entries are event_log rows (event_type 'fault_thread', subject_id =
 * maintenance_tickets.id). Access: the reporter, the tenant on the linked
 * lease, staff whose book holds the ticket, the owning landlord, the assigned
 * contractor, super admins. Internal notes are staff-only.
 */
import { query, withTransaction } from './db.js'
import { resolveUuid } from './entityMap.js'
import { TICKET_IDS } from './idMap.js'
import type { DemoActor } from './actor.js'
import { buildActorPropertyScope } from './scopeGate.js'
import { notifyUsers } from './supportDesk.js'
import { ticketInScope } from '../src/lib/scope.js'
import { feAgencyFromCache, fePropertyFromUnitCache, feUserFromCache, loadIdMapCache } from './idMapCache.js'
import {
  FAULT_REPLY_MAX,
  faultActionRefusal,
  type FaultAccess,
  type FaultThreadEntry,
} from '../src/lib/faults.js'

function httpError(status: number, message: string, code?: string): Error {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) })
}

type TicketRow = {
  id: string
  client_id: string
  unit_id: string
  lease_id: string | null
  reported_by: string | null
  assigned_to: string | null
  contractor_id: string | null
  status: string
  title: string
  priority: string
  landlord_id: string | null
  unit_agent_id: string | null
  lease_tenant_id: string | null
}

const STAFF = new Set(['client_admin', 'agent_admin', 'ground_agent', 'agent'])

async function ticketUuid(feId: string): Promise<string | null> {
  const reverse = Object.entries(TICKET_IDS).find(([, v]) => v === feId)?.[0]
  return reverse ?? (await resolveUuid('ticket', feId))
}

async function loadTicket(uuid: string): Promise<TicketRow | null> {
  const rows = await query<TicketRow>(
    `SELECT t.id::text AS id, t.client_id::text AS client_id, t.unit_id::text AS unit_id,
            t.lease_id::text AS lease_id, t.reported_by::text AS reported_by,
            t.assigned_to::text AS assigned_to, t.contractor_id::text AS contractor_id,
            t.status, t.title, t.priority,
            b.landlord_id::text AS landlord_id, u.agent_id::text AS unit_agent_id,
            l.tenant_id::text AS lease_tenant_id
       FROM maintenance_tickets t
       JOIN units u ON u.id = t.unit_id
       LEFT JOIN buildings b ON b.id = u.building_id
       LEFT JOIN leases l ON l.id = t.lease_id
      WHERE t.id = $1::uuid LIMIT 1`,
    [uuid],
  )
  return rows[0] ?? null
}

/** Who the actor is to this ticket, or null (no access). */
export async function faultAccessFor(actor: DemoActor, t: TicketRow): Promise<FaultAccess | null> {
  if (actor.role === 'super_admin') return 'staff'
  const me = await resolveUuid('user', actor.userId)
  if (actor.role === 'tenant') {
    if (me && (t.reported_by === me || t.lease_tenant_id === me)) return 'reporter'
    return null
  }
  if (actor.role === 'landlord') return me && t.landlord_id === me ? 'landlord' : null
  if (actor.role === 'contractor') return me && t.contractor_id === me ? 'contractor' : null
  if (!STAFF.has(actor.role)) return null
  const cache = await loadIdMapCache()
  const scope = await buildActorPropertyScope(actor)
  const ok = ticketInScope(scope, {
    propertyId: fePropertyFromUnitCache(cache, t.unit_id) ?? t.unit_id,
    agencyId: feAgencyFromCache(cache, t.client_id) ?? t.client_id,
    assignedAgentId: feUserFromCache(cache, t.assigned_to) ?? null,
    contractorId: feUserFromCache(cache, t.contractor_id) ?? null,
  })
  return ok ? 'staff' : null
}

/** Active agency admins of a client (users.id uuid). */
async function agencyAdminUuids(clientId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM users
      WHERE client_id = $1::uuid AND COALESCE(active, true)
        AND (role IN ('AGENCY_ADMIN', 'AGENT_ADMIN')
             OR metadata->>'frontend_role' IN ('client_admin', 'agent_admin'))`,
    [clientId],
  )
  return rows.map((r) => r.id)
}

/**
 * Responsible person(s) for a fault: the assigned agent, else the unit's
 * agent, else the agency admins.
 */
export async function faultResponsibleUuids(t: Pick<TicketRow, 'assigned_to' | 'unit_agent_id' | 'client_id'>): Promise<string[]> {
  const agent = t.assigned_to ?? t.unit_agent_id
  if (agent) return [agent]
  return agencyAdminUuids(t.client_id)
}

const STAFF_LINK = (fe: string) => `/workspace/operations/maintenance/${encodeURIComponent(fe)}`
const TENANT_LINK = '/workspace/portals/tenant/maintenance'

function isEmergency(priority: string): boolean {
  return priority.toUpperCase() === 'EMERGENCY'
}

/**
 * New tenant fault: notify the responsible person and the landlord. Called by
 * /api/persist after a tenant's new ticket is written.
 */
export async function notifyFaultReported(actor: DemoActor, ticketUuidValue: string, feId: string): Promise<number> {
  const t = await loadTicket(ticketUuidValue)
  if (!t) return 0
  const me = await resolveUuid('user', actor.userId)
  const emergency = isEmergency(t.priority)
  const prefix = emergency ? 'EMERGENCY fault' : 'New fault'
  let sent = await notifyUsers(await faultResponsibleUuids(t), {
    clientId: t.client_id,
    title: `${prefix}: ${t.title}`,
    body: emergency ? 'A tenant reported an emergency. Respond now.' : 'A tenant reported a fault on a property you manage.',
    link: STAFF_LINK(feId),
    resource: 'maintenance',
    action: emergency ? 'escalated' : 'created',
  }, me)
  if (t.landlord_id) {
    sent += await notifyUsers([t.landlord_id], {
      clientId: t.client_id,
      title: `${prefix} at your property: ${t.title}`,
      body: 'Your tenant reported a fault. The managing agent has been notified.',
      link: STAFF_LINK(feId),
      resource: 'maintenance',
      action: 'created',
    }, me)
  }
  return sent
}

type ThreadRow = { id: string; payload: Record<string, unknown> | null; created_at: Date | string }

function toEntry(r: ThreadRow): FaultThreadEntry {
  const p = r.payload ?? {}
  const s = (v: unknown) => (typeof v === 'string' ? v : '')
  return {
    id: r.id,
    kind: p.kind === 'confirmed' || p.kind === 'reopened' ? p.kind : 'reply',
    body: s(p.body),
    authorUserId: s(p.authorUserId),
    authorName: s(p.authorName),
    authorRole: s(p.authorRole),
    at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    ...(typeof p.rating === 'number' ? { rating: p.rating } : {}),
    ...(p.internal === true ? { internal: true } : {}),
  }
}

async function readThread(uuid: string, access: FaultAccess): Promise<FaultThreadEntry[]> {
  const rows = await query<ThreadRow>(
    `SELECT id::text AS id, payload, created_at FROM event_log
      WHERE event_type = 'fault_thread' AND subject_id = $1::uuid
      ORDER BY created_at ASC LIMIT 300`,
    [uuid],
  )
  const entries = rows.map(toEntry)
  return access === 'staff' ? entries : entries.filter((e) => !e.internal)
}

async function requireAccess(actor: DemoActor, feId: string) {
  const uuid = await ticketUuid(feId)
  const t = uuid ? await loadTicket(uuid) : null
  if (!uuid || !t) throw httpError(404, 'Fault not found', 'FAULT_NOT_FOUND')
  const access = await faultAccessFor(actor, t)
  if (!access) throw httpError(403, 'Forbidden: not your fault ticket', 'FAULT_FORBIDDEN')
  return { uuid, t, access }
}

export async function getFaultThread(actor: DemoActor, feId: string) {
  const { uuid, access } = await requireAccess(actor, feId)
  return { access, entries: await readThread(uuid, access) }
}

export async function postFaultThread(actor: DemoActor, feId: string, raw: Record<string, unknown>) {
  const { uuid, t, access } = await requireAccess(actor, feId)
  const action = raw.action === 'confirm' || raw.action === 'reopen' ? raw.action : 'reply'
  const body = typeof raw.body === 'string' ? raw.body.trim().slice(0, FAULT_REPLY_MAX) : ''
  const rating = raw.rating == null || raw.rating === '' ? null : Number(raw.rating)
  const internal = raw.internal === true
  const refusal = faultActionRefusal(access, t.status, { action, body, rating, internal })
  if (refusal) throw httpError(action === 'reply' && !body ? 400 : 403, `Forbidden: ${refusal}`, 'FAULT_ACTION_REFUSED')

  const me = await resolveUuid('user', actor.userId)
  const nameRows = me
    ? await query<{ name: string | null }>(
        `SELECT NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '') AS name FROM users WHERE id = $1::uuid`,
        [me],
      )
    : []
  const authorName = nameRows[0]?.name ?? (typeof raw.actorName === 'string' ? raw.actorName.slice(0, 120) : 'User')
  const payload = {
    kind: action === 'confirm' ? 'confirmed' : action === 'reopen' ? 'reopened' : 'reply',
    ticketRef: feId,
    body,
    authorUserId: actor.userId,
    authorName,
    authorRole: actor.role,
    ...(action === 'confirm' && rating ? { rating } : {}),
    ...(internal ? { internal: true } : {}),
  }
  await withTransaction(async () => {
    await query(
      `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
       VALUES ($1::uuid, 'fault_thread', 'maintenance_ticket', $2::uuid, $3::uuid, $4::jsonb, NOW())`,
      [t.client_id, uuid, me, JSON.stringify(payload)],
    )
    if (action === 'reopen') {
      await query(
        `UPDATE maintenance_tickets SET status = 'OPEN', completed_at = NULL, updated_at = NOW() WHERE id = $1::uuid`,
        [uuid],
      )
    }
  })

  // Notify the other side. Internal notes notify nobody.
  if (!internal) {
    const responsible = await faultResponsibleUuids(t)
    const reporter = t.reported_by ?? t.lease_tenant_id
    if (access === 'reporter') {
      const title =
        action === 'confirm'
          ? `Fault confirmed fixed: ${t.title}${rating ? ` (${rating}/5)` : ''}`
          : action === 'reopen'
            ? `Fault reopened: ${t.title}`
            : `Tenant replied: ${t.title}`
      await notifyUsers([...responsible, ...(t.contractor_id && action !== 'confirm' ? [t.contractor_id] : [])], {
        clientId: t.client_id,
        title,
        body: body.slice(0, 200) || (action === 'reopen' ? 'The tenant says the fault is not fixed.' : 'The tenant confirmed the repair.'),
        link: STAFF_LINK(feId),
        resource: 'maintenance',
        action: action === 'reopen' ? 'reopened' : 'updated',
      }, me)
    } else {
      await notifyUsers([reporter], {
        clientId: t.client_id,
        title: `Update on your fault: ${t.title}`,
        body: body.slice(0, 200),
        link: TENANT_LINK,
        resource: 'maintenance',
        action: 'updated',
      }, me)
      // Landlord / contractor replies also reach the responsible agent.
      if (access === 'landlord' || access === 'contractor') {
        await notifyUsers(responsible, {
          clientId: t.client_id,
          title: `${access === 'landlord' ? 'Landlord' : 'Contractor'} replied: ${t.title}`,
          body: body.slice(0, 200),
          link: STAFF_LINK(feId),
          resource: 'maintenance',
          action: 'updated',
        }, me)
      }
    }
  }
  return { access, entries: await readThread(uuid, access), status: action === 'reopen' ? 'Requested' : null }
}
