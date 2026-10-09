/**
 * Demo actor parsing for API requests (headers or body fields).
 */
import type { Context } from 'hono'
import type { Role } from '../src/types/domain.js'

export const ACTOR_USER_HEADER = 'X-User-Id'
export const ACTOR_ROLE_HEADER = 'X-Role'
export const ACTOR_AGENCY_HEADER = 'X-Agency-Id'

const ROLES: ReadonlySet<string> = new Set([
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
  'landlord',
  'tenant',
  'contractor',
])

export type DemoActor = {
  userId: string
  role: Role
  agencyId: string | null
}

function asRole(v: unknown): Role | null {
  if (typeof v !== 'string' || !ROLES.has(v)) return null
  return v as Role
}

function header(c: Context, name: string): string | null {
  const v = c.req.header(name) ?? c.req.header(name.toLowerCase())
  return v?.trim() || null
}

/**
 * Pure actor resolution from already-extracted header/body values.
 */
export function resolveDemoActor(parts: {
  userId?: string | null
  role?: unknown
  agencyId?: string | null
}): DemoActor | null {
  const userId = parts.userId?.trim() || null
  const role = asRole(parts.role)
  if (!userId || !role) return null
  const agencyRaw = parts.agencyId?.trim() || null
  return {
    userId,
    role,
    agencyId: agencyRaw && agencyRaw !== 'null' ? agencyRaw : null,
  }
}

/**
 * Resolve demo actor from headers, then optional body fields.
 * Returns null when identity is incomplete (caller decides 401 vs allow).
 */
export function parseDemoActor(
  c: Context,
  body?: Record<string, unknown> | null,
): DemoActor | null {
  const userId =
    header(c, ACTOR_USER_HEADER) ||
    (typeof body?.actorUserId === 'string' ? body.actorUserId : null) ||
    (typeof body?.userId === 'string' && body?.actorRole ? String(body.userId) : null)

  const role =
    asRole(header(c, ACTOR_ROLE_HEADER)) ||
    asRole(body?.actorRole) ||
    asRole(body?.role)

  const agencyRaw =
    header(c, ACTOR_AGENCY_HEADER) ||
    (typeof body?.actorAgencyId === 'string' ? body.actorAgencyId : null) ||
    (typeof body?.agencyId === 'string' && body?.actorRole ? String(body.agencyId) : null)

  return resolveDemoActor({ userId, role, agencyId: agencyRaw })
}

export function actorRequiredError(): Error & { status: number } {
  return Object.assign(new Error('Actor identity required (X-User-Id + X-Role)'), {
    status: 401,
  })
}

export function forbiddenError(message = 'Outside property scope'): Error & { status: number } {
  return Object.assign(new Error(message), { status: 403 })
}

/**
 * Demo actor headers / body fields are trusted only outside production:
 * VERCEL, VERCEL_ENV and NODE_ENV=production all unset (local dev, tests), or
 * an explicit ALLOW_DEMO_ACTOR=1 opt-in. Otherwise (Vercel production/preview,
 * any production Node) identity comes from the verified session.
 */
export function demoActorHeadersAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ALLOW_DEMO_ACTOR?.trim() === '1') return true
  if (env.VERCEL?.trim()) return false
  if (env.VERCEL_ENV?.trim()) return false
  if (env.NODE_ENV?.trim() === 'production') return false
  return true
}
