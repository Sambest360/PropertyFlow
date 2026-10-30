import type { LicenseStatus, Permission, Role } from '../types/domain.js'

/** Staff / platform capabilities — portals are actor-specific, not staff tools. */
const STAFF: Permission[] = [
  'tenant.manage',
  'users.manage',
  'roles.assign',
  'users.impersonate',
  'config.manage',
  'notifications.broadcast',
  'assets.view',
  'assets.manage',
  'listings.publish',
  'leads.view',
  'leads.manage',
  'applications.view',
  'applications.review',
  'viewings.manage',
  'maintenance.view',
  'maintenance.manage',
  'contractors.view',
  'contractors.manage',
  'documents.view',
  'payments.view',
  'payments.manage',
  'reports.view',
  'messages.manage',
  'occupants.view',
  // Compliance permissions
  'compliance.view',
  // Trust / Banking permissions
  'trust.view',
  'trust.allocate',
  'trust.approve_payout',
  'trust.import_csv',
  'trust.view_arrears',
  'escalations.view',
  'billing.view',
  'screening.run',
]

const ALL: Permission[] = ['platform.manage', ...STAFF]

/** Default modules enabled for a new agency (no platform.manage). Includes portal modules so landlords / tenants / contractors can be invited. */
export const DEFAULT_AGENCY_PERMISSIONS: Permission[] = [
  ...STAFF,
  'portal.owner',
  'portal.tenant',
  'portal.contractor',
  'trust.view_own_statement',
  'trust.view_own_invoices',
]

/** Principal / Broker — full agency control & legal accountability (not portal actors). */
const PRINCIPAL: Permission[] = [...STAFF]

/**
 * Agency Administrator / Manager — office ops: trust accounting, lease docs,
 * correspondence, staff directory. Not the licensed principal.
 */
const AGENCY_ADMIN: Permission[] = [
  'users.manage',
  'users.impersonate',
  'config.manage',
  'notifications.broadcast',
  'assets.view',
  'assets.manage',
  'listings.publish',
  'leads.view',
  'applications.view',
  'applications.review',
  'viewings.manage',
  'maintenance.view',
  'maintenance.manage',
  'contractors.view',
  'contractors.manage',
  'documents.view',
  'payments.view',
  'payments.manage',
  'reports.view',
  'messages.manage',
  'occupants.view',
  'compliance.view',
  'trust.view',
  'trust.allocate',
  'trust.approve_payout',
  'trust.import_csv',
  'trust.view_arrears',
  'escalations.view',
  'billing.view',
  'screening.run',
]

/**
 * Experienced / Full Agent — licensed: listings, viewings, negotiate sales/leases.
 */
const FULL_AGENT: Permission[] = [
  'assets.view',
  'assets.manage',
  'listings.publish',
  'leads.view',
  'leads.manage',
  'applications.view',
  'applications.review',
  'viewings.manage',
  'maintenance.view',
  'maintenance.manage',
  'contractors.view',
  'contractors.manage',
  'documents.view',
  'payments.view',
  'messages.manage',
  'escalations.view',
  'screening.run',
]

/**
 * Candidate / Intern Agent — practical training under a principal or full agent.
 * No independent publish / review; field work with supervision.
 */
const CANDIDATE_AGENT: Permission[] = [
  'assets.view',
  'leads.view',
  'applications.view',
  'viewings.manage',
  'maintenance.view',
  'documents.view',
  'messages.manage',
  'escalations.view',
  'screening.run',
]

export const rolePermissions: Record<Role, Permission[]> = {
  super_admin: ALL,
  client_admin: PRINCIPAL,
  agent_admin: AGENCY_ADMIN,
  ground_agent: FULL_AGENT,
  /** Candidate / intern — previously “legacy agent”. */
  agent: CANDIDATE_AGENT,
  landlord: [
    'assets.view',
    'assets.manage',
    'listings.publish',
    'payments.view',
    'reports.view',
    'portal.owner',
    'documents.view',
    'contractors.view',
    'contractors.manage',
    'maintenance.view',
    'messages.manage',
    'trust.view_own_statement',
  ],
  tenant: [
    'portal.tenant',
    'documents.view',
    'payments.view',
    'payments.manage',
    'maintenance.view',
    'maintenance.manage',
    'messages.manage',
    'trust.view_own_statement',
  ],
  contractor: ['portal.contractor', 'maintenance.view', 'maintenance.manage', 'trust.view_own_invoices'],
}

export const roleLabels: Record<Role, string> = {
  super_admin: 'Super Admin',
  client_admin: 'Principal / Broker',
  agent_admin: 'Agency Administrator',
  ground_agent: 'Full Agent',
  agent: 'Candidate / Intern Agent',
  landlord: 'Landlord',
  tenant: 'Applicant / Tenant',
  contractor: 'Contractor',
}

