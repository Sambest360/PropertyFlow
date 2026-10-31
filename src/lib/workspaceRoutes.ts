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

/**
 * A ?next= deep link (from an email button or the sign-in bounce) that stays
 * on this site: a path starting with one "/", never "//host", "/\\host" or a
 * full URL, and never back to the sign-in pages themselves.
 */
export function safeNextPath(requestedNext?: string | null): string | null {
  const next = requestedNext?.trim()
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null
  if (next.includes('\\') || [...next].some((ch) => ch.charCodeAt(0) < 0x20)) return null
  if (/^\/(login|register)(?:[/?#]|$)/.test(next)) return null
  return next
}

/** Honour an explicit deep-link unless it is the generic workspace home. */
export function resolvePostLoginPath(role: Role, requestedNext?: string | null): string {
  const next = safeNextPath(requestedNext)
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

