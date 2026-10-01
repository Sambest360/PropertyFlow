/**
 * P0 empty-DB Super Admin session (Jim Mode A).
 *
 * fetchBootstrapFromApi used to require boot.units.length; on a fresh empty
 * project (0 units / 0 agencies) that looked like "stale auth", wiped
 * propertyflow-auth-user, and RequireAuth kicked SA to
 * /login?next=/workspace/admin/agencies while the JWT was still live.
 *
 * Empty bootstrap is valid empty-start when a live session exists.
 * Never wipe auth solely because units/agencies are empty.
 */

export type EmptyBootstrapAuthInput = {
  /** Bootstrap payload from Supabase (may be empty arrays). */
  boot: { units?: unknown[] | null } | null | undefined
  /** Actor from AuthContext refresh (preferred live-session proof). */
  actorUserId?: string | null
  /** propertyflow-auth-user localStorage id (also live-session proof). */
  storedAuthUserId?: string | null
}

function hasLiveSession(input: EmptyBootstrapAuthInput): boolean {
  return Boolean(input.actorUserId?.trim() || input.storedAuthUserId?.trim())
}

/** True when bootstrap should be applied (including genuine empty-start). */
export function shouldAcceptSupabaseBootstrap(input: EmptyBootstrapAuthInput): boolean {
  if (!input.boot) return false
  if (Array.isArray(input.boot.units) && input.boot.units.length > 0) return true
  // 0 units / 0 agencies with a live SA (or any) session = empty-start, not stale.
  return hasLiveSession(input)
}

/**
 * True only when we should wipe propertyflow-auth-user and degrade to guest
 * marketplace. Live session ⇒ never wipe (empty-bootstrap ≠ stale-auth).
 */
export function shouldWipeAuthAfterBootstrapMiss(input: EmptyBootstrapAuthInput): boolean {
  if (hasLiveSession(input)) return false
  if (input.boot && Array.isArray(input.boot.units) && input.boot.units.length > 0) return false
  return true
}
