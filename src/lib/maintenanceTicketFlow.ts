import type { PropertyAsset } from '../types/domain'
import type { InternalAsset } from '../data/infrastructure'
import type { CreateTicketInput } from '../components/maintenance/MaintenanceTicketForm'

type CreateDeps = {
  properties: PropertyAsset[]
  internalAssets: InternalAsset[]
  canMutate: (propertyId: string) => boolean
  createMaintenanceTicket: (args: {
    actorUserId: string
    propertyId: string
    ticketId?: string
    request: {
      unit_id: string
      internal_asset_id: string | null
      category_key: string
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'EMERGENCY'
      title: string
      description: string
    }
  }) => { status: string; ticket_id?: string; error?: string }
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
}

export function createMaintenanceFromInput(
  input: CreateTicketInput,
  deps: CreateDeps,
): { ok: true; ticketId: string } | { ok: false; error: string } {
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
    ticketId: input.ticketId,
    request: {
      unit_id: prop.unitId,
      internal_asset_id: input.assetId,
      category_key: input.categoryKey,
      priority:
        input.priority === 'Emergency'
          ? 'EMERGENCY'
          : (input.priority.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'),
      title: input.title,
      description: input.description,
    },
  })

  if (result.status !== 'TICKET_CREATED' || !result.ticket_id) {
    return { ok: false, error: 'error' in result ? result.error : 'Could not create maintenance.' }
  }

  const ticketId = result.ticket_id
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
