import type { Agency, AppUser, Role } from '../types/domain.js'
import { CLIENT_TO_AGENCY } from './supabase/idMap.js'

const CLIENT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Session (/me, Supabase profile) may still carry a client UUID while bootstrap
 * rows use entity_id_map FE ids (ag-*). Prefer the bootstrap id when they diverge.
 */
export function pickAgencyId(
  sessionAgencyId: string | null | undefined,
  bootstrapAgencyId: string | null | undefined,
): string | null {
  const session = sessionAgencyId ?? null
  const bootstrap = bootstrapAgencyId ?? null
  if (!session) return bootstrap
  if (!bootstrap || session === bootstrap) return session
  if (bootstrap.startsWith('ag-') && CLIENT_UUID_RE.test(session)) return bootstrap
  if (session.startsWith('ag-') && CLIENT_UUID_RE.test(bootstrap)) return session
  return session
}

export type AgencyScopeContext = {
  agencies?: ReadonlyArray<{ id: string }>
  /** Bootstrap-synced agency for the signed-in user (FE id). */
  bootstrapAgencyId?: string | null
}

/**
 * After bootstrap merge, agencies/users can briefly disagree on UUID vs ag-* for
 * the same client. Collapse duplicate agency rows and remap user agencyId to FE.
 */
export function reconcileAgencyIdSpace(
  agencies: Agency[],
  users: AppUser[],
  properties?: PropertyAccessSubject[],
): { agencies: Agency[]; users: AppUser[]; properties?: PropertyAccessSubject[] } {
  const feBySlug = new Map<string, string>()
  for (const a of agencies) {
    if (a.id.startsWith('ag-') && a.slug) feBySlug.set(a.slug, a.id)
  }
  const uuidToFe = new Map<string, string>()
  for (const a of agencies) {
    if (!CLIENT_UUID_RE.test(a.id) || !a.slug) continue
    const fe = feBySlug.get(a.slug)
    if (fe) uuidToFe.set(a.id, fe)
  }
  if (!uuidToFe.size) return { agencies, users, properties }
  const nextAgencies = agencies.filter((a) => !(CLIENT_UUID_RE.test(a.id) && uuidToFe.has(a.id)))
  const nextUsers = users.map((u) => {
    if (!u.agencyId) return u
    const fe = uuidToFe.get(u.agencyId)
    return fe ? { ...u, agencyId: fe } : u
  })
  const nextProperties = properties?.map((p) => {
    if (!p.agencyId) return p
    const fe = uuidToFe.get(p.agencyId)
    return fe ? { ...p, agencyId: fe } : p
  })
  return { agencies: nextAgencies, users: nextUsers, properties: nextProperties ?? properties }
}

/** Viewer agency id in the same FE space as bootstrap users/properties. */
export function resolveViewerAgencyId(
  sessionAgencyId: string | null | undefined,
  ctx?: AgencyScopeContext,
): string | null {
  const picked = pickAgencyId(sessionAgencyId, ctx?.bootstrapAgencyId ?? null)
  if (picked && ctx?.agencies?.some((a) => a.id === picked)) return picked
  if (picked && CLIENT_UUID_RE.test(picked) && ctx?.agencies?.length === 1) {
    return ctx.agencies[0]!.id
  }
  return picked
}

/** Map a client UUID (or passthrough FE id) into bootstrap FE agency space. */
export function agencyIdInFeSpace(
  id: string | null | undefined,
  ctx?: AgencyScopeContext,
): string | null {
  if (!id) return null
  if (ctx?.agencies?.some((a) => a.id === id)) return id
  const mapped = CLIENT_TO_AGENCY[id]
  if (mapped) return mapped
  return id
}

/** Agency boundary: super admin sees all; suspended / unscoped agencies see nothing. */
export function canSeeAgency(
  role: Role,
  viewerAgencyId: string | null,
  agencySuspended: boolean,
  resourceAgencyId: string | null | undefined,
  ctx?: AgencyScopeContext,
): boolean {
  if (role === 'super_admin') return true
  const viewerFe = resolveViewerAgencyId(viewerAgencyId, ctx)
  if (!viewerFe || agencySuspended) return false
  if (!resourceAgencyId) return false
  const resourceFe = agencyIdInFeSpace(resourceAgencyId, ctx)
  const viewerNorm = agencyIdInFeSpace(viewerFe, ctx)
  return resourceFe === viewerNorm
}

/** Field agents only see their own book; principals / admins see the agency. */
export function canSeeAgentRecord(
  role: Role,
  viewerUserId: string,
  agentId: string | null | undefined,
): boolean {
  if (role === 'super_admin' || role === 'client_admin' || role === 'agent_admin') return true
  if (role === 'ground_agent' || role === 'agent') {
    // P0-5: agency Unassigned pool (null/empty agentId) — mirrors dealInScope
    // so FA property-book does not vanish after create when agentId was blank.
    return !agentId || agentId === viewerUserId
  }
  return true
}

/** Landlords only see assets they own; staff ignore this check. */
export function canSeeLandlordAsset(
  role: Role,
  viewerUserId: string,
  landlordId: string | null,
): boolean {
  if (role === 'landlord') return landlordId === viewerUserId
  return true
}

export type PropertyAccessSubject = {
  agencyId: string
  agentId: string | null
  /** null = landlord-less building: visible to staff, never to a landlord. */
  landlordId: string | null
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

/** Roles an Agency Administrator may impersonate within their agency. */
const AGENCY_ADMIN_IMPERSONATABLE: Role[] = [
  'ground_agent',
  'agent',
  'landlord',
  'tenant',
  'contractor',
]

/**
 * Impersonation target must be active, in scope for the actor's role,
 * same agency (unless platform), and must not escalate to super_admin.
 */
export function canImpersonateTarget(
  actor: { role: Role; agencyId: string | null },
  target: { role: Role; agencyId: string | null; active: boolean },
): boolean {
  if (!target.active) return false
  if (target.role === 'super_admin' && actor.role !== 'super_admin') return false
  if (actor.role === 'super_admin') return true
  if (target.agencyId !== actor.agencyId) return false
  if (actor.role === 'agent_admin') {
    return AGENCY_ADMIN_IMPERSONATABLE.includes(target.role)
  }
  if (actor.role === 'client_admin') return target.role !== 'super_admin'
  return false
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
