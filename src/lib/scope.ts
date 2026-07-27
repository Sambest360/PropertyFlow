/**
 * Property-linked access control.
 *
 * Linkage model (no join table required):
 * - Landlord ↔ many properties via `PropertyAsset.landlordId`
 * - Agent ↔ many properties via `PropertyAsset.agentId` (primary assignee)
 * - Tenant ↔ property via applications / tenancies
 * - Contractor ↔ property via maintenance tickets (assigned or claimable)
 *
 * Super admin / principal / agency admin keep agency-wide (or platform) scope.
 * Field agents, landlords, tenants, and contractors are limited to linked properties.
 */

import {
  canAccessProperty,
  canSeeAgency,
  type PropertyAccessSubject,
  type PropertyAccessViewer,
} from './agencyScope.js'
import type {
  Application,
  MaintenanceTicket,
  PropertyAsset,
  Role,
  Tenancy,
} from '../types/domain.js'
import { isFieldAgent } from './permissions.js'

export type PropertyLink = PropertyAccessSubject & { id: string }

export type ScopeLinksInput = {
  properties: readonly PropertyLink[]
  applications?: readonly Pick<
    Application,
    'applicantUserId' | 'email' | 'propertyId' | 'stage'
  >[]
  tenancies?: readonly Pick<Tenancy, 'tenantUserId' | 'propertyId'>[]
  tickets?: readonly Pick<
    MaintenanceTicket,
    'contractorId' | 'propertyId' | 'agencyId' | 'status' | 'assignedAgentId'
  >[]
  /** Properties the applicant is blocked from (cannot browse / apply). */
  blockedPropertyIds?: ReadonlySet<string>
  viewerEmail?: string
}

export type PropertyScope = {
  viewer: PropertyAccessViewer
  /** Properties the viewer may open / mutate through ops screens. */
  allowedPropertyIds: ReadonlySet<string>
  /**
   * True when the role is not property-book limited beyond agency
   * (super_admin, principal, agency admin).
   */
  agencyWide: boolean
}

export function isAgencyWideRole(role: Role): boolean {
  return role === 'super_admin' || role === 'client_admin' || role === 'agent_admin'
}

/** Tenant / applicant property book from apps + leases (minus blocks). */
export function resolveTenantPropertyIds(
  input: Pick<ScopeLinksInput, 'applications' | 'tenancies' | 'blockedPropertyIds' | 'viewerEmail'> & {
    userId: string
  },
): Set<string> {
  const blocked = input.blockedPropertyIds ?? new Set<string>()
  const email = input.viewerEmail?.toLowerCase()
  const ids = new Set<string>()
  for (const a of input.applications ?? []) {
    const matchUser = a.applicantUserId === input.userId
    const matchEmail = Boolean(email && a.email.toLowerCase() === email)
    if (!matchUser && !matchEmail) continue
    if (a.stage === 'Blocked' || blocked.has(a.propertyId)) continue
    ids.add(a.propertyId)
  }
  for (const t of input.tenancies ?? []) {
    if (t.tenantUserId !== input.userId) continue
    if (blocked.has(t.propertyId)) continue
    ids.add(t.propertyId)
  }
  return ids
}

/**
 * Contractor book: assigned tickets, plus same-agency unassigned open jobs
 * (claimable pool) so they can pick up work.
 */
export function resolveContractorPropertyIds(
  tickets: ScopeLinksInput['tickets'],
  userId: string,
  agencyId: string | null,
): Set<string> {
  const ids = new Set<string>()
  for (const t of tickets ?? []) {
    if (t.contractorId === userId) {
      ids.add(t.propertyId)
      continue
    }
    if (
      !t.contractorId &&
      t.status !== 'Completed' &&
      t.status !== 'Cancelled' &&
      agencyId &&
      t.agencyId === agencyId
    ) {
      ids.add(t.propertyId)
    }
  }
  return ids
}

export function buildPropertyAccessViewer(
  base: Omit<PropertyAccessViewer, 'tenantPropertyIds' | 'contractorPropertyIds'>,
  links: ScopeLinksInput,
): PropertyAccessViewer {
  const tenantPropertyIds =
    base.role === 'tenant'
      ? resolveTenantPropertyIds({
          userId: base.userId,
          viewerEmail: links.viewerEmail,
          applications: links.applications,
          tenancies: links.tenancies,
          blockedPropertyIds: links.blockedPropertyIds,
        })
      : undefined
  const contractorPropertyIds =
    base.role === 'contractor'
      ? resolveContractorPropertyIds(links.tickets, base.userId, base.agencyId)
      : undefined
  return { ...base, tenantPropertyIds, contractorPropertyIds }
}

/**
 * Property IDs the viewer may interact with.
 * Field agents also include properties where they are ticket assignees
 * (even if not the listing’s primary agent).
 */
export function allowedPropertyIds(
  viewer: PropertyAccessViewer,
  links: ScopeLinksInput,
): Set<string> {
  const ids = new Set<string>()
  for (const p of links.properties) {
    if (canAccessProperty(viewer, p, p.id)) ids.add(p.id)
  }
  if (isFieldAgent(viewer.role)) {
    for (const t of links.tickets ?? []) {
      if (t.assignedAgentId === viewer.userId) ids.add(t.propertyId)
    }
  }
  return ids
}