export const roleBlurbs: Record<Role, string> = {
  super_admin: 'Platform-wide access across all agencies.',
  client_admin:
    'Licensed principal — legally responsible for the agency, trust accounts, contracts, and regulatory compliance.',
  agent_admin:
    'Office manager — team roster, day-to-day ops, and agency-only broadcasts. Not the licensed principal.',
  ground_agent:
    'Licensed professional — secure listings, host viewings, and negotiate sales or leases.',
  agent:
    'In training under a principal or full agent — practical field work without independent listing authority.',
  landlord: 'List and publish your properties — applicants apply on the marketplace.',
  tenant: 'Browse and apply; payments and maintenance unlock after approval.',
  contractor: 'Assigned maintenance jobs only.',
}

/** One-line scope for role cards. */
export const roleScopes: Record<Role, string> = {
  super_admin: 'Platform',
  client_admin: 'Entire agency (legal accountability)',
  agent_admin: 'Office ops (Team + agency broadcasts)',
  ground_agent: 'Listings & deals',
  agent: 'Supervised field work',
  landlord: 'Own assets',
  tenant: 'Own lease / apps',
  contractor: 'Assigned jobs',
}

/** Display order for agency staff hierarchy (top → trainee). */
export const AGENCY_HIERARCHY_ROLES: Role[] = [
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
]

/** Temporarily hidden from create-user and hierarchy UI; RBAC unchanged. */
export const DEFERRED_ADMIN_ROLES: readonly Role[] = ['client_admin', 'agent']

export function rolesVisibleInAdminUi(roles: readonly Role[]): Role[] {
  return roles.filter((r) => !DEFERRED_ADMIN_ROLES.includes(r))
}

export const AGENCY_HIERARCHY_ROLES_UI = rolesVisibleInAdminUi(AGENCY_HIERARCHY_ROLES)

export const AGENCY_HIERARCHY_NOTES = [
  {
    title: 'Legal supervision',
    body: 'The Principal is accountable for every action and contract executed under the agency brand — including work by full and candidate agents.',
  },
  {
    title: 'Commission structure',
    body: 'Most agents earn on a split: a share of fees stays with the agent, the rest with the agency. Track splits per agent on their profile.',
  },
  {
    title: 'Compliance tracking',
    body: 'Agencies monitor licensing (principal / full / candidate), mentorship for interns, and ongoing professional requirements.',
  },
] as const

/** Grouped capability checklist for agency create/edit. */
export const AGENCY_CAPABILITY_GROUPS: Array<{
  id: string
  label: string
  permissions: Permission[]
}> = [
  {
    id: 'people',
    label: 'Users & team',
    permissions: ['users.manage', 'roles.assign', 'users.impersonate', 'occupants.view', 'tenant.manage'],
  },
  {
    id: 'config',
    label: 'Configuration & alerts',
    permissions: ['config.manage', 'notifications.broadcast'],
  },
  {
    id: 'portfolio',
    label: 'Properties & listings',
    permissions: ['assets.view', 'assets.manage', 'listings.publish'],
  },
  {
    id: 'sales',
    label: 'Sales & applications',
    permissions: [
      'leads.view',
      'leads.manage',
      'applications.view',
      'applications.review',
      'viewings.manage',
    ],
  },
  {
    id: 'ops',
    label: 'Operations',
    permissions: [
      'maintenance.view',
      'maintenance.manage',
      'documents.view',
      'payments.view',
      'payments.manage',
      'messages.manage',
    ],
  },
  {
    id: 'contractors',
    label: 'Contractors',
    permissions: ['contractors.view', 'contractors.manage'],
  },
  {
    id: 'screening',
    label: 'Escalations & checks',
    permissions: ['escalations.view', 'screening.run'],
  },
  {
    id: 'trust',
    label: 'Trust & banking',
    permissions: ['trust.view', 'trust.view_arrears', 'trust.allocate', 'trust.import_csv', 'trust.approve_payout'],
  },
  {
    id: 'insights',
    label: 'Reports, compliance & billing',
    permissions: ['reports.view', 'compliance.view', 'billing.view'],
  },
  {
    id: 'portals',
    label: 'External portals',
    permissions: [
      'portal.owner',
      'portal.tenant',
      'portal.contractor',
      'trust.view_own_statement',
      'trust.view_own_invoices',
    ],
  },
]

export type CapabilityGroupLevel = 'none' | 'view' | 'full' | 'custom'

/** Read / view-style permissions within a group (used for the “View” dropdown level). */
export function viewPermissionsInGroup(permissions: Permission[]): Permission[] {
  return permissions.filter(
    (p) =>
      p.endsWith('.view') ||
      p === 'occupants.view' ||
      p === 'documents.view' ||
      p === 'reports.view',
  )
}

