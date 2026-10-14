import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Permission, Role } from '../types/domain'

export function resolveWorkspaceApplicationsPath(
  has: (p: Permission) => boolean,
  role?: Role | null,
): string {
  // Landlord portfolio packs include applications.view — owner portal is the right surface.
  if (has('portal.owner')) return '/workspace/portals/owner'
  if (has('applications.view')) return '/workspace/sales/applications'
  if (has('portal.tenant')) return '/workspace/portals/tenant/applications'
  if (role === 'landlord') return '/workspace/portals/owner'
  return '/workspace'
}

export function resolveWorkspaceLeasesPath(
  has: (p: Permission) => boolean,
  role?: Role | null,
): string {
  if (has('portal.owner')) return '/workspace/portals/owner'
  if (has('occupants.view')) return '/workspace/people/leases'
  if (has('portal.tenant')) return '/workspace/portals/tenant/leases'
  if (role === 'landlord') return '/workspace/portals/owner'
  return '/workspace'
}

export function resolveWorkspacePaymentsPath(
  has: (p: Permission) => boolean,
  role?: Role | null,
): string {
  if (has('portal.owner')) return '/workspace/portals/owner'
  if (has('payments.view')) return '/workspace/operations/payments'
  if (has('portal.tenant')) return '/workspace/portals/tenant/payments'
  if (role === 'landlord') return '/workspace/portals/owner'
  return '/workspace'
}

/** Role-aware /workspace/applications — avoid sending landlords to sales (no applications.view). */
export function WorkspaceApplicationsRedirect() {
  const { has, role, authReady } = useAuth()
  if (!authReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-ink-500">
        Loading…
      </div>
    )
  }
  return <Navigate to={resolveWorkspaceApplicationsPath(has, role)} replace />
}

/** Role-aware /workspace/leases — keep signed-in users in workspace (E2E L08 / T02). */
export function WorkspaceLeasesRedirect() {
  const { has, role, authReady } = useAuth()
  if (!authReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-ink-500">
        Loading…
      </div>
    )
  }
  return <Navigate to={resolveWorkspaceLeasesPath(has, role)} replace />
}

/** Role-aware /workspace/payments — tenants pay rent in the tenant portal (FW-29 T02). */
export function WorkspacePaymentsRedirect() {
  const { has, role, authReady } = useAuth()
  if (!authReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-ink-500">
        Loading…
      </div>
    )
  }
  return <Navigate to={resolveWorkspacePaymentsPath(has, role)} replace />
}

/** Unknown paths under /workspace must not fall through to the public marketplace shell. */
export function WorkspaceAwareNotFound() {
  const { pathname } = useLocation()
  if (pathname === '/workspace' || pathname.startsWith('/workspace/')) {
    return <Navigate to="/workspace" replace />
  }
  return <Navigate to="/" replace />
}
