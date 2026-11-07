/**
 * Platform staff come in two tiers, both with the super_admin role:
 *
 * - Super admin: everything.
 * - Administrator (users.metadata.platform_tier = 'administrator'): sees and
 *   runs everything on the platform except Subscription & billing, Emails,
 *   All users, Deleted users, Billing, Storage and Reports; may create other
 *   Administrators but never a super admin, and never acts on a super admin
 *   (no editing, password resets, impersonation or deleting one).
 *
 * The role stays super_admin so that every "platform staff sees all" rule
 * keeps working; the tier only takes things away.
 */
export type PlatformTier = 'administrator'

export const ADMINISTRATOR_TIER: PlatformTier = 'administrator'

/** The tier stored on a user row (DB role SUPER_ADMIN or front-end super_admin). */
export function platformTierFrom(
  role: string | null | undefined,
  meta: Record<string, unknown> | null | undefined,
): PlatformTier | null {
  const r = String(role ?? '')
  const isSuper = r === 'super_admin' || r.toUpperCase() === 'SUPER_ADMIN'
  return isSuper && meta?.platform_tier === ADMINISTRATOR_TIER ? ADMINISTRATOR_TIER : null
}

/** An Administrator: platform staff below a super admin. */
export function isAdministrator(u: { role?: string | null; platformTier?: string | null } | null | undefined): boolean {
  return Boolean(u && u.role === 'super_admin' && u.platformTier === ADMINISTRATOR_TIER)
}

/** A full super admin (not an Administrator). */
export function isFullSuperAdmin(u: { role?: string | null; platformTier?: string | null } | null | undefined): boolean {
  return Boolean(u && u.role === 'super_admin' && u.platformTier !== ADMINISTRATOR_TIER)
}

/** Pages an Administrator never sees (and the routes behind them refuse). */
export const ADMINISTRATOR_HIDDEN_PATHS = [
  '/workspace/admin/subscription',
  '/workspace/admin/emails',
  '/workspace/admin/all-users',
  '/workspace/admin/deleted-users',
  '/workspace/platform/billing',
  '/workspace/admin/storage',
  '/workspace/insights/reports',
] as const

export function isAdministratorHiddenPath(pathname: string): boolean {
  return ADMINISTRATOR_HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** 'Administrator' for an Administrator; null otherwise (use the usual role label). */
export function platformRoleLabel(u: { role?: string | null; platformTier?: string | null }): string | null {
  return isAdministrator(u) ? 'Administrator' : null
}
