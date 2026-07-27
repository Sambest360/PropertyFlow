import type { Role } from '../types/domain'

/** Agency boundary: super admin sees all; suspended / unscoped agencies see nothing. */
export function canSeeAgency(
  role: Role,
  viewerAgencyId: string | null,
  agencySuspended: boolean,
  resourceAgencyId: string | null | undefined,
): boolean {
  if (role === 'super_admin') return true
  if (!viewerAgencyId || agencySuspended) return false
  return resourceAgencyId === viewerAgencyId
}

/** Field agents only see their own book; principals / admins see the agency. */
export function canSeeAgentRecord(
  role: Role,
  viewerUserId: string,
  agentId: string | null | undefined,
): boolean {
  if (role === 'super_admin' || role === 'client_admin' || role === 'agent_admin') return true
  if (role === 'ground_agent' || role === 'agent') return agentId === viewerUserId
  return true
}

/** Landlords only see assets they own; staff ignore this check. */
export function canSeeLandlordAsset(
  role: Role,
  viewerUserId: string,
  landlordId: string,
): boolean {
  if (role === 'landlord') return landlordId === viewerUserId
  return true
}

export type PropertyAccessSubject = {
  agencyId: string
  agentId: string | null
  landlordId: string
}

export type PropertyAccessViewer = {
  role: Role
  userId: string
  agencyId: string | null
  agencySuspended: boolean
  /** Property ids the tenant has applied to or leases (excluding blocked). */
  tenantPropertyIds?: ReadonlySet<string>
  /** Property ids with tickets assigned / claimable by this contractor. */
  contractorPropertyIds?: ReadonlySet<string>
}

/**
 * Whether a viewer may open a property ops detail (and mutate via that screen).
 * Tenants / contractors are limited to linked properties; staff use agency + agent rules.
 */
export function canAccessProperty(
  viewer: PropertyAccessViewer,
  property: PropertyAccessSubject,
  propertyId: string,
): boolean {
  const { role } = viewer

  if (role === 'tenant') {
    return viewer.tenantPropertyIds?.has(propertyId) ?? false
  }
  if (role === 'contractor') {
    return viewer.contractorPropertyIds?.has(propertyId) ?? false
  }
  if (role === 'landlord') {
    return canSeeLandlordAsset(role, viewer.userId, property.landlordId)
  }
  if (!canSeeAgency(role, viewer.agencyId, viewer.agencySuspended, property.agencyId)) {
    return false
  }
  if (
    (role === 'ground_agent' || role === 'agent') &&
    !canSeeAgentRecord(role, viewer.userId, property.agentId)
  ) {
    return false
  }
  return true
}

/** Impersonation target must be active, same agency (unless platform), and not escalate to super_admin. */
export function canImpersonateTarget(
  actor: { role: Role; agencyId: string | null },
  target: { role: Role; agencyId: string | null; active: boolean },
): boolean {
  if (!target.active) return false
  if (target.role === 'super_admin' && actor.role !== 'super_admin') return false
  if (actor.role !== 'super_admin' && target.agencyId !== actor.agencyId) return false
  return true
}

export type ScopedDocument = {
  id: string
  agencyId: string
  propertyId: string
}

/**
 * Property register docs: must match agency AND the viewer’s property access rules.
 * Orphan docs (unknown property) are denied so they cannot leak across books.
 */
export function filterScopedPropertyDocuments<T extends ScopedDocument>(
  documents: readonly T[],
  propertiesById: ReadonlyMap<string, PropertyAccessSubject>,
  viewer: PropertyAccessViewer,
): T[] {
  return documents.filter((doc) => {
    if (!canSeeAgency(viewer.role, viewer.agencyId, viewer.agencySuspended, doc.agencyId)) {
      return false
    }
    const property = propertiesById.get(doc.propertyId)
    if (!property) return false
    // Agency on the doc must match the property’s agency (guards tampered / stale rows).
    if (property.agencyId !== doc.agencyId && viewer.role !== 'super_admin') return false
    return canAccessProperty(viewer, property, doc.propertyId)
  })
}
