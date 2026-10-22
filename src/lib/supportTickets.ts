/**
 * CR7 help desk — shared rules for support tickets (client + server).
 *
 * Tickets live in event_log with event_type = 'support_ticket' (no migration).
 * Routing (Jim, CR7):
 *  - tenant / landlord / contractor / applicant with an agency → that agency's desk
 *  - agency staff (principal, agency admin, agents) and anyone with no agency →
 *    platform (agencyId null), which only super admin sees and resolves.
 * Desk = super_admin, client_admin, agent_admin holding users.manage.
 * One resolve with a note; a resolved ticket is read-only (no reopen).
 */
import { can, isAgencyStaff } from './permissions.js'
import type { Role } from '../types/domain.js'

export type SupportTicketStatus = 'open' | 'resolved'

export type SupportTicket = {
  id: string
  /** Routed agency (FE id). null = platform / Lekaya support. */
  agencyId: string | null
  submittedByUserId: string
  submitterName: string
  submitterRole: string
  subject: string
  body: string
  status: SupportTicketStatus
  createdAt: string
  resolvedByUserId?: string | null
  resolvedByName?: string | null
  resolvedAt?: string | null
  resolutionNote?: string | null
}

/** Payload keys a resolve may change. Everything else is fixed at submit. */
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

function isViewerOwnTicket(viewer: SupportViewer, submittedByUserId: string): boolean {
  if (!submittedByUserId) return false
  return viewer.aliasIds ? viewer.aliasIds.has(submittedByUserId) : submittedByUserId === viewer.userId
}

function usersManage(viewer: SupportViewer): boolean {
  return viewer.hasUsersManage ?? can(viewer.role, 'users.manage')
}

/**
 * Desk roles: super admin, or an agency admin (client_admin / agent_admin)
 * holding users.manage. ground_agent and agent never hold the desk.
 */
export function isSupportDeskViewer(viewer: SupportViewer): boolean {
  if (viewer.role === 'super_admin') return true
  return (viewer.role === 'client_admin' || viewer.role === 'agent_admin') && usersManage(viewer)
}

/**
 * Server-derived routing. Agency staff and users without an agency go to the
 * platform desk (null); everyone else goes to their own agency.
 */
export function supportTicketRoutingAgency(role: Role, agencyId: string | null): string | null {
  if (role === 'super_admin' || isAgencyStaff(role)) return null
  return agencyId || null
}

/** Whether the viewer may resolve this ticket (status aside). */
export function canResolveSupportTicket(
  viewer: SupportViewer,
  ticket: { agencyId: string | null; submitterRole?: string | null },
): boolean {
  if (!isSupportDeskViewer(viewer)) return false
  if (viewer.role === 'super_admin') return true
  // Agency desk: own agency only. Platform (null) tickets are super admin only.
  if (!ticket.agencyId || !viewer.agencyId) return false
  // Staff tickets always belong to Lekaya support, even if a stored row
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

/** Every ticket the viewer may read: their own submissions plus their desk. */
export function filterSupportTicketsForViewer<
  T extends { agencyId: string | null; submittedByUserId: string; submitterRole?: string | null },
>(tickets: T[], viewer: SupportViewer): T[] {
  if (viewer.role === 'super_admin') return tickets
  return tickets.filter(
    (t) => isViewerOwnTicket(viewer, t.submittedByUserId) || isOnSupportDesk(viewer, t),
  )
}
