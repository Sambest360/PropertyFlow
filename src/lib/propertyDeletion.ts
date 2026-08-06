import type { Application, PropertyAsset, Role, Tenancy } from '../types/domain'

const ADMIN_DELETE_ROLES: ReadonlySet<Role> = new Set([
  'super_admin',
  'client_admin',
  'agent_admin',
])

/** Agency admin roles that may remove properties from the active portfolio. */
export function canDeletePropertyRole(role: Role): boolean {
  return ADMIN_DELETE_ROLES.has(role)
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
