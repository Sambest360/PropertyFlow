import type { InfraRoom, InternalAsset, RoomKind, Unit } from '../data/infrastructure'
import type { PropertyAsset, Room } from '../types/domain'
import type { IdMapCache } from './idMap'
import { feFromCache } from './idMap.js'

export type DbRoomRow = {
  id: string
  unit_id: string
  client_id: string
  name: string
  room_kind: string
  beds: number
  baths: string | number | null
  area_sqm?: string | number | null
  /** numeric columns: pg returns them as strings ('10.00') */
  layout_x?: number | string | null
  layout_y?: number | string | null
  layout_w?: number | string | null
  layout_h?: number | string | null
}

export type DbInternalAssetRow = {
  id: string
  unit_id: string
  client_id: string
  room_id: string | null
  item_name: string
  serial_number?: string | null
  asset_type_key: string
  condition_status: string
  brand?: string | null
  purchase_value?: string | number | null
  warranty_expires_at?: Date | string | null
  notes?: string | null
  metadata?: { model?: unknown; purchaseDate?: unknown } | null
}

function defaultLayout(index: number): InfraRoom['layout'] {
  return {
    x: 5 + (index % 2) * 48,
    y: 5 + Math.floor(index / 2) * 32,
    w: 42,
    h: 28,
  }
}

function parseRoomKind(kind: string): RoomKind {
  const k = kind.toLowerCase()
  if (
    k === 'bedroom' ||
    k === 'bathroom' ||
    k === 'kitchen' ||
    k === 'living' ||
    k === 'dining' ||
    k === 'study' ||
    k === 'garage'
  ) {
    return k
  }
  return 'other'
}

/** DB stores EXCELLENT / NEEDS_REPLACEMENT; every uppercase value used to read back as Good. */
function titleCaseStatus(s: string): InternalAsset['condition'] {
  const t = s.trim().toLowerCase().replace(/_/g, ' ')
  if (t === 'excellent') return 'Excellent'
  if (t === 'fair') return 'Fair'
  if (t === 'damaged') return 'Damaged'
  if (t === 'needs replacement') return 'Needs replacement'
  return 'Good'
}

function isoDate(v: Date | string | null | undefined): string | undefined {
  if (!v) return undefined
  const iso = typeof v === 'string' ? v : v.toISOString()
  return iso.slice(0, 10)
}

function resolveEntityFeId(
  opts: {
    cache?: IdMapCache
    resolveFeId?: (entityType: string, backendId: string, fallback: string) => string
  },
  entityType: string,
  backendId: string,
  fallback: string,
): string {
  if (opts.resolveFeId) return opts.resolveFeId(entityType, backendId, fallback)
  if (opts.cache) return feFromCache(opts.cache, entityType, backendId, fallback) ?? fallback
  return fallback
}

export function mapDbRoomRowToInfraRoom(
  row: DbRoomRow,
  opts: {
    cache?: IdMapCache
    resolveFeId?: (entityType: string, backendId: string, fallback: string) => string
    unitFeId: string
    clientFeId: string
    layoutIndex: number
  },
): InfraRoom {
  const hasLayout =
    row.layout_x != null && row.layout_y != null && row.layout_w != null && row.layout_h != null
  return {
    id: resolveEntityFeId(opts, 'room', row.id, row.id),
    clientId: opts.clientFeId,
    unitId: opts.unitFeId,
    name: row.name,
    kind: parseRoomKind(row.room_kind),
    beds: row.beds ?? 0,
    baths: row.baths != null ? Number(row.baths) : 0,
    areaSqm: row.area_sqm != null ? Number(row.area_sqm) : undefined,
    layout: hasLayout
      ? {
          x: Number(row.layout_x),
          y: Number(row.layout_y),
          w: Number(row.layout_w),
          h: Number(row.layout_h),
        }
      : defaultLayout(opts.layoutIndex),
  }
}

