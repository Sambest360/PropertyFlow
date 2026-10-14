/**
 * P0 empty-DB Super Admin session (Jim Mode A).
 *
 * fetchBootstrapFromApi used to require boot.units.length; on a fresh empty
 * project (0 units / 0 agencies) that looked like "stale auth", wiped
 * propertyflow-auth-user, and RequireAuth kicked SA to
 * /login?next=/workspace/admin/agencies while the JWT was still live.
 *
 * Empty bootstrap is valid empty-start when a live SA/staff session exists.
 * Never wipe auth solely because units/agencies are empty.
 *
 * Mode A Sipho (P0.6): END_USER/tenant remint must NOT treat live session +
 * applications:[] as success — that locked "Applications 0" under Hi Sipho
 * while APP/TN links HOLD. SA empty-units path remains.
 *
 * remint56 race: mount/deferred boots can pass actorRole=null while
 * propertyflow-auth-user is still Sipho. Null role must NOT bypass tenant
 * empty-accept fail-closed / soft-miss (treat live session + empty apps as
 * tenant-like until role resolves).
 */

export type EmptyBootstrapAuthInput = {
  /** Bootstrap payload from Supabase (may be empty arrays). */
  boot:
    | {
        units?: unknown[] | null
        applications?: unknown[] | null
        users?: unknown[] | null
      }
    | null
    | undefined
  /** Actor from AuthContext refresh (preferred live-session proof). */
  actorUserId?: string | null
  /** propertyflow-auth-user localStorage id (also live-session proof). */
  storedAuthUserId?: string | null
  /**
   * FE role (`tenant`) or DB role (`END_USER` / `applicant`).
   * Tenant remint fail-closed when applications are empty.
   * Null/missing under a live session is treated as tenant-like for
   * empty-apps accept/soft-miss (null-actor bootstrap race).
   */
  actorRole?: string | null
}

export type EmptyBootstrapHydrateOpts = {
  /** Applicant rows already in memory for this session user (Sipho remint guard). */
  priorTenantApplicationCount?: number
}

function hasLiveSession(input: EmptyBootstrapAuthInput): boolean {
  return Boolean(input.actorUserId?.trim() || input.storedAuthUserId?.trim())
}

/** True for portal tenant / END_USER / applicant actors. */
export function isTenantBootstrapActor(role?: string | null): boolean {
  const r = (role ?? '').trim().toLowerCase()
  return r === 'tenant' || r === 'end_user' || r === 'applicant'
}

function tenantApplicationsEmpty(boot: NonNullable<EmptyBootstrapAuthInput['boot']>): boolean {
  const apps = boot.applications
  return !Array.isArray(apps) || apps.length === 0
}

/** Staff / admin bootstrap carries a user roster; tenants do not rely on this for remint. */
function hasStaffBootstrapUsers(boot: NonNullable<EmptyBootstrapAuthInput['boot']>): boolean {
  return Array.isArray(boot.users) && boot.users.length > 0
}

/**
 * Tenant empty-apps gate, including null-actor race: live session + missing
 * role + empty applications is treated like tenant fail-closed (do not accept
 * / soft-miss). Explicit SA/staff roles keep the empty-units empty-start path.
 */
export function isTenantLikeEmptyApps(input: EmptyBootstrapAuthInput): boolean {
  if (!input.boot || !tenantApplicationsEmpty(input.boot)) return false
  if (isTenantBootstrapActor(input.actorRole)) return true
  const role = (input.actorRole ?? '').trim()
  // Null/missing role under live AUTH_KEY / actor id ⇒ tenant-like fail-closed,
  // unless bootstrap already returned a staff user roster (FW-17 mount race).
  if (!role && hasLiveSession(input) && hasStaffBootstrapUsers(input.boot)) return false
  return !role && hasLiveSession(input)
}

/** True when bootstrap should be applied (including genuine SA empty-start). */
export function shouldAcceptSupabaseBootstrap(input: EmptyBootstrapAuthInput): boolean {
  if (!input.boot) return false

  const tenantEmptyApps = isTenantLikeEmptyApps(input)

  // Units present = legacy P0-2 happy path, except tenant remint must not lock
  // applications:[] under a live session (Sipho durable empty / null-actor race).
  if (Array.isArray(input.boot.units) && input.boot.units.length > 0) {
    if (tenantEmptyApps && hasLiveSession(input)) return false
    return true
  }

  // 0 units / 0 agencies with a live SA (or staff) session = empty-start, not stale.
  if (!hasLiveSession(input)) return false
  // END_USER/tenant / null-actor live session: empty applications ≠ remint OK.
  if (tenantEmptyApps) return false
  return true
}

/**
 * Soft hydrate-miss: live session + empty applications under tenant or
 * unresolved (null) actor — do NOT apply / lock applications:[].
 * refreshBootstrap keeps prior non-empty hydrate.
 *
 * FW-28: resolved tenant with zero local applicant rows must still hydrate
 * (applicant home / portal skeleton must not hang).
 */
export function shouldSoftMissEmptyApplicationsBootstrap(
  input: EmptyBootstrapAuthInput,
  opts?: EmptyBootstrapHydrateOpts,
): boolean {
  if (!input.boot) return false
  if (!hasLiveSession(input)) return false
  if (!tenantApplicationsEmpty(input.boot)) return false

  const role = (input.actorRole ?? '').trim()

  // Unresolved mount actor — wait for role + remint (remint56).
  if (!role) {
    if (hasStaffBootstrapUsers(input.boot)) return false
    return hasLiveSession(input)
  }

  // Resolved tenant/applicant: only soft-miss when we'd wipe known local apps (Sipho).
  if (isTenantBootstrapActor(role)) {
    return (opts?.priorTenantApplicationCount ?? 0) > 0
  }

  return false
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
