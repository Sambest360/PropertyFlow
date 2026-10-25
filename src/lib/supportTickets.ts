/**
 * Help desk — shared rules for system / support tickets (client + server).
 *
 * Tickets live in event_log with event_type = 'support_ticket' (no migration).
 * Routing: every new ticket goes to the platform desk (agencyId null), which
 * only super admins work. Property problems are not support tickets: tenants
 * report those as faults, which go to the property's responsible people.
 * Legacy rows routed to an agency (CR7) stay on that agency's desk.
 *
 * Desk = super_admin, plus client_admin / agent_admin holding users.manage for
 * legacy agency tickets. The desk replies (public or internal), moves the
 * status, sets the priority, and (super admin) assigns a super admin. The
 * reporter replies, closes, reopens a resolved ticket and rates it.
 */
import { can, isAgencyStaff } from './permissions.js'
import type { Role } from '../types/domain.js'

export const SUPPORT_STATUSES = ['new', 'in_progress', 'waiting_on_user', 'resolved', 'closed'] as const
export type SupportTicketStatus = (typeof SUPPORT_STATUSES)[number]

export const SUPPORT_STATUS_LABEL: Record<SupportTicketStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  waiting_on_user: 'Waiting on you',
  resolved: 'Resolved',
  closed: 'Closed',
}
/** Desk-side label (the reporter sees "Waiting on you"). */
export const SUPPORT_STATUS_DESK_LABEL: Record<SupportTicketStatus, string> = {
  ...SUPPORT_STATUS_LABEL,
  waiting_on_user: 'Waiting on user',
}

export const SUPPORT_CATEGORIES = [
  { key: 'bug', label: 'Something is broken' },
  { key: 'account', label: 'Account or access' },
  { key: 'billing', label: 'Billing' },
  { key: 'feature', label: 'Feature request' },
  { key: 'other', label: 'Other' },
] as const
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]['key']

export const SUPPORT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number]

export type SupportReply = {
  id: string
  authorUserId: string
  authorName: string
  authorRole: string
  body: string
  at: string
  /** Desk-only note; never sent to the reporter. */
  internal?: boolean
  /** 'event' = a status / assignment line written by the server. */
  kind?: 'reply' | 'event'
}

export type SupportTicket = {
  id: string
  /** Routed agency (FE id). null = platform (super admins). */
  agencyId: string | null
  submittedByUserId: string
  submitterName: string
  submitterRole: string
  subject: string
  body: string
  status: SupportTicketStatus
  createdAt: string
  category?: SupportCategory
  priority?: SupportPriority
  /** Page the reporter was on, and their browser (auto-captured). */
  pageUrl?: string | null
  userAgent?: string | null
  attachments?: string[]
  assigneeUserId?: string | null
  assigneeName?: string | null
  replies?: SupportReply[]
  rating?: number | null
  ratingComment?: string | null
  updatedAt?: string | null
  /** Agency of the reporter at submit time (context only; not routing). */
  reporterAgencyId?: string | null
  resolvedByUserId?: string | null
  resolvedByName?: string | null
  resolvedAt?: string | null
  resolutionNote?: string | null
}

/** Payload keys a legacy (persist) resolve may change. Everything else is fixed at submit. */
export const SUPPORT_TICKET_RESOLUTION_KEYS = [
  'status',
  'resolvedByUserId',
  'resolvedByName',
  'resolvedAt',
  'resolutionNote',
] as const

export const SUPPORT_SUBJECT_MAX = 160
export const SUPPORT_BODY_MAX = 4000
export const SUPPORT_NOTE_MAX = 2000
export const SUPPORT_REPLY_MAX = 4000
export const SUPPORT_ATTACHMENTS_MAX = 3
export const SUPPORT_REPLIES_MAX = 200

export type SupportViewer = {
  userId: string
  role: Role
  agencyId: string | null
  /**
   * users.manage as the viewer actually holds it. The UI passes the effective
   * permission (agency pack applied); the server uses the role default.
   */
  hasUsersManage?: boolean
  /**
   * Every id that round-trips to the viewer's account (server: actorIdAliases).
   * Own-ticket matching uses only these ids, never an email.
   */
  aliasIds?: ReadonlySet<string>
}

export function normalizeSupportStatus(v: unknown): SupportTicketStatus {
  if (v === 'open') return 'new'
  return (SUPPORT_STATUSES as readonly unknown[]).includes(v) ? (v as SupportTicketStatus) : 'new'
}

export function normalizeSupportCategory(v: unknown): SupportCategory {
  return SUPPORT_CATEGORIES.some((c) => c.key === v) ? (v as SupportCategory) : 'other'
}

export function normalizeSupportPriority(v: unknown): SupportPriority {
  return (SUPPORT_PRIORITIES as readonly unknown[]).includes(v) ? (v as SupportPriority) : 'normal'
}

export function isSupportTicketOpen(status: SupportTicketStatus): boolean {
  return status !== 'resolved' && status !== 'closed'
}

export function supportCategoryLabel(key: string | undefined): string {
  return SUPPORT_CATEGORIES.find((c) => c.key === key)?.label ?? 'Other'
}

