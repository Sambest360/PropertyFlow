import type { Permission, Role } from '../types/domain'

const ALL: Permission[] = [
  'platform.manage',
  'tenant.manage',
  'users.manage',
  'roles.assign',
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
  'documents.view',
  'payments.view',
  'payments.manage',
  'reports.view',
  'messages.manage',
  'occupants.view',
  'portal.owner',
  'portal.tenant',
  'portal.contractor',
]

const AGENCY_OPS: Permission[] = [
  'users.manage',
  'roles.assign',
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
  'documents.view',
  'payments.view',
  'payments.manage',
  'reports.view',
  'messages.manage',
  'occupants.view',
  'portal.owner',
  'portal.tenant',
  'portal.contractor',
]

/** Field / ground agents — strong on viewings & assets, lighter on users/billing */
const GROUND: Permission[] = [
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
  'documents.view',
  'messages.manage',
  'occupants.view',
]

export const rolePermissions: Record<Role, Permission[]> = {
  super_admin: ALL,
  client_admin: AGENCY_OPS,
  /** Admin agents — office leads, staffing, full ops for their agency */
  agent_admin: AGENCY_OPS.filter((p) => p !== 'roles.assign'),
  /** On-property contact — interviews, viewings, asset condition */
  ground_agent: GROUND,
  /** Legacy alias → same as ground */
  agent: GROUND,
  landlord: ['assets.view', 'payments.view', 'reports.view', 'portal.owner'],
  tenant: [
    'portal.tenant',
    'applications.view',
    'documents.view',
    'payments.view',
    'payments.manage',
    'maintenance.view',
    'maintenance.manage',
    'messages.manage',
  ],
  contractor: ['portal.contractor', 'maintenance.view', 'maintenance.manage'],
}

export const roleLabels: Record<Role, string> = {
  super_admin: 'Super Admin',
  client_admin: 'Lead',
  agent_admin: 'Admin Agent',
  ground_agent: 'Ground Agent',
  agent: 'Agent (legacy)',
  landlord: 'Landlord',
  tenant: 'Applicant / Tenant',
  contractor: 'Contractor',
}

export const roleBlurbs: Record<Role, string> = {
  super_admin: 'Platform-wide access across all agencies.',
  client_admin: 'Full control: infrastructure, staff, landlords, listings, and occupants.',
  agent_admin: 'Office lead — manage agents, listings, applications, and portfolio ops.',
  ground_agent: 'On-property contact — viewings, interviews, condition checks, unit inventory.',
  agent: 'Legacy agent role (maps to ground agent permissions).',
  landlord: 'Your buildings and rent receipts — agency manages tenants.',
  tenant: 'Search, apply, book viewings, pay, and message the agency/agent.',
  contractor: 'Assigned maintenance jobs only.',
}

export function can(role: Role, permission: Permission) {
  return rolePermissions[role]?.includes(permission) ?? false
}

export function canAny(role: Role, permissions: Permission[]) {
  return permissions.some((p) => can(role, p))
}

export function isAgencyStaff(role: Role) {
  return role === 'client_admin' || role === 'agent_admin' || role === 'ground_agent' || role === 'agent'
}

/** Ground / legacy agents — only assigned portfolio */
export function isFieldAgent(role: Role) {
  return role === 'ground_agent' || role === 'agent'
}