export function groupSupportsViewLevel(permissions: Permission[]): boolean {
  const views = viewPermissionsInGroup(permissions)
  return views.length > 0 && views.length < permissions.length
}

function sameSet(a: Permission[], b: Permission[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((p) => set.has(p))
}

export function resolveGroupLevel(
  groupPermissions: Permission[],
  selected: Permission[],
): CapabilityGroupLevel {
  const selectedInGroup = groupPermissions.filter((p) => selected.includes(p))
  if (selectedInGroup.length === 0) return 'none'
  if (sameSet(selectedInGroup, groupPermissions)) return 'full'
  const views = viewPermissionsInGroup(groupPermissions)
  if (views.length > 0 && sameSet(selectedInGroup, views)) return 'view'
  return 'custom'
}

/** Apply a group access level; preserves permissions outside this group. */
export function applyGroupLevel(
  current: Permission[],
  groupPermissions: Permission[],
  level: Exclude<CapabilityGroupLevel, 'custom'>,
): Permission[] {
  const outside = current.filter((p) => !groupPermissions.includes(p))
  if (level === 'none') return outside
  if (level === 'full') return [...outside, ...groupPermissions]
  const views = viewPermissionsInGroup(groupPermissions)
  return [...outside, ...views]
}

export const permissionLabels: Partial<Record<Permission, string>> = {
  'trust.view': 'View trust cashbook',
  'trust.allocate': 'Allocate receipts',
  'trust.approve_payout': 'Approve payouts',
  'trust.import_csv': 'Import bank CSV',
  'compliance.view': 'View compliance dashboard',
  'trust.view_arrears': 'View arrears',
  'trust.view_own_statement': 'View own statement',
  'trust.view_own_invoices': 'View own invoices',
  'platform.manage': 'Platform manage',
  'tenant.manage': 'Tenant / agency settings',
  'users.manage': 'Manage users',
  'roles.assign': 'Assign roles',
  'users.impersonate': 'Impersonate users',
  'config.manage': 'Configuration',
  'notifications.broadcast': 'Broadcast notifications',
  'assets.view': 'View properties',
  'assets.manage': 'Manage properties',
  'listings.publish': 'Publish listings',
  'leads.view': 'View leads',
  'leads.manage': 'Manage leads',
  'applications.view': 'View applications',
  'applications.review': 'Review applications',
  'viewings.manage': 'Manage viewings',
  'maintenance.view': 'View maintenance',
  'maintenance.manage': 'Manage maintenance',
  'contractors.view': 'View approved contractors',
  'contractors.manage': 'Manage contractor roster',
  'documents.view': 'View documents',
  'payments.view': 'View payments',
  'payments.manage': 'Manage payments',
  'reports.view': 'View reports',
  'messages.manage': 'Messaging',
  'occupants.view': 'View tenants',
  'portal.owner': 'Owner portal',
  'portal.tenant': 'Tenant portal',
  'portal.contractor': 'Contractor portal',
  'escalations.view': 'View escalations',
  'billing.view': 'Subscription & billing',
  'screening.run': 'Run background / credit checks',
}

export function can(role: Role, permission: Permission) {
  return rolePermissions[role]?.includes(permission) ?? false
}

export function canAny(role: Role, permissions: Permission[]) {
  return permissions.some((p) => can(role, p))
}

/** Permissions for a user before agency intersection. */
/** Office-management permissions only principals and agency administrators may hold. */
const ADMIN_ONLY: Permission[] = [
  'tenant.manage',
  'users.manage',
  'roles.assign',
  'users.impersonate',
  'config.manage',
  'notifications.broadcast',
  'trust.approve_payout',
  'billing.view',
]
/** Self-service portal permissions — never granted to staff. */
const PORTAL_ONLY: Permission[] = [
  'portal.owner',
  'portal.tenant',
  'portal.contractor',
  'trust.view_own_statement',
  'trust.view_own_invoices',
]

/** The most a user of this role can ever be given. */
export function roleCeiling(role: Role): Permission[] {
  const all = rolePermissions.super_admin
  if (role === 'super_admin') return [...all]
  if (role === 'client_admin' || role === 'agent_admin') {
    return all.filter((p) => p !== 'platform.manage' && !PORTAL_ONLY.includes(p))
  }
  if (role === 'ground_agent' || role === 'agent') {
    return all.filter((p) => p !== 'platform.manage' && !PORTAL_ONLY.includes(p) && !ADMIN_ONLY.includes(p))
  }
  return [...(rolePermissions[role] ?? [])]
}

/**
 * Permissions that may be ticked for a user: the role's ceiling, limited to the
 * agency's enabled modules and — unless the person granting is a super admin —
 * to what the granter holds themselves.
 */
export function grantablePermissions(
  role: Role,
  opts: { agencyEnabled?: Permission[] | null; granterRole?: Role; granterPermissions?: Permission[] } = {},
): Permission[] {
  let out = roleCeiling(role)
  if (role !== 'super_admin' && opts.agencyEnabled?.length) {
    const agency = new Set(opts.agencyEnabled)
    out = out.filter((p) => agency.has(p))
  }
  if (opts.granterRole && opts.granterRole !== 'super_admin' && opts.granterPermissions) {
    const mine = new Set(opts.granterPermissions)
    out = out.filter((p) => mine.has(p))
  }
  return out
}

export function userBasePermissions(role: Role, enabledPermissions?: Permission[] | null) {
  if (role === 'super_admin') return rolePermissions.super_admin
  if (enabledPermissions?.length) return enabledPermissions
  return rolePermissions[role] ?? []
}

/** User pack ∩ agency enabled modules (super_admin ignores agency pack). */
export function effectiveCan(
  role: Role,
  permission: Permission,
  agencyEnabled: Permission[] | null | undefined,
  userEnabled?: Permission[] | null,
) {
  const base = userBasePermissions(role, userEnabled)
  if (!base.includes(permission)) return false
  if (role === 'super_admin') return true
  if (!agencyEnabled) return true
  return agencyEnabled.includes(permission)
}

export function isAgencyStaff(role: Role) {
  return role === 'client_admin' || role === 'agent_admin' || role === 'ground_agent' || role === 'agent'
}

/** Principal / broker — legally responsible for the agency. */
export function isPrincipal(role: Role) {
  return role === 'client_admin'
}

/** Full or candidate agents doing field / deal work. */
export function isFieldAgent(role: Role) {
  return role === 'ground_agent' || role === 'agent'
}

export function defaultLicenseStatus(role: Role): LicenseStatus {
  if (role === 'client_admin') return 'principal'
  if (role === 'ground_agent') return 'full'
  if (role === 'agent') return 'candidate'
  return 'n/a'
}

export function mentorsForAgency<T extends { role: Role; agencyId: string | null; active: boolean }>(
  users: T[],
  agencyId: string | null | undefined,
): T[] {
  if (!agencyId) return []
  return users.filter(
    (u) =>
      u.active &&
      u.agencyId === agencyId &&
      (u.role === 'client_admin' || u.role === 'ground_agent'),
  )
}

/**
 * Version of the permission catalogue. Stored next to a saved permission list
 * (users.metadata.permissionsVersion, clients.settings.permissionsVersion) so
 * lists saved before a permission existed can be read correctly.
 */
export const PERMISSIONS_VERSION = 2

/**
 * Permissions added in version 2, and the older permissions that gave the
 * same access before they existed. A list saved earlier gets the new
 * permission when it holds any of these, so nobody loses access when the
 * catalogue grows; a list saved at version 2 is taken exactly as saved.
 */
export const IMPLIED_BEFORE_V2: Readonly<Partial<Record<Permission, readonly Permission[]>>> = {
  'escalations.view': ['leads.view', 'occupants.view'],
  'billing.view': ['users.manage'],
  'screening.run': ['applications.view', 'applications.review'],
}

/** A stored permission list read at the current catalogue version (null when none is stored). */
export function normalizeStoredPermissions(list: unknown, version?: unknown): Permission[] | null {
  if (!Array.isArray(list) || list.length === 0) return null
  const out = list.filter((p): p is Permission => typeof p === 'string')
  if (Number(version) >= PERMISSIONS_VERSION) return out
  const set = new Set<Permission>(out)
  for (const [perm, parents] of Object.entries(IMPLIED_BEFORE_V2) as Array<[Permission, readonly Permission[]]>) {
    if (!set.has(perm) && parents.some((p) => set.has(p))) set.add(perm)
  }
  return [...set]
}

/**
 * True when this user's own saved list switches off a permission their role
 * has by default — an explicit restriction by an admin. Users on role
 * defaults (no list) and super admins are never restricted.
 */
export function isRestrictedPermission(
  role: Role,
  permission: Permission,
  userEnabled: Permission[] | null | undefined,
): boolean {
  if (role === 'super_admin' || !userEnabled?.length) return false
  return (rolePermissions[role] ?? []).includes(permission) && !userEnabled.includes(permission)
}

/**
 * True when every one of `permissions` the role holds by default has been
 * switched off for this user (and the role holds at least one of them).
 */
export function allRestricted(
  role: Role,
  permissions: readonly Permission[],
  userEnabled: Permission[] | null | undefined,
): boolean {
  if (role === 'super_admin' || !userEnabled?.length) return false
  const defaults = rolePermissions[role] ?? []
  return permissions.some((p) => defaults.includes(p)) && permissions.every((p) => !userEnabled.includes(p))
}