export function buildPropertyScope(
  base: Omit<PropertyAccessViewer, 'tenantPropertyIds' | 'contractorPropertyIds'>,
  links: ScopeLinksInput,
): PropertyScope {
  const viewer = buildPropertyAccessViewer(base, links)
  return {
    viewer,
    allowedPropertyIds: allowedPropertyIds(viewer, links),
    agencyWide: isAgencyWideRole(base.role),
  }
}

export function propertyInScope(
  scope: PropertyScope,
  propertyId: string | null | undefined,
): boolean {
  if (!propertyId) return scope.agencyWide
  return scope.allowedPropertyIds.has(propertyId)
}

/** Entity visible when its property is in the viewer’s book. */
export function entityInPropertyScope(
  scope: PropertyScope,
  propertyId: string | null | undefined,
): boolean {
  return propertyInScope(scope, propertyId)
}

/**
 * Ticket visibility: property book OR direct assignment (agent / contractor).
 * Landlords only see tickets on owned properties (via allowed set).
 */
export function ticketInScope(
  scope: PropertyScope,
  ticket: Pick<MaintenanceTicket, 'propertyId' | 'assignedAgentId' | 'contractorId' | 'agencyId'>,
): boolean {
  const { viewer } = scope
  if (!canSeeAgency(viewer.role, viewer.agencyId, viewer.agencySuspended, ticket.agencyId)) {
    return false
  }
  if (viewer.role === 'contractor') {
    return (
      ticket.contractorId === viewer.userId ||
      (!ticket.contractorId && scope.allowedPropertyIds.has(ticket.propertyId))
    )
  }
  if (isFieldAgent(viewer.role)) {
    return (
      scope.allowedPropertyIds.has(ticket.propertyId) ||
      ticket.assignedAgentId === viewer.userId
    )
  }
  if (viewer.role === 'landlord' || viewer.role === 'tenant') {
    return scope.allowedPropertyIds.has(ticket.propertyId)
  }
  return scope.agencyWide || scope.allowedPropertyIds.has(ticket.propertyId)
}

/**
 * Lead / application / viewing: property book, or direct agent assignment
 * (covers rows whose listing agent differs from the deal owner).
 */
export function dealInScope(
  scope: PropertyScope,
  entity: { propertyId: string; agentId: string | null | undefined; agencyId: string },
): boolean {
  const { viewer } = scope
  if (!canSeeAgency(viewer.role, viewer.agencyId, viewer.agencySuspended, entity.agencyId)) {
    return false
  }
  if (isFieldAgent(viewer.role)) {
    return (
      scope.allowedPropertyIds.has(entity.propertyId) || entity.agentId === viewer.userId
    )
  }
  if (viewer.role === 'landlord' || viewer.role === 'tenant' || viewer.role === 'contractor') {
    return scope.allowedPropertyIds.has(entity.propertyId)
  }
  return true
}

/** Payment visibility with landlord / tenant party rules. */
export function paymentInScope(
  scope: PropertyScope,
  payment: {
    propertyId: string
    agencyId: string
    partyUserId: string | null
    partyName: string
    landlordVisible: boolean
  },
  opts?: { viewerName?: string; propertyLandlordId?: string | null },
): boolean {
  const { viewer } = scope
  if (viewer.role === 'tenant') {
    return (
      payment.partyUserId === viewer.userId ||
      Boolean(opts?.viewerName && payment.partyName === opts.viewerName)
    )
  }
  if (viewer.role === 'landlord') {
    return (
      payment.landlordVisible &&
      (scope.allowedPropertyIds.has(payment.propertyId) ||
        opts?.propertyLandlordId === viewer.userId)
    )
  }
  if (!canSeeAgency(viewer.role, viewer.agencyId, viewer.agencySuspended, payment.agencyId)) {
    return false
  }
  if (isFieldAgent(viewer.role)) {
    return scope.allowedPropertyIds.has(payment.propertyId)
  }
  return true
}

/** Message thread: participants always; otherwise property book (staff). */
export function threadInScope(
  scope: PropertyScope,
  thread: {
    agencyId: string
    propertyId: string | null
    participantIds: string[]
  },
): boolean {
  const { viewer } = scope
  if (viewer.role === 'landlord') return false
  if (viewer.role === 'tenant') {
    return thread.participantIds.includes(viewer.userId)
  }
  if (!canSeeAgency(viewer.role, viewer.agencyId, viewer.agencySuspended, thread.agencyId)) {
    return false
  }
  if (thread.participantIds.includes(viewer.userId)) return true
  if (isFieldAgent(viewer.role)) {
    if (!thread.propertyId) return false
    return scope.allowedPropertyIds.has(thread.propertyId)
  }
  return true
}

export function filterPropertiesInScope<T extends PropertyLink>(
  properties: readonly T[],
  scope: PropertyScope,
): T[] {
  return properties.filter((p) => scope.allowedPropertyIds.has(p.id))
}

/** Client-side mutation gate — refuse writes outside the viewer’s property book. */
export function canMutateProperty(
  scope: PropertyScope,
  property: PropertyAccessSubject | null | undefined,
  propertyId: string,
): boolean {
  if (!property) return false
  return canAccessProperty(scope.viewer, property, propertyId)
}

export function toPropertyLinks(
  properties: readonly Pick<PropertyAsset, 'id' | 'agencyId' | 'agentId' | 'landlordId'>[],
): PropertyLink[] {
  return properties.map((p) => ({
    id: p.id,
    agencyId: p.agencyId,
    agentId: p.agentId,
    landlordId: p.landlordId,
  }))
}
