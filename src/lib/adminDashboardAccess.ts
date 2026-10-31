/**
 * Admin dashboard access rules, shared by the server (server/adminDashboard.ts,
 * which leaves out the sections a viewer may not see) and the page
 * (src/pages/admin/AdminDashboardPage.tsx, which renders what came back and
 * lists these same rules on the Access tab). One definition, so the page can
 * never claim access the server does not give.
 */
import type { Permission, Role } from '../types/domain.js'
import { effectiveCan, rolePermissions } from './permissions.js'

/** Roles that may open the admin dashboard. Everyone else gets 403. */
export const ADMIN_DASHBOARD_ROLES: readonly Role[] = ['super_admin', 'client_admin', 'agent_admin']

export function canOpenAdminDashboard(role: Role | string | null | undefined): boolean {
  return !!role && (ADMIN_DASHBOARD_ROLES as readonly string[]).includes(role)
}

export type DashboardSectionId =
  | 'people'
  | 'portfolio'
  | 'listings'
  | 'leads'
  | 'viewings'
  | 'applications'
  | 'leases'
  | 'payments'
  | 'maintenance'
  | 'agencies'
  | 'activity'
  | 'health'
  | 'access'

export type DashboardSection = {
  id: DashboardSectionId
  label: string
  /** Shown when the viewer effectively holds any of these. */
  anyOf: readonly Permission[]
}

export const DASHBOARD_SECTIONS: readonly DashboardSection[] = [
  { id: 'people', label: 'Users by role', anyOf: ['users.manage', 'platform.manage'] },
  { id: 'portfolio', label: 'Buildings, units and occupancy', anyOf: ['assets.view', 'listings.publish'] },
  { id: 'listings', label: 'Published listings', anyOf: ['listings.publish', 'assets.view'] },
  { id: 'leads', label: 'Leads and enquiries', anyOf: ['leads.view', 'leads.manage'] },
  { id: 'viewings', label: 'Viewings', anyOf: ['viewings.manage'] },
  { id: 'applications', label: 'Applications', anyOf: ['applications.view', 'applications.review'] },
  { id: 'leases', label: 'Leases and expiries', anyOf: ['occupants.view'] },
  { id: 'payments', label: 'Payments recorded', anyOf: ['payments.view', 'payments.manage'] },
  { id: 'maintenance', label: 'Maintenance tickets', anyOf: ['maintenance.view', 'maintenance.manage'] },
  { id: 'agencies', label: 'Agencies table', anyOf: ['platform.manage'] },
  { id: 'activity', label: 'Activity feed', anyOf: ['reports.view', 'platform.manage'] },
  { id: 'health', label: 'System health', anyOf: ['platform.manage'] },
  { id: 'access', label: 'Access and visibility', anyOf: ['users.manage', 'platform.manage'] },
]

/** Every permission the user effectively holds: role (or saved list) ∩ agency modules. */
export function effectivePermissionSet(
  role: Role,
  agencyEnabled: Permission[] | null | undefined,
  userEnabled: Permission[] | null | undefined,
): Set<Permission> {
  const out = new Set<Permission>()
  for (const p of rolePermissions.super_admin) {
    if (effectiveCan(role, p, agencyEnabled, userEnabled)) out.add(p)
  }
  return out
}

/** Section ids this viewer may see, in display order (none for roles that cannot open the dashboard). */
export function visibleDashboardSections(role: Role, has: (p: Permission) => boolean): DashboardSectionId[] {
  if (!canOpenAdminDashboard(role)) return []
  return DASHBOARD_SECTIONS.filter((s) => s.anyOf.some((p) => has(p))).map((s) => s.id)
}