export function isViewerOwnTicket(viewer: SupportViewer, submittedByUserId: string): boolean {
  if (!submittedByUserId) return false
  return viewer.aliasIds ? viewer.aliasIds.has(submittedByUserId) : submittedByUserId === viewer.userId
}

function usersManage(viewer: SupportViewer): boolean {
  return viewer.hasUsersManage ?? can(viewer.role, 'users.manage')
}

/**
 * Desk roles: super admin, or an agency admin (client_admin / agent_admin)
 * holding users.manage (legacy agency tickets only). ground_agent and agent
 * never hold the desk.
 */
export function isSupportDeskViewer(viewer: SupportViewer): boolean {
  if (viewer.role === 'super_admin') return true
  return (viewer.role === 'client_admin' || viewer.role === 'agent_admin') && usersManage(viewer)
}

/**
 * Server-derived routing: every new ticket goes to the platform desk (super
 * admins). Arguments are kept so callers state who is submitting.
 */
export function supportTicketRoutingAgency(_role: Role, _agencyId: string | null): string | null {
  return null
}

/** Whether the viewer works this ticket on their desk. */
export function canResolveSupportTicket(
  viewer: SupportViewer,
  ticket: { agencyId: string | null; submitterRole?: string | null },
): boolean {
  if (!isSupportDeskViewer(viewer)) return false
  if (viewer.role === 'super_admin') return true
  // Agency desk: own agency only. Platform (null) tickets are super admin only.
  if (!ticket.agencyId || !viewer.agencyId) return false
  // Staff tickets always belong to platform support, even if a stored row
  // carries an agency.
  const sr = ticket.submitterRole as Role | null | undefined
  if (sr && (sr === 'super_admin' || isAgencyStaff(sr))) return false
  return ticket.agencyId === viewer.agencyId
}

/** Tickets on the viewer's desk (excludes their own-submission list). */
export function isOnSupportDesk(
  viewer: SupportViewer,
  ticket: { agencyId: string | null; submitterRole?: string | null },
): boolean {
  return canResolveSupportTicket(viewer, ticket)
}

export type SupportAction =
  | { action: 'reply'; body: string; internal?: boolean; status?: SupportTicketStatus }
  | { action: 'status'; status: SupportTicketStatus; note?: string }
  | { action: 'priority'; priority: SupportPriority }
  | { action: 'assign'; assigneeUserId: string | null }
  | { action: 'close' }
  | { action: 'reopen'; body?: string }
  | { action: 'rate'; rating: number; comment?: string }

/**
 * Who may take an action on a ticket (the server re-checks; assignment also
 * needs the assignee to be a super admin). Returns a reason when refused.
 */
export function supportActionRefusal(
  viewer: SupportViewer,
  ticket: Pick<SupportTicket, 'agencyId' | 'submitterRole' | 'submittedByUserId' | 'status' | 'rating'>,
  act: SupportAction,
): string | null {
  const desk = canResolveSupportTicket(viewer, ticket)
  const own = isViewerOwnTicket(viewer, ticket.submittedByUserId)
  const open = isSupportTicketOpen(ticket.status)
  switch (act.action) {
    case 'reply':
      if (!act.body.trim()) return 'Write a reply first.'
      if (desk) return null
      if (!own) return 'Not your ticket.'
      if (act.internal) return 'Only support can add internal notes.'
      if (ticket.status === 'closed') return 'This ticket is closed. Raise a new one.'
      return null
    case 'status':
      return desk ? null : 'Only support can change the status.'
    case 'priority':
      return desk ? null : 'Only support can set the priority.'
    case 'assign':
      return desk && viewer.role === 'super_admin' ? null : 'Only a super admin can assign tickets.'
    case 'close':
      if (!own && !desk) return 'Not your ticket.'
      return ticket.status === 'closed' ? 'Already closed.' : null
    case 'reopen':
      if (!own && !desk) return 'Not your ticket.'
      return ticket.status === 'resolved' ? null : 'Only a resolved ticket can be reopened.'
    case 'rate':
      if (!own) return 'Only the reporter rates a ticket.'
      if (open) return 'Rate once the ticket is resolved.'
      if (ticket.rating) return 'Already rated.'
      return Number.isInteger(act.rating) && act.rating >= 1 && act.rating <= 5 ? null : 'Pick 1 to 5 stars.'
  }
}

/** Status after an action (automatic moves on replies). */
export function nextSupportStatus(
  current: SupportTicketStatus,
  act: SupportAction,
  byDesk: boolean,
): SupportTicketStatus {
  switch (act.action) {
    case 'reply':
      if (act.internal) return current
      if (byDesk) {
        if (act.status) return act.status
        return current === 'new' ? 'in_progress' : current
      }
      // Reporter replied: back with support.
      return current === 'waiting_on_user' || current === 'resolved' ? 'in_progress' : current
    case 'status':
      return act.status
    case 'close':
      return 'closed'
    case 'reopen':
      return 'in_progress'
    default:
      return current
  }
}

