import { canSeeAgency, type AgencyScopeContext } from './agencyScope'
import type { Application, PropertyAsset, Role, Tenancy } from '../types/domain'

export type PropertyDeleteViewer = { role: Role; userId: string; agencyId: string | null }
export type PropertyDeleteStored = { agencyId: string; agentId: string | null }

const ARCHIVE_CAPABLE_ROLES: ReadonlySet<Role> = new Set([
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
])

/**
 * Authoritative soft-delete / restore rule (mirrored on server).
 * 1) super_admin — any property
 * 2) client_admin / agent_admin — same agency (FE id space)
 * 3) ground_agent / agent — same agency and units.agent_id = viewer
 */
export function canDeletePropertyByRule(
  viewer: PropertyDeleteViewer,
  stored: PropertyDeleteStored,
  ctx?: AgencyScopeContext,
): boolean {
  if (viewer.role === 'super_admin') return true
  if (viewer.role === 'client_admin' || viewer.role === 'agent_admin') {
    return canSeeAgency(viewer.role, viewer.agencyId, false, stored.agencyId, ctx)
  }
  if (viewer.role === 'ground_agent' || viewer.role === 'agent') {
    return (
      stored.agentId === viewer.userId &&
      canSeeAgency(viewer.role, viewer.agencyId, false, stored.agencyId, ctx)
    )
  }
  return false
}

export function canDeleteStoredProperty(
  viewer: PropertyDeleteViewer,
  property: Pick<PropertyAsset, 'agencyId' | 'agentId'>,
  ctx?: AgencyScopeContext,
): boolean {
  return canDeletePropertyByRule(
    viewer,
    { agencyId: property.agencyId, agentId: property.agentId },
    ctx,
  )
}

/** Roles that may open the deleted-properties list (rows still scope-filtered). */
export function canOpenPropertyArchive(role: Role): boolean {
  return ARCHIVE_CAPABLE_ROLES.has(role)
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
