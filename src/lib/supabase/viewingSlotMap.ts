import { canonicalListingId } from '../listingIds'
import type { ViewingSlot } from '../../types/domain'

export type ViewingSlotDbRow = {
  id: string
  client_id: string
  unit_id: string
  agent_id?: string | null
  slot_date: string
  slot_time: string
  capacity: number | string
  booked_count: number | string
  status: string
  title?: string | null
  notes?: string | null
  duration_minutes?: number | string | null
}

export function mapViewingSlotStatus(status: string): ViewingSlot['status'] {
  const map: Record<string, ViewingSlot['status']> = {
    OPEN: 'Open',
    FULL: 'Full',
    CANCELLED: 'Cancelled',
  }
  return map[status] ?? 'Open'
}

function dateOnly(v: string | null | undefined): string {
  if (!v) return ''
  return v.slice(0, 10)
}

export type MapViewingSlotContext = {
  index: number
  mapFeId: (entityType: string, uuid: string, fallback: string) => string
  mapAgency: (clientId: string | null | undefined) => string | null
  mapPropertyFromUnit: (unitId: string | null | undefined) => string | null
  mapUser: (userId: string | null | undefined) => string | null
}

export function mapViewingSlotRow(row: ViewingSlotDbRow, ctx: MapViewingSlotContext): ViewingSlot {
  const unitUuid = String(row.unit_id)
  const propertyFe = ctx.mapPropertyFromUnit(unitUuid) ?? unitUuid
  return {
    id: ctx.mapFeId('viewing_slot', String(row.id), `VS-pg-${ctx.index + 1}`),
    agencyId: ctx.mapAgency(row.client_id)!,
    propertyId: canonicalListingId(propertyFe),
    agentId: ctx.mapUser(row.agent_id) ?? '',
    date: dateOnly(row.slot_date),
    time: String(row.slot_time).slice(0, 5),
    capacity: Number(row.capacity),
    booked: Number(row.booked_count),
    status: mapViewingSlotStatus(row.status),
    title: row.title ?? undefined,
    notes: row.notes ?? undefined,
    durationMinutes: row.duration_minutes != null ? Number(row.duration_minutes) : undefined,
  }
}
