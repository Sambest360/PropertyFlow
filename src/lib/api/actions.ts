/**
 * Predictive HATEOAS action builders — role-filtered next buttons for each resource state.
 */

import type { ApplicationStage, MaintenanceTicket } from '../../types/domain'
import type { HateoasAction } from './contracts'
import { filterActionsForActor, type ActorContext } from './contracts'

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

export function apiStatusFromStage(stage: ApplicationStage | string): string {
  return STAGE_TO_API[stage] ?? String(stage).toUpperCase().replace(/\s+/g, '_')
}

/** Next-actions for an application given its stage + credit state. */
export function buildApplicationActions(params: {
  applicationId: string
  stage: ApplicationStage | string
  creditCheck: string
  creditConsent: boolean
  actor: ActorContext
}): HateoasAction[] {
  const id = params.applicationId
  const base = `/api/v1/applications/${id}`
  const stage = params.stage
  const raw: HateoasAction[] = []

  if (['Started', 'Documents Pending'].includes(stage)) {
    raw.push({
      key: 'UPLOAD_DOCS',
      label: 'Upload documents',
      method: 'PATCH',
      href: `${base}/documents`,
      requires: [],
      tone: 'secondary',
    })
  }

  if (['Documents Submitted', 'Viewing Booked', 'Under Review'].includes(stage)) {
    raw.push({
      key: 'START_CREDIT_CHECK',
      label: 'Start credit check',
      method: 'PATCH',
      href: `${base}/status`,
      requires: ['applications.review'],
      tone: 'secondary',
      payload_hint: { status: 'CREDIT_CHECK' },
    })
  }

  if (
    ['Credit Check', 'Under Review', 'Documents Submitted'].includes(stage) ||
    (stage === 'Credit Check' && params.creditCheck !== 'Failed')
  ) {
    raw.push({
      key: 'APPROVE_CREDIT',
      label: 'Approve & request payment',
      method: 'PATCH',
      href: `${base}/status`,
      requires: ['applications.review'],
      tone: 'primary',
      payload_hint: { status: 'APPROVED' },
    })
    raw.push({
      key: 'DECLINE_INCOME',
      label: 'Decline (income / credit)',
      method: 'PATCH',
      href: `${base}/status`,
      requires: ['applications.review'],
      tone: 'danger',
      confirm: 'Reject this application? The applicant will be notified.',
      payload_hint: { status: 'REJECTED', reason: 'INCOME_OR_CREDIT' },
    })
  }

  if (stage === 'Deposit Paid') {
    raw.push({
      key: 'MARK_LEASE_SIGNED',
      label: 'Mark lease signed',
      method: 'PATCH',
      href: `${base}/status`,
      requires: ['applications.review'],
      tone: 'secondary',
      payload_hint: { status: 'LEASE_SIGNED' },
    })
  }

  if (['Lease Signed', 'Deposit Paid'].includes(stage)) {
    raw.push({
      key: 'SCHEDULE_MOVE_IN',
      label: 'Schedule move-in / keys',
      method: 'POST',
      href: `${base}/move-in`,
      requires: ['applications.review'],
      tone: 'secondary',
    })
  }

  if (stage === 'Move-In Scheduled') {
    raw.push({
      key: 'COMPLETE_KEY_HANDOVER',
      label: 'Complete key handover',
      method: 'POST',
      href: `${base}/key-handover`,
      requires: ['applications.review'],
      tone: 'primary',
    })
  }

  if (!['Rejected', 'Withdrawn', 'Active Tenancy', 'Keys Handed Over'].includes(stage)) {
    raw.push({
      key: 'REJECT_APPLICATION',
      label: 'Reject',
      method: 'PATCH',
      href: `${base}/status`,
      requires: ['applications.review'],
      tone: 'danger',
      confirm: 'Reject this application?',
      payload_hint: { status: 'REJECTED' },
    })
  }

  if (['Awaiting Payment'].includes(stage)) {
    raw.push({
      key: 'OPEN_CHECKOUT',
      label: 'Pay deposit',
      method: 'GET',
      href: `${base}/checkout`,
      requires: ['portal.tenant'],
      tone: 'primary',
    })
  }

  return filterActionsForActor(raw, params.actor)
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
