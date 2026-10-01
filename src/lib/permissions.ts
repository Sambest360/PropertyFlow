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
  'occupants.view',
  'trust.view',
  'trust.view_arrears',
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
  'occupants.view',
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
    id: 'insights',
    label: 'Reports',
    permissions: ['reports.view'],
  },
  {
    id: 'portals',
    label: 'External portals',
    permissions: ['portal.owner', 'portal.tenant', 'portal.contractor'],
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
}

export function can(role: Role, permission: Permission) {
  return rolePermissions[role]?.includes(permission) ?? false
}

export function canAny(role: Role, permissions: Permission[]) {
  return permissions.some((p) => can(role, p))
}

/** Permissions for a user before agency intersection. */
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
