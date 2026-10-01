/**
 * Predictive HATEOAS action builders — role-filtered next buttons for each resource state.
 */

import type { Application, MaintenanceTicket } from '../../types/domain'
import type { HateoasAction } from './contracts'
import { filterActionsForActor, type ActorContext } from './contracts'
import {
  getAvailableTransitions,
  resolveWorkflowStatus,
  type WorkflowTransition,
} from '../applicationWorkflow'

const STAGE_TO_API: Record<string, string> = {
  Started: 'DRAFT',
  'Documents Pending': 'SUBMITTED',
  'Documents Submitted': 'SUBMITTED',
  'Viewing Booked': 'UNDER_REVIEW',
  'Under Review': 'UNDER_REVIEW',
  'Credit Check': 'CREDIT_CHECK',
  Approved: 'APPROVED',
  'Awaiting Payment': 'APPROVED',
  'Deposit Paid': 'APPROVED',
  'Lease Signed': 'LEASED',
  'Move-In Scheduled': 'LEASED',
  'Keys Handed Over': 'LEASED',
  'Active Tenancy': 'LEASED',
  Rejected: 'REJECTED',
  Withdrawn: 'WITHDRAWN',
}

export function apiStatusFromStage(stage: string): string {
  // P0-3: guest-submitted apps sit at 'Application submitted' — a real
  // SUBMITTED status, not an ad-hoc uppercase fallback.
  if (stage === 'Application submitted') return 'SUBMITTED'
  return STAGE_TO_API[stage] ?? String(stage).toUpperCase().replace(/\s+/g, '_')
}

function transitionToAction(transition: WorkflowTransition, applicationId: string): HateoasAction {
  return {
    key: transition.actionKey,
    label: transition.label,
    method: 'PATCH',
    href: `/api/v1/applications/${applicationId}/workflow`,
    requires: transition.requires ?? [],
    tone: transition.tone ?? 'secondary',
    confirm: transition.confirm,
    payload_hint: {
      workflowStatus: transition.to,
      effect: transition.effect,
    },
  }
}

/** Next-actions from configurable workflow templates (rental / purchase). */
export function buildApplicationActions(params: {
  application: Application
  actor: ActorContext
  /** P0-approve (R10): lease truth for the RECOVER_APPROVE gate — a lease-less
   *  application stuck past approval must surface 'Approve & create lease'.
   *  Undefined keeps the legacy optimistic default (lease assumed to exist). */
  leaseExists?: boolean
}): HateoasAction[] {
  const permissions = params.actor.permissions ?? []
  const transitions = getAvailableTransitions(
    params.application,
    permissions,
    params.leaseExists ?? true,
  )
  const raw = transitions.map((t) => transitionToAction(t, params.application.id))
  return filterActionsForActor(raw, params.actor)
}

/** @deprecated use buildApplicationActions({ application, actor }) */
export function buildApplicationActionsLegacy(params: {
  applicationId: string
  stage: string
  creditCheck: string
  creditConsent: boolean
  actor: ActorContext
  application?: Application
}): HateoasAction[] {
  if (params.application) {
    return buildApplicationActions({ application: params.application, actor: params.actor })
  }
  return buildApplicationActions({
    application: {
      id: params.applicationId,
      stage: params.stage,
      type: 'Rental',
      creditCheck: params.creditCheck as Application['creditCheck'],
      creditConsent: params.creditConsent,
      documents: [],
    } as Application,
    actor: params.actor,
  })
}

export function workflowStatusFromApplication(app: Application): string {
  return resolveWorkflowStatus(app)
}

const UI_STATUS_TO_KANBAN: Record<string, string> = {
  Requested: 'OPEN',
  'In Progress': 'IN_PROGRESS',
  'Awaiting Parts': 'IN_PROGRESS',
  Completed: 'RESOLVED',
  Cancelled: 'RESOLVED',
}

export function kanbanColumnForTicket(status: MaintenanceTicket['status'] | string): 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' {
  const mapped = UI_STATUS_TO_KANBAN[status] ?? String(status).toUpperCase()
  if (mapped === 'OPEN' || mapped === 'TRIAGED') return 'OPEN'
  if (mapped === 'RESOLVED' || mapped === 'COMPLETED' || mapped === 'CANCELLED') return 'RESOLVED'
  return 'IN_PROGRESS'
}

export function buildTicketActions(params: {
  ticketId: string
  status: MaintenanceTicket['status'] | string
  actor: ActorContext
}): HateoasAction[] {
  const base = `/api/v1/tickets/${params.ticketId}`
  const raw: HateoasAction[] = [
    {
      key: 'VIEW_TICKET',
      label: 'Open ticket',
      method: 'GET',
      href: base,
      requires: ['maintenance.view'],
      tone: 'ghost',
    },
  ]

  const column = kanbanColumnForTicket(params.status)
  if (column === 'OPEN') {
    raw.push({
      key: 'START_WORK',
      label: 'Start work',
      method: 'PATCH',
      href: base,
      requires: ['maintenance.manage'],
      tone: 'primary',
      payload_hint: { status: 'IN_PROGRESS' },
    })
  }
  if (column !== 'RESOLVED') {
    raw.push({
      key: 'RESOLVE_TICKET',
      label: 'Resolve + sync asset',
      method: 'PATCH',
      href: base,
      requires: ['maintenance.manage'],
      tone: 'secondary',
      payload_hint: { status: 'RESOLVED', actual_cost: 'number', internal_asset_condition: 'string' },
    })
    raw.push({
      key: 'ASSIGN_CONTRACTOR',
      label: 'Assign contractor',
      method: 'PATCH',
      href: base,
      requires: ['maintenance.manage'],
      tone: 'ghost',
      payload_hint: { contractor_id: 'uuid' },
    })
  }

  return filterActionsForActor(raw, params.actor)
}

export function buildUnitCardActions(params: {
  unitId: string
  listingType: string
  statusKey: string
  actor?: ActorContext | null
}): HateoasAction[] {
  const base = `/api/v1/units/${params.unitId}`
  const raw: HateoasAction[] = [
    {
      key: 'VIEW_UNIT',
      label: 'View details',
      method: 'GET',
      href: base,
      requires: [],
      tone: 'ghost',
    },
  ]

  const listed = params.listingType !== 'not_listed' && params.listingType !== 'NOT_LISTED'
  const occupied = params.statusKey === 'OCCUPIED'
  if (listed && !occupied) {
    raw.push({
      key: 'APPLY_NOW',
      label: 'Apply now',
      method: 'POST',
      href: '/api/v1/applications',
      requires: [],
      tone: 'primary',
      payload_hint: { unit_id: params.unitId },
    })
    raw.push({
      key: 'BOOK_VIEWING',
      label: 'Book viewing',
      method: 'POST',
      href: '/api/v1/bookings',
      requires: [],
      tone: 'secondary',
      payload_hint: { unit_id: params.unitId },
    })
  }

  if (!params.actor) return raw
  return filterActionsForActor(raw, params.actor)
}
