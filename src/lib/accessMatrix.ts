/**
 * "Who can see what" for the admin dashboard's Access tab. Every row is worked
 * out with the functions that actually gate access, never a hand-kept list:
 * - capabilities: effectiveCan (src/lib/permissions.ts), as used by the
 *   sidebar, route guards and the server's permission gates;
 * - pages: buildWorkspaceNavForActor (the sidebar each role is given);
 * - dashboard sections: visibleDashboardSections (the server leaves the rest
 *   out of /api/admin/dashboard);
 * - data and writes: the server's COLLECTION_PERMISSIONS / WRITE_PERMISSION
 *   maps, sent by GET /api/admin/access.
 */
import type { Permission, Role } from '../types/domain'
import {
  AGENCY_CAPABILITY_GROUPS,
  effectiveCan,
  isRestrictedPermission,
  permissionLabels,
  roleLabels,
  rolePermissions,
} from './permissions'
import { DASHBOARD_SECTIONS, visibleDashboardSections } from './adminDashboardAccess'
import { buildWorkspaceNavForActor, flattenNavLinks } from '../components/layout/navigation'

export const MATRIX_ROLES: readonly Role[] = [
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
  'landlord',
  'tenant',
  'contractor',
]

/** Why a cell is what it is (per-person view). */
export type CellReason = 'role' | 'not-in-role' | 'restricted' | 'agency-off'

export type AccessSubject = {
  role: Role
  /** Saved per-user list (null = role defaults). */
  userEnabled?: Permission[] | null
  /** Agency enabled modules (null = all). */
  agencyEnabled?: Permission[] | null
}

export function subjectHas(subject: AccessSubject, p: Permission): boolean {
  return effectiveCan(subject.role, p, subject.agencyEnabled ?? null, subject.userEnabled ?? null)
}

/** Allowed, or the first reason it is not. */
export function permissionReason(subject: AccessSubject, p: Permission): CellReason {
  if (subjectHas(subject, p)) return 'role'
  const role = subject.role
  if (isRestrictedPermission(role, p, subject.userEnabled)) return 'restricted'
  const base = subject.userEnabled?.length ? subject.userEnabled : rolePermissions[role] ?? []
  if (base.includes(p) && subject.agencyEnabled && !subject.agencyEnabled.includes(p)) return 'agency-off'
  return 'not-in-role'
}

export type MatrixGroup = {
  id: string
  label: string
  rows: Array<{ id: string; label: string; hint?: string; permissions: readonly Permission[] }>
}

/** Capability rows: the grouped permission catalogue plus platform management. */
export function capabilityGroups(): MatrixGroup[] {
  return [
    {
      id: 'platform',
      label: 'Platform',
      rows: [{ id: 'platform.manage', label: permissionLabels['platform.manage'] ?? 'Platform manage', permissions: ['platform.manage'] }],
    },
    ...AGENCY_CAPABILITY_GROUPS.map((g) => ({
      id: g.id,
      label: g.label,
      rows: g.permissions.map((p) => ({ id: p, label: permissionLabels[p] ?? p, hint: p, permissions: [p] })),
    })),
  ]
}

/** Sidebar paths a subject is given. Tenants are shown after their lease is approved. */
export function navPathsFor(subject: AccessSubject): Map<string, string> {
  const has = (p: Permission) => subjectHas(subject, p)
  const nav = buildWorkspaceNavForActor({
    role: subject.role,
    has,
    hasAny: (ps) => ps.some(has),
    tenantOccupancyReady: true,
  })
  const out = new Map<string, string>()
  for (const item of flattenNavLinks(nav)) out.set(item.to.split('?')[0], item.label)
  return out
}

export type PageRow = { path: string; label: string; allowed: Record<string, boolean> }

/** One row per page any role can reach, with which roles get it in their sidebar. */
export function pageRows(subjects: Record<string, AccessSubject>): PageRow[] {
  const byKey = Object.fromEntries(Object.entries(subjects).map(([k, s]) => [k, navPathsFor(s)]))
  const rows = new Map<string, PageRow>()
  for (const [key, paths] of Object.entries(byKey)) {
    for (const [path, label] of paths) {
      const row = rows.get(path) ?? { path, label, allowed: {} }
      row.allowed[key] = true
      rows.set(path, row)
    }
  }
  for (const row of rows.values()) for (const key of Object.keys(subjects)) row.allowed[key] ??= false
  return [...rows.values()].sort((a, b) => a.path.localeCompare(b.path))
}

export type SectionRow = { id: string; label: string; anyOf: readonly Permission[]; allowed: Record<string, boolean> }

export function dashboardSectionRows(subjects: Record<string, AccessSubject>): SectionRow[] {
  const visible = Object.fromEntries(
    Object.entries(subjects).map(([k, s]) => [k, new Set(visibleDashboardSections(s.role, (p) => subjectHas(s, p)))]),
  )
  return DASHBOARD_SECTIONS.map((sec) => ({
    id: sec.id,
    label: sec.label,
    anyOf: sec.anyOf,
    allowed: Object.fromEntries(Object.keys(subjects).map((k) => [k, visible[k].has(sec.id)])),
  }))
}

/** Role defaults as subjects, keyed by role. */
export function roleSubjects(roles: readonly Role[] = MATRIX_ROLES): Record<string, AccessSubject> {
  return Object.fromEntries(roles.map((r) => [r, { role: r }]))
}

export function roleShortLabel(role: Role): string {
  const short: Partial<Record<Role, string>> = {
    super_admin: 'Super admin',
    client_admin: 'Principal',
    agent_admin: 'Agency admin',
    ground_agent: 'Full agent',
    agent: 'Candidate',
  }
  return short[role] ?? roleLabels[role]
}
