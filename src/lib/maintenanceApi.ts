/**
 * Maintenance workflow API — mirrors POST/PATCH /api/v1/tickets
 * Warranty check → category vendor routing → emergency escalation → resolve + asset audit.
 */

import type { AssetCondition, InternalAsset } from '../data/infrastructure'
import type { AppUser, MaintenanceTicket } from '../types/domain'

export const EMERGENCY_ESCALATION_MS = 2 * 60 * 60 * 1000 // 2 hours

export type TicketCategoryKey =
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'APPLIANCE_FAILURE'
  | 'APPLIANCE_FAULT'
  | 'GENERAL'
  | string

export type ApiTicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'EMERGENCY'
export type ApiTicketStatus =
  | 'OPEN'
  | 'TRIAGED'
  | 'IN_PROGRESS'
  | 'AWAITING_PARTS'
  | 'RESOLVED'
  | 'COMPLETED'
  | 'CANCELLED'

export type VendorCategoryRoute = {
  id: string
  clientId: string
  categoryKey: string
  contractorUserId: string
  isActive: boolean
}

export type CreateTicketRequest = {
  unit_id: string
  internal_asset_id?: string | null
  category_key: TicketCategoryKey
  priority: ApiTicketPriority | MaintenanceTicket['priority']
  title: string
  description: string
}

export type PatchTicketRequest = {
  status: ApiTicketStatus | MaintenanceTicket['status']
  actual_cost?: number
  internal_asset_condition?: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'DAMAGED' | 'NEEDS_REPLACEMENT' | AssetCondition
  resolution_notes?: string
  contractor_id?: string | null
  photos?: number
}

export type TicketCompletionFields = {
  cost: number
  workNotes: string
  contractorId: string
  photos: number
  condition: AssetCondition
}

/** Required evidence before a ticket may move to Completed / Resolved */
export function validateTicketCompletion(
  ticket: Pick<MaintenanceTicket, 'internalAssetId'>,
  fields: TicketCompletionFields,
): string | null {
  const notes = fields.workNotes.trim()
  if (notes.length < 15) {
    return 'Describe the work performed (at least 15 characters).'
  }
  if (!Number.isFinite(fields.cost) || fields.cost < 0) {
    return 'Enter a valid actual cost (0 or more).'
  }
  if (!fields.contractorId) {
    return 'Assign the technician / contractor who completed the work.'
  }
  if (!Number.isFinite(fields.photos) || fields.photos < 1) {
    return 'Record at least 1 photo of the completed work.'
  }
  if (ticket.internalAssetId && !fields.condition) {
    return 'Update the asset condition after the work.'
  }
  return null
}

export type CreateTicketResult =
  | {
      status: 'TICKET_CREATED'
      ticket_id: string
      message: string
      httpStatus: 201
      ticket: MaintenanceTicket
      warrantyCovered: boolean
      emergencyQueued: boolean
    }
  | { status: 'ERROR'; error: string; httpStatus: 401 | 403 | 404 | 400 }

export type PatchTicketResult =
  | {
      status: 'WORKFLOW_UPDATED'
      message: string
      httpStatus: 200
      ticket: MaintenanceTicket
      assetUpdated: boolean
    }
  | { status: 'ERROR'; error: string; httpStatus: 403 | 404 | 400 }

const PRIORITY_TO_UI: Record<string, MaintenanceTicket['priority']> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
  EMERGENCY: 'Emergency',
  Low: 'Low',
  Medium: 'Medium',
  High: 'High',
  Urgent: 'Urgent',
  Emergency: 'Emergency',
}

const STATUS_TO_UI: Record<string, MaintenanceTicket['status']> = {
  OPEN: 'Requested',
  TRIAGED: 'Requested',
  IN_PROGRESS: 'In Progress',
  AWAITING_PARTS: 'Awaiting Parts',
  RESOLVED: 'Completed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  Requested: 'Requested',
  'In Progress': 'In Progress',
  'Awaiting Parts': 'Awaiting Parts',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
}

const STATUS_TO_API: Record<string, ApiTicketStatus> = {
  Requested: 'OPEN',
  'In Progress': 'IN_PROGRESS',
  'Awaiting Parts': 'AWAITING_PARTS',
  Completed: 'RESOLVED',
  Cancelled: 'CANCELLED',
  OPEN: 'OPEN',
  TRIAGED: 'TRIAGED',
  IN_PROGRESS: 'IN_PROGRESS',
  AWAITING_PARTS: 'AWAITING_PARTS',
  RESOLVED: 'RESOLVED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
}

const CONDITION_TO_UI: Record<string, AssetCondition> = {
  EXCELLENT: 'Excellent',
  GOOD: 'Good',
  FAIR: 'Fair',
  DAMAGED: 'Damaged',
  NEEDS_REPLACEMENT: 'Needs replacement',
  Excellent: 'Excellent',
  Good: 'Good',
  Fair: 'Fair',
  Damaged: 'Damaged',
  'Needs replacement': 'Needs replacement',
}

export function toUiPriority(p: string): MaintenanceTicket['priority'] {
  return PRIORITY_TO_UI[p] ?? 'Medium'
}

export function toUiStatus(s: string): MaintenanceTicket['status'] {
  return STATUS_TO_UI[s] ?? 'Requested'
}

export function toApiStatus(s: string): ApiTicketStatus {
  return STATUS_TO_API[s] ?? 'OPEN'
}

