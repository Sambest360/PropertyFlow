/**
 * Who gets which notification by email — the one place that decides it.
 *
 * Every in-app notification stays in the app (bell, dashboard). This rule
 * only decides whether it is ALSO emailed straight away:
 *
 * - Agents, field agents, landlords, tenants, applicants, contractors and the
 *   platform team: every notification is emailed (their own settings still
 *   apply, see notificationCategories.ts).
 * - Agency administrators (principal / agency admin): only what needs their
 *   attention — escalations and alerts, overdue or failed items, things that
 *   wait on their approval or decision, work assigned to them (or on a
 *   property where they are the agent), billing, storage, conduct, support,
 *   compliance and account / security events. Everything else goes into one
 *   daily summary email instead (server/email/adminDigest.ts).
 */

export type EmailRoute = 'email' | 'digest'

export type RoutingInput = {
  /** users.role, e.g. AGENCY_ADMIN. */
  role: string | null | undefined
  /** users.metadata.frontend_role, e.g. client_admin. */
  frontendRole?: string | null
  /** notifications.resource_type, e.g. applicant, escalation. */
  resource?: string | null
  /** notifications.action_type, e.g. created, alert. */
  action?: string | null
  title?: string | null
  /** The recipient is the assigned agent / contractor on this piece of work. */
  assignedToRecipient?: boolean
}

export type RoutingDecision = { route: EmailRoute; reason: string }

const ADMIN_DB_ROLES = new Set(['AGENCY_ADMIN', 'AGENT_ADMIN'])
const ADMIN_FE_ROLES = new Set(['client_admin', 'agency_admin', 'agent_admin'])
/** Staff roles that are never treated as agency admins, whatever stale metadata says. */
const NON_ADMIN_DB_ROLES = new Set(['SUPER_ADMIN', 'GROUND_AGENT', 'LANDLORD', 'END_USER', 'CONTRACTOR'])

/** Resources an agency admin is always emailed about. */
export const ADMIN_EMAIL_RESOURCES = [
  'escalation',
  'billing',
  'invoice',
  'storage',
  'complaint',
  'warning',
  'conduct',
  'support',
  'verification',
  'compliance',
  'user',
  'security',
  'payout',
  'trust',
  'arrears',
] as const

/** Actions that always mean "look at this now". */
export const ADMIN_EMAIL_ACTIONS = ['alert', 'escalated', 'reopened', 'rent_escalation', 'failed', 'overdue'] as const

/** Titles that ask the admin for a decision or flag a problem. */
export const ADMIN_EMAIL_TITLE_RE =
  /\b(approval|approve|needs? your|awaiting your|waiting for your|assigned to you|action required|overdue|failed|urgent|emergency|escalat\w*|declined|suspended|limit reached)\b/i

export function isAgencyAdmin(role: string | null | undefined, frontendRole?: string | null): boolean {
  const db = String(role ?? '').toUpperCase()
  if (ADMIN_DB_ROLES.has(db)) return true
  if (NON_ADMIN_DB_ROLES.has(db)) return false
  return ADMIN_FE_ROLES.has(String(frontendRole ?? '').toLowerCase())
}

function startsWithAny(value: string, list: readonly string[]): boolean {
  return list.some((x) => value === x || value.startsWith(x))
}

/** Email now, or hold for the agency admin's daily summary. */
export function routeNotificationEmail(input: RoutingInput): RoutingDecision {
  if (!isAgencyAdmin(input.role, input.frontendRole)) return { route: 'email', reason: 'not an agency admin' }
  const resource = String(input.resource ?? '').toLowerCase()
  const action = String(input.action ?? '').toLowerCase()
  if (input.assignedToRecipient) return { route: 'email', reason: 'assigned to them' }
  if (resource && startsWithAny(resource, ADMIN_EMAIL_RESOURCES)) return { route: 'email', reason: `important: ${resource}` }
  if (action && (ADMIN_EMAIL_ACTIONS as readonly string[]).includes(action)) return { route: 'email', reason: `important: ${action}` }
  if (input.title && ADMIN_EMAIL_TITLE_RE.test(input.title)) return { route: 'email', reason: 'needs their attention' }
  return { route: 'digest', reason: 'routine update for an agency admin' }
}
