import type { Role } from '../types/domain'

const WORKSPACE_HOME = '/workspace'

/** Default workspace landing path per role (after login or when `/workspace` is generic). */
export function defaultWorkspacePath(role: Role): string {
  switch (role) {
    case 'super_admin':
      return '/workspace/admin/agencies'
    case 'tenant':
      return '/workspace/portals/tenant'
    case 'landlord':
      return '/workspace/portals/owner'
    case 'contractor':
      return '/workspace/portals/contractor'
    default:
      return WORKSPACE_HOME
  }
}

/** Honour an explicit deep-link unless it is the generic workspace home. */
export function resolvePostLoginPath(role: Role, requestedNext?: string | null): string {
  const next = requestedNext?.trim()
  if (next && next !== WORKSPACE_HOME && next !== `${WORKSPACE_HOME}/`) {
    return next
  }
  return defaultWorkspacePath(role)
}

/** Post-register landing (public signup). Prefer portal homes over legacy /workspace/tenant. */
export function postRegisterPath(role: string, bootstrap: boolean, next: string): string {
  if (bootstrap) return '/workspace/admin/agencies/new'
  if (role === 'landlord') return '/workspace/portals/owner'
  if (role === 'contractor') return '/workspace/portals/contractor'
  if (role === 'tenant') {
    if (next.startsWith('/listing/') || next.startsWith('/browse')) return next
    return '/workspace/portals/tenant'
  }
  return next
}