export function isWarrantyCovered(asset: InternalAsset | undefined, at = new Date()): boolean {
  if (!asset?.warrantyExpiresAt) return false
  return new Date(asset.warrantyExpiresAt).getTime() >= at.getTime()
}

export function resolvePreferredVendor(
  routes: VendorCategoryRoute[],
  clientId: string,
  categoryKey: string,
): string | null {
  const normalized = categoryKey === 'APPLIANCE_FAULT' ? 'APPLIANCE_FAILURE' : categoryKey
  const hit = routes.find(
    (r) =>
      r.isActive &&
      r.clientId === clientId &&
      (r.categoryKey === categoryKey || r.categoryKey === normalized),
  )
  return hit?.contractorUserId ?? null
}

export function canManageTickets(role: AppUser['role'] | string): boolean {
  return ['super_admin', 'client_admin', 'agent_admin', 'agent', 'ground_agent', 'SUPER_ADMIN', 'AGENCY_ADMIN', 'AGENT', 'AGENT_ADMIN', 'GROUND_AGENT'].includes(role)
}

export function needsEmergencyEscalation(
  ticket: Pick<MaintenanceTicket, 'priority' | 'status' | 'openedAt' | 'escalatedAt'>,
  now = new Date(),
): boolean {
  if (ticket.escalatedAt) return false
  if (ticket.priority !== 'Emergency' && ticket.priority !== 'Urgent') return false
  if (ticket.status !== 'Requested') return false
  const opened = new Date(ticket.openedAt.includes('T') ? ticket.openedAt : `${ticket.openedAt}T00:00:00`)
  // Prefer full ISO openedAtIso when present via description of workflow — use openedAt as date
  const openedMs = opened.getTime()
  if (Number.isNaN(openedMs)) return false
  return now.getTime() - openedMs >= EMERGENCY_ESCALATION_MS
}

/** For tickets with precise openedAtIso */
export function needsEmergencyEscalationPrecise(
  ticket: MaintenanceTicket,
  now = new Date(),
): boolean {
  if (ticket.escalatedAt) return false
  if (ticket.priority !== 'Emergency') return false
  if (ticket.status !== 'Requested') return false
  const opened = new Date(ticket.openedAtIso ?? ticket.openedAt)
  return now.getTime() - opened.getTime() >= EMERGENCY_ESCALATION_MS
}

export function mapAssetCondition(raw: string): AssetCondition {
  return CONDITION_TO_UI[raw] ?? 'Good'
}

export function buildTicketFromCreate(params: {
  id: string
  agencyId: string
  propertyId: string
  unitId: string
  request: CreateTicketRequest
  reportedBy: string
  reportedByUserId: string | null
  assignedAgentId: string | null
  contractorId: string | null
  warrantyCovered: boolean
  assetLabel: string
}): MaintenanceTicket {
  const priority = toUiPriority(String(params.request.priority))
  return {
    id: params.id,
    agencyId: params.agencyId,
    propertyId: params.propertyId,
    unitId: params.unitId,
    internalAssetId: params.request.internal_asset_id ?? null,
    categoryKey: params.request.category_key,
    assetLabel: params.assetLabel,
    reportedBy: params.reportedBy,
    reportedByUserId: params.reportedByUserId,
    title: params.request.title,
    priority,
    status: 'Requested',
    contractorId: params.contractorId,
    assignedAgentId: params.assignedAgentId,
    cost: 0,
    photos: 0,
    openedAt: new Date().toISOString().slice(0, 10),
    openedAtIso: new Date().toISOString(),
    description: params.request.description,
    warrantyCovered: params.warrantyCovered,
    escalatedAt: null,
  }
}

export function applyTicketPatch(
  ticket: MaintenanceTicket,
  patch: PatchTicketRequest,
): { ticket: MaintenanceTicket; resolved: boolean; condition?: AssetCondition } {
  const status = toUiStatus(String(patch.status))
  const resolved = status === 'Completed' || String(patch.status).toUpperCase() === 'RESOLVED'
  const condition = patch.internal_asset_condition
    ? mapAssetCondition(String(patch.internal_asset_condition))
    : undefined
  const next: MaintenanceTicket = {
    ...ticket,
    status,
    cost: patch.actual_cost != null ? patch.actual_cost : ticket.cost,
    contractorId:
      patch.contractor_id !== undefined ? patch.contractor_id : ticket.contractorId,
    photos: patch.photos != null ? patch.photos : ticket.photos,
    resolutionNotes:
      patch.resolution_notes != null ? patch.resolution_notes.trim() : ticket.resolutionNotes,
    resolvedAt: resolved ? new Date().toISOString() : ticket.resolvedAt,
  }
  return { ticket: next, resolved, condition }
}

export const SEED_VENDOR_ROUTES: VendorCategoryRoute[] = [
  {
    id: 'vr-h-appliance',
    clientId: 'ag-horizon',
    categoryKey: 'APPLIANCE_FAILURE',
    contractorUserId: 'u-aqua',
    isActive: true,
  },
  {
    id: 'vr-h-plumbing',
    clientId: 'ag-horizon',
    categoryKey: 'PLUMBING',
    contractorUserId: 'u-aqua',
    isActive: true,
  },
  {
    id: 'vr-h-electrical',
    clientId: 'ag-horizon',
    categoryKey: 'ELECTRICAL',
    contractorUserId: 'u-aqua',
    isActive: true,
  },
  {
    id: 'vr-c-plumbing',
    clientId: 'ag-cape',
    categoryKey: 'PLUMBING',
    contractorUserId: 'u-aqua',
    isActive: true,
  },
]
