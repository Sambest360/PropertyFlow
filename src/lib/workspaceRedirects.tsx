import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function resolveWorkspaceApplicationsPath(has: (p: import('../types/domain').Permission) => boolean): string {
  if (has('applications.view')) return '/workspace/sales/applications'
  if (has('portal.owner')) return '/workspace/portals/owner'
  if (has('portal.tenant')) return '/workspace/portals/tenant/applications'
  return '/workspace'
}

export function resolveWorkspaceLeasesPath(has: (p: import('../types/domain').Permission) => boolean): string {
  if (has('occupants.view')) return '/workspace/people/leases'
  if (has('portal.tenant')) return '/workspace/portals/tenant/leases'
  if (has('portal.owner')) return '/workspace/portals/owner'
  return '/workspace'
}

/** Role-aware /workspace/applications — avoid sending landlords to sales (no applications.view). */
export function WorkspaceApplicationsRedirect() {
  const { has } = useAuth()
  return <Navigate to={resolveWorkspaceApplicationsPath(has)} replace />
}

/** Role-aware /workspace/leases — keep signed-in users in workspace (E2E L08 / T02). */
export function WorkspaceLeasesRedirect() {
  const { has } = useAuth()
  return <Navigate to={resolveWorkspaceLeasesPath(has)} replace />
}
