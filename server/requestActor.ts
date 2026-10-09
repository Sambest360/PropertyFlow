/**
 * Request identity for every actor-gated API route.
 *
 * Order:
 * 1. Verified session (pf_session cookie or Bearer token, HMAC-checked in
 *    resolveSessionUser, user row must exist and be active).
 *    - A super_admin session may impersonate with X-User-Id / X-Role /
 *      X-Agency-Id headers (headers only, not body fields).
 *    - Any other session ignores actor headers and body actor fields.
 * 2. No session: demo actor headers / body fields, only when
 *    demoActorHeadersAllowed() (VERCEL unset or ALLOW_DEMO_ACTOR=1).
 * 3. Otherwise null — callers answer 401.
 */
import type { Context } from 'hono'
import { demoActorHeadersAllowed, parseDemoActor, type DemoActor } from './actor.js'
import { actorFromSession, resolveSessionUser, type SessionUser } from './auth.js'
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'

/** GET polls (bootstrap / live sync) log once per minute per instance; writes always log. */
const IMPERSONATION_READ_DEDUPE_MS = 60_000
const recentImpersonationReads = new Map<string, number>()

/** Test hook: forget read de-duplication. */
export function resetImpersonationLogDedupe(): void {
  recentImpersonationReads.clear()
}

/**
 * Audit row for a super admin acting as another user:
 * event_log(event_type 'impersonation', subject = impersonated user,
 * actor_user_id = the super admin's users.id, payload with both FE ids,
 * role and the route). A logging failure is reported but never blocks
 * the request.
 */
async function logImpersonation(c: Context, session: SessionUser, target: DemoActor): Promise<void> {
  const method = c.req.method.toUpperCase()
  const path = new URL(c.req.url).pathname
  const route = `${method} ${path}`
  if (method === 'GET') {
    const key = `${session.id}|${target.userId}|${route}`
    const now = Date.now()
    const last = recentImpersonationReads.get(key)
    if (last && now - last < IMPERSONATION_READ_DEDUPE_MS) return
    recentImpersonationReads.set(key, now)
  }
  try {
    const targetUuid = await resolveUuid('user', target.userId).catch(() => null)
    const clientUuid = target.agencyId
      ? await resolveUuid('agency', target.agencyId).catch(() => null)
      : null
    await query(
      `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
       VALUES (gen_random_uuid(), $1::uuid, 'impersonation', 'user', $2::uuid, $3::uuid, $4::jsonb, NOW())`,
      [
        clientUuid,
        targetUuid,
        session.id,
        JSON.stringify({
          impersonatorUserId: session.frontendId,
          impersonatorEmail: session.email,
          impersonatedUserId: target.userId,
          impersonatedRole: target.role,
          impersonatedAgencyId: target.agencyId,
          route,
        }),
      ],
    )
  } catch (err) {
    console.error('[impersonation] audit log failed:', err instanceof Error ? err.message : err)
  }
}

export async function resolveRequestActor(
  c: Context,
  body?: Record<string, unknown> | null,
): Promise<DemoActor | null> {
  const demoAllowed = demoActorHeadersAllowed()
  let session: Awaited<ReturnType<typeof resolveSessionUser>> = null
  try {
    session = await resolveSessionUser(c)
  } catch (err) {
    // e.g. AUTH_SECRET unset in local dev while a stale token is sent.
    if (!demoAllowed) throw err
    session = null
  }
  if (session) {
    if (session.role === 'super_admin') {
      const impersonated = parseDemoActor(c, null)
      if (impersonated) {
        if (impersonated.userId !== session.frontendId) {
          await logImpersonation(c, session, impersonated)
        }
        return impersonated
      }
    }
    return actorFromSession(session)
  }
  if (!demoAllowed) return null
  return parseDemoActor(c, body)
}

/**
 * Staff roles (src/types/domain Role + src/lib/permissions isAgencyStaff):
 * 'agent' is the legacy alias of ground_agent (both map to GROUND_AGENT in
 * auth ROLE_TO_DB), so it counts as staff. Tenants, landlords, contractors
 * (and applicants, who resolve to tenant) are not staff.
 */
export const STAFF_ROLES: ReadonlySet<string> = new Set([
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
])

export function isStaffRole(role: string | null | undefined): boolean {
  return Boolean(role) && STAFF_ROLES.has(String(role))
}
