import { blockedPropertyIdsForApplicant } from './blockedApplicants'
import { agencyBlocksStaffAccess } from './agencyStatus'
import type { PropertyAccessSubject } from './agencyScope'
import { buildPropertyScope, canMutateProperty, toPropertyLinks, type PropertyScope } from './scope'
import type {
  Agency,
  AgencyContractor,
  Application,
  AppUser,
  MaintenanceTicket,
  PropertyAsset,
  Role,
  Tenancy,
} from '../types/domain'

const ADMIN_DELETE_ROLES: ReadonlySet<Role> = new Set([
  'super_admin',
  'client_admin',
  'agent_admin',
])

/** Roles that may delete/archive when the property is in their mutate scope. */
const PROPERTY_DELETE_ROLES: ReadonlySet<Role> = new Set([
  ...ADMIN_DELETE_ROLES,
  'ground_agent',
])

/** Agency admin roles that may remove properties from the active portfolio. */
export function canDeletePropertyRole(role: Role): boolean {
  return ADMIN_DELETE_ROLES.has(role)
}

/** Whether the viewer may open the property archive (list is still scope-filtered). */
export function canViewPropertyArchive(role: Role): boolean {
  return PROPERTY_DELETE_ROLES.has(role)
}

/**
 * Scoped delete/archive: agency-wide staff for in-agency listings; full agents
 * only for properties they are assigned to (`agentId`).
 */
export function canDeleteProperty(
  scope: PropertyScope,
  property: PropertyAccessSubject & { id: string },
): boolean {
  if (!PROPERTY_DELETE_ROLES.has(scope.viewer.role)) return false
  return canMutateProperty(scope, property, property.id)
}

export type PropertyDeleteScopeInput = {
  users: readonly AppUser[]
  agencies: readonly Agency[]
  properties: readonly PropertyAsset[]
  applications: readonly Application[]
  tenancies: readonly Tenancy[]
  tickets: readonly MaintenanceTicket[]
  agencyContractors: readonly AgencyContractor[]
}

/** Client-side delete/restore gate using workspace state + signed-in user id. */
export function canDeletePropertyForViewer(
  input: PropertyDeleteScopeInput,
  viewerUserId: string | null | undefined,
  property: PropertyAsset,
): boolean {
  if (!viewerUserId) return false
  const user = input.users.find((u) => u.id === viewerUserId)
  if (!user) return false
  const agency = input.agencies.find((a) => a.id === user.agencyId)
  const agencySuspended = agencyBlocksStaffAccess(agency?.status)
  const blockedPropertyIds = blockedPropertyIdsForApplicant([...input.applications], user)
  const scope = buildPropertyScope(
    {
      role: user.role,
      userId: user.id,
      agencyId: user.agencyId,
      agencySuspended,
    },
    {
      properties: toPropertyLinks(input.properties),
      applications: input.applications,
      tenancies: input.tenancies,
      tickets: input.tickets,
      blockedPropertyIds,
      viewerEmail: user.email,
      agencyContractors: input.agencyContractors,
    },
  )
  return canDeleteProperty(scope, property)
}

/** True when a tenant is currently staying or scheduled to move in. */
export function propertyHasOccupant(
  propertyId: string,
  tenancies: readonly Tenancy[],
  applications: readonly Application[] = [],
): boolean {
  if (
    tenancies.some(
      (t) =>
        t.propertyId === propertyId &&
        (t.status === 'Active' || t.status === 'Pending Move-In'),
    )
  ) {
    return true
  }

  return applications.some(
    (a) => a.propertyId === propertyId && a.stage === 'Active Tenancy',
  )
}

export function isPropertyDeleted(property: Pick<PropertyAsset, 'deletedAt'>): boolean {
  return Boolean(property.deletedAt)
}

export function getPropertyDeleteBlockReason(
  property: PropertyAsset,
  tenancies: readonly Tenancy[],
  applications: readonly Application[] = [],
): string | null {
  if (isPropertyDeleted(property)) return 'This property is already in the archive.'
  if (propertyHasOccupant(property.id, tenancies, applications)) {
    return 'End the active tenancy before deleting this property.'
  }
  return null
}
