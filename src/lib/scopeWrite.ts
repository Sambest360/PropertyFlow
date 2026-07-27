/**
 * Shared write-gate rules for client + server.
 * Property-locked roles must have the entity’s property in their book;
 * agency-wide roles may mutate within their agency (platform for super_admin).
 */

import { canSeeAgency, type PropertyAccessSubject } from './agencyScope'
import { isFieldAgent } from './permissions'
import {
  canMutateProperty,
  isAgencyWideRole,
  propertyInScope,
  ticketInScope,
  type PropertyScope,
} from './scope'
import type { Role } from '../types/domain'

export type WriteGateInput = {
  resource: string
  /** Resolved frontend property id, when the entity is property-linked. */
  propertyId: string | null
  /** Property row used for landlord/agent mutate checks. */
  property: PropertyAccessSubject | null
  agencyId: string | null
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

  if (input.ticket) {
    // Tickets: allow assigned / claimable pool (matches ticketInScope), not only primary book.
    return ticketInScope(scope, input.ticket)
  }

  if (input.propertyId) {
    if (input.property) {
      // Primary gate: landlord / agent linkage on the property row.
      if (canMutateProperty(scope, input.property, input.propertyId)) return true
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
      return false
    }
    return propertyInScope(scope, input.propertyId)
  }

  // Agency-level resources (agency, lookup, suite_alert, invoice, activity, …)
  if (input.agencyId) {
    if (!canSeeAgency(role, viewer.agencyId, viewer.agencySuspended, input.agencyId)) {
      return false
    }
    if (isAgencyWideRole(role)) return true
    const fieldOk =
      isFieldAgent(role) &&
      (input.resource === 'activity' ||
        input.resource === 'message' ||
        input.resource === 'thread' ||
        input.resource === 'notification')
    return fieldOk
  }

  return isAgencyWideRole(role) && !viewer.agencySuspended
}
