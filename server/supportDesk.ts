/**
 * Help desk API: system / support tickets to the super admins.
 *
 * POST /api/support-tickets            create (any signed-in user)
 * POST /api/support-tickets/:id/actions  reply · status · priority · assign ·
 *                                        close · reopen · rate
 *
 * Rows stay in event_log (event_type 'support_ticket', no migration). Every
 * fact the client could forge (submitter, role, routing, assignee, timestamps,
 * reply author) is set here from the signed-in actor. Notifications are
 * written by the server, so they reach the other side whoever acts.
 */
import { randomUUID } from 'node:crypto'
import { query, withTransaction } from './db.js'
import { ensureEntityMapTable, ensureUuid, resolveUuid } from './entityMap.js'
import type { DemoActor } from './actor.js'
import { actorIdAliases, agencyFeId, resolveActorUsersManage } from './scopeGate.js'
import { checkPhotos } from '../src/lib/photoLimits.js'
import {
  SUPPORT_ATTACHMENTS_MAX,
  SUPPORT_BODY_MAX,
  SUPPORT_REPLIES_MAX,
  SUPPORT_REPLY_MAX,
  SUPPORT_SUBJECT_MAX,
  SUPPORT_STATUS_DESK_LABEL,
  SUPPORT_STATUS_LABEL,
  canResolveSupportTicket,
  nextSupportStatus,
  normalizeSupportCategory,
  normalizeSupportPriority,
  normalizeSupportStatus,
  redactSupportTicketForReporter,
  supportActionRefusal,
  supportTicketFromRow,
  type SupportAction,
  type SupportReply,
  type SupportTicket,
  type SupportViewer,
} from '../src/lib/supportTickets.js'

type Row = {
  id: string
  client_id: string | null
  event_type: string
  actor_user_id: string | null
  payload: Record<string, unknown> | null
  created_at: Date | string
}

function httpError(status: number, message: string, code?: string): Error {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) })
}

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export const HELP_LINK = (id: string) => `/workspace/help?ticket=${encodeURIComponent(id)}`

