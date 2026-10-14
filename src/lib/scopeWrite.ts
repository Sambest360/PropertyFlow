/**
 * Shared write-gate rules for client + server.
 * Property-locked roles must have the entity’s property in their book;
 * agency-wide roles may mutate within their agency (platform for super_admin).
 */

import { canSeeAgency, type PropertyAccessSubject } from './agencyScope.js'
import { isFieldAgent } from './permissions.js'
import {
  canMutateProperty,
  dealInScope,
  isAgencyWideRole,
  propertyInScope,
  ticketInScope,
  type PropertyScope,
} from './scope.js'
import type { Role } from '../types/domain.js'

export type WriteGateInput = {
  resource: string
  /** Resolved frontend property id, when the entity is property-linked. */
  propertyId: string | null
  /** Property row used for landlord/agent mutate checks. */
  property: PropertyAccessSubject | null
  agencyId: string | null
  /**
   * Deal assignee (application / lead / viewing / viewing_slot).
   * Used with dealInScope so FA Unassigned pool matches list (#41).
   */
  agentId?: string | null
  /** Existing / payload ticket fields for ticket-scoped writes. */
  ticket?: {
    propertyId: string
    assignedAgentId: string | null
    contractorId: string | null
    agencyId: string
  } | null
  /** For notification / message ownership shortcuts. */
  ownerUserId?: string | null
}

/** Deal resources whose write gate mirrors dealInScope (list #41). */
const DEAL_WRITE_RESOURCES = new Set([
  'application',
  'lead',
  'viewing',
  'viewing_slot',
])

const LANDLORD_LISTING_RESOURCES = new Set([
  'building',
  'unit',
  'property',
  'room',
  'asset',
])

function landlordOwnListingWrite(scope: PropertyScope, input: WriteGateInput): boolean {
  const { viewer } = scope
  if (viewer.role !== 'landlord' || !input.agencyId || !LANDLORD_LISTING_RESOURCES.has(input.resource)) {
    return false
  }
  const landlordId = input.property?.landlordId
  if (!landlordId || landlordId !== viewer.userId) return false
  if (!viewer.agencyId) {
    // Server enrichActor normally sets agency from users.client_id; when the
    // viewer is unset (tests / stale session), still allow own-listing writes.
    return true
  }
  return canSeeAgency(viewer.role, viewer.agencyId, viewer.agencySuspended, input.agencyId)
}

function dealWriteAllowed(scope: PropertyScope, input: WriteGateInput): boolean {
  if (!input.propertyId || !input.agencyId) return false
  if (!DEAL_WRITE_RESOURCES.has(input.resource)) return false
  return dealInScope(scope, {
    propertyId: input.propertyId,
    agentId: input.agentId,
    agencyId: input.agencyId,
  })
}

/**
 * Whether the viewer may upsert/delete this entity.
 * Property-locked roles must have the entity’s property in their allowed set
 * (stricter than list visibility, which also allows “my deal on someone else’s listing”).
 */
export function canWriteEntity(scope: PropertyScope, input: WriteGateInput): boolean {
  const { viewer } = scope
  const role: Role = viewer.role

  if (role === 'super_admin') return true

  // Own notifications / profile-ish updates
  if (
    (input.resource === 'notification' || input.resource === 'user') &&
    input.ownerUserId &&
    input.ownerUserId === viewer.userId
  ) {
    return true
  }

  // P0-sync (R11): guest Apply — applicant upserts their own application row
  // (marketplace → My Apps). Must be allowed before property-book checks, or
  // first-time applicants are locked out (they are not yet on the listing book).
  if (
    input.resource === 'application' &&
    input.ownerUserId &&
    input.ownerUserId === viewer.userId
  ) {
    return true
  }

  if (input.ticket) {
    // Tickets: allow assigned / claimable pool (matches ticketInScope), not only primary book.
    return ticketInScope(scope, input.ticket)
  }

  if (input.propertyId) {
    if (input.property) {
      // Primary gate: landlord / agent linkage on the property row.
      if (canMutateProperty(scope, input.property, input.propertyId)) return true
      // L03: unit/property upserts may omit landlordId; scopeGate fills it from the building.
      if (landlordOwnListingWrite(scope, input)) return true
      // Field agents may also mutate ops rows on properties in their allowed set
      // (includes ticket-assignee extras) even when not the listing’s primary agent.
      if (
        isFieldAgent(role) &&
        propertyInScope(scope, input.propertyId) &&
        input.resource !== 'property' &&
        input.resource !== 'unit'
      ) {
        return true
      }
      // P0 r19: application|lead|viewing|viewing_slot — dealInScope before hard deny
      // (in-agency + book | assigned | Unassigned). Do not open via agency fieldOk.
      if (dealWriteAllowed(scope, input)) return true
      return false
    }
    if (dealWriteAllowed(scope, input)) return true
    return propertyInScope(scope, input.propertyId)
  }

  // Agency-level resources (agency, lookup, suite_alert, invoice, activity, …)
  if (input.agencyId) {
    if (landlordOwnListingWrite(scope, input)) return true
    if (!canSeeAgency(role, viewer.agencyId, viewer.agencySuspended, input.agencyId)) {
      return false
    }
    if (isAgencyWideRole(role)) return true
    const fieldOk =
      isFieldAgent(role) &&
      (input.resource === 'activity' ||
        input.resource === 'message' ||
        input.resource === 'thread' ||
        input.resource === 'notification' ||
        // P0-5 r15: FA create building→unit→property hits agency-level gate
        // (no propertyId yet). #44 routed to /api/persist; building was Forbidden.
        input.resource === 'building')
    return fieldOk
  }

  return isAgencyWideRole(role) && !viewer.agencySuspended
}
