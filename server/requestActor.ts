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
import { actorFromSession, resolveSessionUser } from './auth.js'

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
      if (impersonated) return impersonated
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
