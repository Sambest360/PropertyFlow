/**
 * Optional maintenance handoff hook (Mode A).
 * When an inspection item is flagged needsMaintenance / damaged, draft a ticket shape.
 * Does not auto-create tickets — caller decides.
 */

import type { CreateTicketRequest } from '../maintenanceApi'
import type { MaintenanceHandoffDraft, PropertyConditionInspection } from './types'

const DAMAGED_LIKE = new Set(['damaged', 'poor', 'missing'])

export function collectMaintenanceHandoffDrafts(
  inspection: PropertyConditionInspection,
): MaintenanceHandoffDraft[] {
  const drafts: MaintenanceHandoffDraft[] = []
  for (const room of inspection.rooms) {
    for (const item of room.items) {
      const flagged =
        item.needsMaintenance || DAMAGED_LIKE.has(item.condition)
      if (!flagged) continue
      drafts.push({
        category_key: 'GENERAL',
        priority: item.condition === 'damaged' || item.condition === 'missing' ? 'HIGH' : 'MEDIUM',
        title: `PCR follow-up: ${item.label}`,
        description: [
          `From ${inspection.kind} PCR ${inspection.id} (${room.name}).`,
          `Condition: ${item.condition}.`,
          item.notes ? `Notes: ${item.notes}` : null,
          'Mode A soft PCR handoff — not auto-dispatched; staff review before opening a ticket.',
        ]
          .filter(Boolean)
          .join(' '),
        roomName: room.name,
        itemLabel: item.label,
        inspectionId: inspection.id,
        itemId: item.id,
      })
    }
  }
  return drafts
}

/** Map a draft to maintenanceApi CreateTicketRequest (unit_id supplied by caller). */
export function handoffDraftToCreateTicketRequest(
  draft: MaintenanceHandoffDraft,
  unitId: string,
): CreateTicketRequest {
  return {
    unit_id: unitId,
    category_key: draft.category_key,
    priority: draft.priority,
    title: draft.title,
    description: draft.description,
  }
}
