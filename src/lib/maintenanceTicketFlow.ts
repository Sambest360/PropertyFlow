import type { PropertyAsset } from '../types/domain'
import type { InternalAsset } from '../data/infrastructure'
import type { CreateTicketInput } from '../components/maintenance/MaintenanceTicketForm'
import { TICKET_NOT_SAVED_MESSAGE } from './maintenanceApi'

/** Portal roles file tickets on the tenant priority list (no Urgent). */
const PORTAL_ROLES = new Set(['tenant', 'landlord', 'contractor'])

/** Request priority for a ticket created from the staff form. */
export function requestPriorityFor(
  priority: CreateTicketInput['priority'],
  actorRole: string | undefined,
): 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'EMERGENCY' {
  // Urgent is a staff triage level; a portal user's Urgent is an emergency
  // (the server only takes Low / Medium / High / Emergency from them).
  if (priority === 'Urgent' && actorRole && PORTAL_ROLES.has(actorRole)) return 'EMERGENCY'
  return priority.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'EMERGENCY'
}

type CreateDeps = {
  properties: PropertyAsset[]
  internalAssets: InternalAsset[]
  canMutate: (propertyId: string) => boolean
  createMaintenanceTicket: (args: {
    actorUserId: string
    propertyId: string
    tenancyId?: string | null
    request: {
      unit_id: string
      internal_asset_id: string | null
      category_key: string
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'EMERGENCY'
      title: string
      description: string
    }
  }) => { status: string; ticket_id?: string; error?: string; saved?: Promise<boolean> }
  updateMaintenanceTicketDetails: (
    id: string,
    patch: Record<string, unknown>,
  ) => void
  assignContractorToTicket: (args: {
    ticketId: string
    contractorUserId: string
    actorUserId: string
  }) => boolean
  actorUserId: string
  actorRole?: string
}

export async function createMaintenanceFromInput(
  input: CreateTicketInput,
  deps: CreateDeps,
): Promise<{ ok: true; ticketId: string } | { ok: false; error: string }> {
  const prop = deps.properties.find((p) => p.id === input.propertyId)
  if (!prop?.unitId) {
    return { ok: false, error: 'Property has no linked unit — link infrastructure on the property first.' }
  }
  if (!deps.canMutate(input.propertyId)) {
    return { ok: false, error: 'Property is outside your assigned book.' }
  }

  const result = deps.createMaintenanceTicket({
    actorUserId: deps.actorUserId,
    propertyId: input.propertyId,
    ...(input.tenancyId ? { tenancyId: input.tenancyId } : {}),
    request: {
      unit_id: prop.unitId,
      internal_asset_id: input.assetId,
      category_key: input.categoryKey,
      priority: requestPriorityFor(input.priority, deps.actorRole),
      title: input.title,
      description: input.description,
    },
  })

  if (result.status !== 'TICKET_CREATED' || !result.ticket_id) {
    return { ok: false, error: 'error' in result ? result.error : 'Could not create maintenance.' }
  }

  const ticketId = result.ticket_id
  // Only report success once the server saved it (a refused ticket is
  // removed from the store by createMaintenanceTicket).
  if (result.saved && !(await result.saved)) {
    return { ok: false, error: TICKET_NOT_SAVED_MESSAGE }
  }
  const selectedAsset = input.assetId
    ? deps.internalAssets.find((a) => a.id === input.assetId)
    : undefined

  deps.updateMaintenanceTicketDetails(ticketId, {
    locationDetail: input.locationDetail,
    accessNotes: input.accessNotes,
    preferredSchedule: input.preferredSchedule,
    issueTags: input.issueTags,
    photoUrls: input.photoUrls,
    photos: input.photoUrls?.length ?? 0,
    estimatedCost: input.estimatedCost ?? null,
    assetLabel: selectedAsset?.itemName,
  })

  if (input.contractorId) {
    const assigned = deps.assignContractorToTicket({
      ticketId,
      contractorUserId: input.contractorId,
      actorUserId: deps.actorUserId,
    })
    if (!assigned) {
      return {
        ok: false,
        error: 'Maintenance was created, but the contractor is not on the approved roster.',
      }
    }
  }

  return { ok: true, ticketId }
}