export function mapDbRoomsToInfraRooms(
  rows: DbRoomRow[],
  opts: {
    cache?: IdMapCache
    resolveFeId?: (entityType: string, backendId: string, fallback: string) => string
    unitUuidToFeId: Map<string, string>
    mapAgencyFe: (uuid: string | null | undefined) => string | null | undefined
  },
): InfraRoom[] {
  const byUnit = new Map<string, number>()
  const out: InfraRoom[] = []
  for (const row of rows) {
    const unitFeId = opts.unitUuidToFeId.get(row.unit_id)
    if (!unitFeId) continue
    const idx = byUnit.get(row.unit_id) ?? 0
    byUnit.set(row.unit_id, idx + 1)
    const clientFeId = opts.mapAgencyFe(row.client_id) ?? ''
    out.push(
      mapDbRoomRowToInfraRoom(row, {
        cache: opts.cache,
        resolveFeId: opts.resolveFeId,
        unitFeId,
        clientFeId,
        layoutIndex: idx,
      }),
    )
  }
  return out
}

export function mapDbAssetsToInternalAssets(
  rows: DbInternalAssetRow[],
  opts: {
    cache?: IdMapCache
    resolveFeId?: (entityType: string, backendId: string, fallback: string) => string
    unitUuidToFeId: Map<string, string>
    mapAgencyFe: (uuid: string | null | undefined) => string | null | undefined
    roomUuidToFeId: Map<string, string>
  },
): InternalAsset[] {
  return rows
    .map((a) => {
      const unitFeId = opts.unitUuidToFeId.get(a.unit_id)
      if (!unitFeId) return null
      const clientFeId = opts.mapAgencyFe(a.client_id) ?? ''
      return {
        // Writes register the id map under 'asset' (writes.upsertAsset).
        id: resolveEntityFeId(opts, 'asset', a.id, a.id),
        clientId: clientFeId,
        unitId: unitFeId,
        roomId: a.room_id ? opts.roomUuidToFeId.get(a.room_id) ?? null : null,
        itemName: a.item_name,
        serialNumber: a.serial_number ?? undefined,
        assetTypeKey: a.asset_type_key,
        condition: titleCaseStatus(a.condition_status),
        brand: a.brand ?? undefined,
        model: typeof a.metadata?.model === 'string' ? a.metadata.model : undefined,
        purchaseValue: a.purchase_value != null ? Number(a.purchase_value) : undefined,
        purchaseDate: typeof a.metadata?.purchaseDate === 'string' ? a.metadata.purchaseDate : undefined,
        warrantyExpiresAt: isoDate(a.warranty_expires_at),
        notes: a.notes ?? undefined,
      }
    })
    .filter(Boolean) as InternalAsset[]
}

export function propertyRoomsToInfraRooms(
  property: PropertyAsset,
  unit: Unit | undefined,
  startIndex = 0,
): InfraRoom[] {
  if (!unit || !property.rooms?.length) return []
  const clientId = unit.clientId || property.agencyId
  return property.rooms.map((r, i) => propertyRoomToInfraRoom(r, unit.id, clientId, startIndex + i))
}

export function roomsToInfraRooms(rooms: Room[], unitId: string, clientId: string): InfraRoom[] {
  return rooms.map((r, i) => propertyRoomToInfraRoom(r, unitId, clientId, i))
}

function propertyRoomToInfraRoom(
  r: Room,
  unitId: string,
  clientId: string,
  layoutIndex: number,
): InfraRoom {
  const layout = r.layout ?? defaultLayout(layoutIndex)
  return {
    id: r.id,
    clientId,
    unitId,
    name: r.name,
    kind: (r.kind as RoomKind) ?? 'other',
    beds: r.beds,
    baths: r.baths,
    areaSqm: r.area,
    layout: {
      x: layout.x,
      y: layout.y,
      w: layout.w,
      h: layout.h,
    },
  }
}

/** Floor plan source: persisted infra rows, else property.rooms snapshot on the listing. */
export function resolveInfraRoomsForUnit(
  property: PropertyAsset | undefined,
  unit: Unit | undefined,
  infraRooms: InfraRoom[],
): InfraRoom[] {
  if (!unit) return []
  const fromInfra = infraRooms.filter((r) => r.unitId === unit.id)
  if (fromInfra.length) return fromInfra
  if (!property || property.unitId !== unit.id) return []
  return propertyRoomsToInfraRooms(property, unit)
}
