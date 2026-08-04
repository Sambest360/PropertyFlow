import type { AppUser, Permission, Role } from '../types/domain.js'
import { effectiveCan } from './permissions.js'
import { canImpersonateTarget } from './agencyScope.js'

export function actorHasImpersonatePermission(
  actor: Pick<AppUser, 'role' | 'enabledPermissions'>,
  agencyEnabledPermissions?: Permission[],
): boolean {
  return effectiveCan(actor.role, 'users.impersonate', agencyEnabledPermissions, actor.enabledPermissions)
}

export function canImpersonateUser(
  actor: Pick<AppUser, 'id' | 'role' | 'agencyId' | 'enabledPermissions'>,
  target: Pick<AppUser, 'id' | 'role' | 'agencyId' | 'active'>,
  agencyEnabledPermissions?: Permission[],
): boolean {
  if (!actorHasImpersonatePermission(actor, agencyEnabledPermissions)) return false
  if (actor.id === target.id) return false
  return canImpersonateTarget(actor, target)
}

/** Where to land after switching into another user's session. */
export function postImpersonatePath(role: Role): string {
  switch (role) {
    case 'tenant':
      return '/workspace/portals/tenant'
    case 'landlord':
      return '/workspace/portals/owner'
    case 'contractor':
      return '/workspace/portals/contractor'
    case 'super_admin':
      return '/workspace/admin/agencies'
    default:
      return '/workspace'
  }
}