/** Every active super admin (users.id uuid). */
export async function superAdminUuids(): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM users
      WHERE COALESCE(active, true)
        AND (role = 'SUPER_ADMIN' OR metadata->>'frontend_role' = 'super_admin')`,
  )
  return rows.map((r) => r.id)
}

async function isSuperAdminUser(uuid: string): Promise<boolean> {
  const rows = await query<{ ok: boolean }>(
    `SELECT (role = 'SUPER_ADMIN' OR metadata->>'frontend_role' = 'super_admin') AS ok
       FROM users WHERE id = $1::uuid AND COALESCE(active, true) LIMIT 1`,
    [uuid],
  )
  return rows[0]?.ok === true
}

async function displayName(uuid: string | null): Promise<string> {
  if (!uuid) return ''
  const rows = await query<{ name: string | null }>(
    `SELECT NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '') AS name FROM users WHERE id = $1::uuid LIMIT 1`,
    [uuid],
  )
  return rows[0]?.name ?? ''
}

/** Insert one notification per recipient (skips the actor and duplicates). */
export async function notifyUsers(
  recipients: Array<string | null | undefined>,
  note: { clientId: string | null; title: string; body: string; link: string; resource: string; action: string },
  skipUuid?: string | null,
): Promise<number> {
  const seen = new Set<string>()
  for (const r of recipients) {
    if (!r || r === skipUuid || seen.has(r)) continue
    seen.add(r)
    await query(
      `INSERT INTO notifications (client_id, user_id, title, body, link_path, resource_type, action_type)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)`,
      [note.clientId, r, note.title.slice(0, 200), note.body.slice(0, 1000), note.link, note.resource, note.action],
    )
  }
  return seen.size
}

async function viewerFor(actor: DemoActor): Promise<SupportViewer> {
  return {
    userId: actor.userId,
    role: actor.role,
    agencyId: (await agencyFeId(actor.agencyId)) ?? null,
    hasUsersManage: await resolveActorUsersManage(actor),
    aliasIds: await actorIdAliases(actor),
  }
}

async function toTicket(feId: string, row: Row): Promise<SupportTicket> {
  return supportTicketFromRow(row, {
    id: feId,
    agencyId: await agencyFeId(row.client_id),
    fallbackSubmitter: '',
  })
}

export type CreateSupportTicketInput = {
  id?: unknown
  subject?: unknown
  body?: unknown
  category?: unknown
  pageUrl?: unknown
  userAgent?: unknown
  attachments?: unknown
  submitterName?: unknown
}

export async function createSupportTicket(
  actor: DemoActor,
  input: CreateSupportTicketInput,
  requestUserAgent?: string | null,
): Promise<SupportTicket> {
  await ensureEntityMapTable()
  const feId = text(input.id, 64) || `HD-${randomUUID().slice(0, 8)}`
  if (!/^[A-Za-z0-9_-]+$/.test(feId)) throw httpError(400, 'Invalid ticket id', 'SUPPORT_ID_INVALID')
  if (await resolveUuid('support_ticket', feId)) throw httpError(409, 'Ticket already exists', 'SUPPORT_EXISTS')
  const subject = text(input.subject, SUPPORT_SUBJECT_MAX)
  const body = text(input.body, SUPPORT_BODY_MAX)
  if (!subject || !body) throw httpError(400, 'Add a subject and a description.', 'SUPPORT_FIELDS_REQUIRED')
  let attachments: string[] = []
  if (Array.isArray(input.attachments)) {
    const checked = checkPhotos(input.attachments, { maxCount: SUPPORT_ATTACHMENTS_MAX })
    if (checked.ok === false) throw httpError(400, `Attachment not accepted: ${checked.reason}`, 'SUPPORT_ATTACHMENT_INVALID')
    attachments = checked.urls
  }
  const actorUuid = await resolveUuid('user', actor.userId)
  const name = text(input.submitterName, 120) || (await displayName(actorUuid)) || 'User'
  const now = new Date().toISOString()
  const payload = {
    frontendId: feId,
    subject,
    body,
    category: normalizeSupportCategory(input.category),
    priority: 'normal',
    pageUrl: text(input.pageUrl, 500) || null,
    userAgent: text(input.userAgent, 400) || text(requestUserAgent, 400) || null,
    attachments,
    submittedByUserId: actor.userId,
    submitterName: name,
    submitterRole: actor.role,
    reporterAgencyId: (await agencyFeId(actor.agencyId)) ?? null,
    status: 'new',
    replies: [],
    updatedAt: now,
  }
  const uuid = await ensureUuid('support_ticket', feId)
  const rows = await query<Row>(
    `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
     VALUES ($1::uuid, NULL, 'support_ticket', 'support_ticket', NULL, $2::uuid, $3::jsonb, NOW())
     RETURNING id::text AS id, client_id::text AS client_id, event_type, actor_user_id::text AS actor_user_id, payload, created_at`,
    [uuid, actorUuid, JSON.stringify(payload)],
  )
  await notifyUsers(
    await superAdminUuids(),
    {
      clientId: null,
      title: `New support ticket: ${subject}`,
      body: `${name} (${actor.role.replace(/_/g, ' ')}) · ${body.slice(0, 160)}`,
      link: HELP_LINK(feId),
      resource: 'support',
      action: 'created',
    },
    actorUuid,
  )
  return toTicket(feId, rows[0]!)
}

function parseAction(raw: Record<string, unknown>): SupportAction {
  const action = raw.action
  switch (action) {
    case 'reply':
      return {
        action,
        body: text(raw.body, SUPPORT_REPLY_MAX),
        internal: raw.internal === true,
        ...(raw.status ? { status: normalizeSupportStatus(raw.status) } : {}),
      }
    case 'status':
      return { action, status: normalizeSupportStatus(raw.status), note: text(raw.note, SUPPORT_REPLY_MAX) }
    case 'priority':
      return { action, priority: normalizeSupportPriority(raw.priority) }
    case 'assign':
      return { action, assigneeUserId: typeof raw.assigneeUserId === 'string' && raw.assigneeUserId ? raw.assigneeUserId : null }
    case 'close':
      return { action }
    case 'reopen':
      return { action, body: text(raw.body, SUPPORT_REPLY_MAX) }
    case 'rate':
      return { action, rating: Number(raw.rating), comment: text(raw.comment, 1000) }
    default:
      throw httpError(400, 'Unknown action', 'SUPPORT_ACTION_INVALID')
  }
}

export async function actOnSupportTicket(
  actor: DemoActor,
  feId: string,
  raw: Record<string, unknown>,
): Promise<SupportTicket> {
  await ensureEntityMapTable()
  const act = parseAction(raw)
  const uuid = await resolveUuid('support_ticket', feId)
  if (!uuid) throw httpError(404, 'Ticket not found', 'SUPPORT_NOT_FOUND')
  const viewer = await viewerFor(actor)
  const actorUuid = await resolveUuid('user', actor.userId)
  let assigneeName = ''
  let assigneeUuid: string | null = null
  if (act.action === 'assign' && act.assigneeUserId) {
    assigneeUuid = await resolveUuid('user', act.assigneeUserId)
    // Never trust a client-sent assignee: it must be an active super admin.
    if (!assigneeUuid || !(await isSuperAdminUser(assigneeUuid))) {
      throw httpError(400, 'Tickets can only be assigned to a super admin.', 'SUPPORT_ASSIGNEE_INVALID')
    }
    assigneeName = (await displayName(assigneeUuid)) || 'Super admin'
  }
  const actorName = text(raw.actorName, 120) || (await displayName(actorUuid)) || 'User'

  const result = await withTransaction(async () => {
    const rows = await query<Row>(
      `SELECT id::text AS id, client_id::text AS client_id, event_type, actor_user_id::text AS actor_user_id, payload, created_at
         FROM event_log WHERE id = $1::uuid FOR UPDATE`,
      [uuid],
    )
    const row = rows[0]
    if (!row || row.event_type !== 'support_ticket') throw httpError(404, 'Ticket not found', 'SUPPORT_NOT_FOUND')
    const before = await toTicket(feId, row)
    const desk = canResolveSupportTicket(viewer, before)
    const own = viewer.aliasIds?.has(before.submittedByUserId) ?? before.submittedByUserId === actor.userId
    if (!desk && !own) throw httpError(403, 'Forbidden: not your ticket', 'SUPPORT_FORBIDDEN')
    const refusal = supportActionRefusal(viewer, before, act)
    if (refusal) throw httpError(403, `Forbidden: ${refusal}`, 'SUPPORT_FORBIDDEN')

    const now = new Date().toISOString()
    const p = { ...row.payload } as Record<string, unknown>
    const replies = [...(before.replies ?? [])]
    const add = (body: string, extra: Partial<SupportReply> = {}) =>
      replies.push({
        id: `R-${randomUUID().slice(0, 8)}`,
        authorUserId: actor.userId,
        authorName: actorName,
        authorRole: actor.role,
        body,
        at: now,
        ...extra,
      })
    const status = nextSupportStatus(before.status, act, desk && !own)
    if (act.action === 'reply') add(act.body, act.internal ? { internal: true } : {})
    if (act.action === 'reopen' && act.body) add(act.body)
    if (act.action === 'status' && act.note) add(act.note)
    if (act.action === 'priority') {
      p.priority = act.priority
      add(`Priority set to ${act.priority}.`, { kind: 'event', internal: true })
    }
    if (act.action === 'assign') {
      p.assigneeUserId = act.assigneeUserId
      p.assigneeName = assigneeName || null
      add(act.assigneeUserId ? `Assigned to ${assigneeName}.` : 'Unassigned.', { kind: 'event', internal: true })
    }
    if (act.action === 'rate') {
      p.rating = act.rating
      p.ratingComment = act.comment || null
      add(`Rated ${act.rating}/5${act.comment ? `: ${act.comment}` : ''}`, { kind: 'event' })
    }
    if (status !== before.status) {
      add(`Status: ${SUPPORT_STATUS_DESK_LABEL[status]}.`, { kind: 'event' })
      if (status === 'resolved') {
        p.resolvedByUserId = actor.userId
        p.resolvedByName = actorName
        p.resolvedAt = now
      }
    }
    p.status = status
    p.replies = replies.slice(-SUPPORT_REPLIES_MAX)
    p.updatedAt = now
    const out = await query<Row>(
      `UPDATE event_log SET payload = $2::jsonb WHERE id = $1::uuid AND event_type = 'support_ticket'
       RETURNING id::text AS id, client_id::text AS client_id, event_type, actor_user_id::text AS actor_user_id, payload, created_at`,
      [uuid, JSON.stringify(p)],
    )
    return { before, after: await toTicket(feId, out[0]!), byDesk: desk && !own, own }
  })

  const { before, after, byDesk } = result
  const publicChange =
    (act.action === 'reply' && !act.internal) ||
    after.status !== before.status ||
    act.action === 'rate' ||
    act.action === 'reopen'
  if (publicChange) {
    if (byDesk) {
      // Desk acted: tell the reporter.
      const reporterUuid = await resolveUuid('user', after.submittedByUserId)
      const title =
        act.action === 'reply'
          ? `Support replied: ${after.subject}`
          : `Ticket ${SUPPORT_STATUS_LABEL[after.status].toLowerCase()}: ${after.subject}`
      const body =
        act.action === 'reply'
          ? act.body.slice(0, 200)
          : after.status === 'waiting_on_user'
            ? 'Support needs more information from you.'
            : `Your ticket is now ${SUPPORT_STATUS_LABEL[after.status].toLowerCase()}.`
      await notifyUsers([reporterUuid], {
        clientId: null,
        title,
        body,
        link: HELP_LINK(feId),
        resource: 'support',
        action: 'updated',
      }, actorUuid)
    } else {
      // Reporter acted: the assignee, else every super admin.
      const assignee = after.assigneeUserId ? await resolveUuid('user', after.assigneeUserId) : null
      const recipients = assignee ? [assignee] : await superAdminUuids()
      const what =
        act.action === 'reply'
          ? act.body.slice(0, 200)
          : act.action === 'rate'
            ? `Rated ${act.rating}/5`
            : `Now ${SUPPORT_STATUS_DESK_LABEL[after.status].toLowerCase()}`
      await notifyUsers(recipients, {
        clientId: null,
        title: `${after.submitterName || 'Reporter'} on: ${after.subject}`,
        body: what,
        link: HELP_LINK(feId),
        resource: 'support',
        action: 'updated',
      }, actorUuid)
    }
  }
  if (act.action === 'assign' && assigneeUuid) {
    await notifyUsers([assigneeUuid], {
      clientId: null,
      title: `Ticket assigned to you: ${after.subject}`,
      body: `${after.submitterName || 'A user'} · ${after.body.slice(0, 160)}`,
      link: HELP_LINK(feId),
      resource: 'support',
      action: 'assigned',
    }, actorUuid)
  }
  return result.byDesk || canResolveSupportTicket(viewer, after) ? after : redactSupportTicketForReporter(after)
}