/** Hours to the first desk reply, by priority (desk-side indicator only). */
export const SUPPORT_FIRST_RESPONSE_HOURS: Record<SupportPriority, number> = {
  urgent: 4,
  high: 8,
  normal: 24,
  low: 72,
}

export type SupportAge = { label: string; tone: 'neutral' | 'warning' | 'danger'; overdue: boolean }

function ageLabel(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

/**
 * Desk-side age / response indicator: overdue when no desk reply yet and the
 * first-response window for the priority has passed.
 */
export function supportTicketAge(t: SupportTicket, now = Date.now()): SupportAge {
  const created = new Date(t.createdAt).getTime()
  const age = Number.isFinite(created) ? Math.max(0, now - created) : 0
  const label = ageLabel(age)
  if (!isSupportTicketOpen(t.status)) return { label, tone: 'neutral', overdue: false }
  const answered = (t.replies ?? []).some(
    (r) => r.kind !== 'event' && !r.internal && r.authorUserId !== t.submittedByUserId,
  )
  const windowMs = SUPPORT_FIRST_RESPONSE_HOURS[t.priority ?? 'normal'] * 3_600_000
  if (!answered && age > windowMs) return { label, tone: 'danger', overdue: true }
  if (!answered && age > windowMs / 2) return { label, tone: 'warning', overdue: false }
  return { label, tone: 'neutral', overdue: false }
}

/** Reporter view: internal desk notes removed. */
export function redactSupportTicketForReporter<T extends { replies?: SupportReply[] }>(t: T): T {
  if (!t.replies?.some((r) => r.internal)) return t
  return { ...t, replies: t.replies.filter((r) => !r.internal) }
}

/** Every ticket the viewer may read: their own submissions plus their desk. */
export function filterSupportTicketsForViewer<
  T extends {
    agencyId: string | null
    submittedByUserId: string
    submitterRole?: string | null
    replies?: SupportReply[]
  },
>(tickets: T[], viewer: SupportViewer): T[] {
  if (viewer.role === 'super_admin') return tickets
  return tickets
    .filter((t) => isViewerOwnTicket(viewer, t.submittedByUserId) || isOnSupportDesk(viewer, t))
    .map((t) => (isOnSupportDesk(viewer, t) ? t : redactSupportTicketForReporter(t)))
}

/** Words of 4+ letters, for the duplicate hint. */
function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4),
  )
}

/**
 * Open tickets that look like the one being written (shared words in the
 * subject). Used to hint "you may already have reported this".
 */
export function similarOpenTickets<T extends { subject: string; status: SupportTicketStatus }>(
  subject: string,
  tickets: T[],
  min = 2,
): T[] {
  const mine = words(subject)
  if (mine.size === 0) return []
  return tickets.filter((t) => {
    if (!isSupportTicketOpen(t.status)) return false
    let hits = 0
    for (const w of words(t.subject)) if (mine.has(w)) hits++
    return hits >= Math.min(min, mine.size)
  })
}

/** Build the client ticket from an event_log row (bootstrap + API responses). */
export function supportTicketFromRow(
  row: { id: string; payload: Record<string, unknown> | null; created_at: Date | string },
  ids: { id: string; agencyId: string | null; fallbackSubmitter: string },
): SupportTicket {
  const p = row.payload ?? {}
  const text = (v: unknown) => (typeof v === 'string' ? v : '')
  const created = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  const replies = Array.isArray(p.replies)
    ? (p.replies as unknown[])
        .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
        .map((r) => ({
          id: text(r.id),
          authorUserId: text(r.authorUserId),
          authorName: text(r.authorName),
          authorRole: text(r.authorRole),
          body: text(r.body),
          at: text(r.at),
          ...(r.internal === true ? { internal: true } : {}),
          ...(r.kind === 'event' ? { kind: 'event' as const } : {}),
        }))
    : []
  return {
    id: ids.id,
    agencyId: ids.agencyId,
    submittedByUserId: text(p.submittedByUserId) || ids.fallbackSubmitter,
    submitterName: text(p.submitterName),
    submitterRole: text(p.submitterRole),
    subject: text(p.subject),
    body: text(p.body),
    status: normalizeSupportStatus(p.status),
    createdAt: created,
    category: normalizeSupportCategory(p.category),
    priority: normalizeSupportPriority(p.priority),
    pageUrl: text(p.pageUrl) || null,
    userAgent: text(p.userAgent) || null,
    attachments: Array.isArray(p.attachments) ? (p.attachments as unknown[]).filter((a): a is string => typeof a === 'string') : [],
    assigneeUserId: text(p.assigneeUserId) || null,
    assigneeName: text(p.assigneeName) || null,
    replies,
    rating: typeof p.rating === 'number' ? p.rating : null,
    ratingComment: text(p.ratingComment) || null,
    updatedAt: text(p.updatedAt) || null,
    reporterAgencyId: text(p.reporterAgencyId) || null,
    resolvedByUserId: text(p.resolvedByUserId) || null,
    resolvedByName: text(p.resolvedByName) || null,
    resolvedAt: text(p.resolvedAt) || null,
    resolutionNote: text(p.resolutionNote) || null,
  }
}
