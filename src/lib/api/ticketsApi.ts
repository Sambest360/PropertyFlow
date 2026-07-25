/**
 * GET /api/v1/tickets — high-performance maintenance kanban / grid feed.
 * Embeds internal asset health so PMs know repair vs capital replacement instantly.
 */

import type { AssetCondition, InternalAsset } from '../../data/infrastructure'
import type { MaintenanceTicket } from '../../types/domain'
import { buildTicketActions, kanbanColumnForTicket } from './actions'
import type {
  ActorContext,
  CursorFeedResponse,
  DisplayMetadata,
  HateoasAction,
} from './contracts'
import { buildDisplayMetadata } from './displayMetadata'
import { isWarrantyCovered } from '../maintenanceApi'

export type TicketKanbanColumn = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'

export type AssetHealthMetric = {
  asset_id: string | null
  item_name: string
  brand: string | null
  condition: AssetCondition | string | null
  purchase_value: number | null
  warranty_expires_at: string | null
  warranty_covered: boolean
  /** Heuristic recommendation for the PM card */
  disposition: 'REPAIR' | 'REPLACE' | 'MONITOR' | 'UNKNOWN'
  disposition_label: string
  health_score: number
  last_inspected_at: string | null
}

export type TicketCardPayload = {
  id: string
  client_id: string
  unit_id: string | null
  property_id: string
  title: string
  description: string
  priority: string
  status: string
  kanban_column: TicketKanbanColumn
  category_key: string | null
  contractor_id: string | null
  assigned_agent_id: string | null
  cost: number
  photos: number
  warranty_covered: boolean
  escalated_at: string | null
  opened_at: string
  asset_health: AssetHealthMetric
  display_metadata: DisplayMetadata
  actions: HateoasAction[]
}

export type TicketsFeedFilters = {
  client_id?: string
  column?: TicketKanbanColumn | 'ALL'
  priority?: string[]
  category_key?: string
  contractor_id?: string
  unit_id?: string
  disposition?: Array<AssetHealthMetric['disposition']>
  cursor?: string | null
  limit?: number
  /** When true, return grouped kanban buckets instead of a flat cursor page */
  group_by_column?: boolean
}

export type TicketsKanbanResponse = {
  columns: Record<TicketKanbanColumn, TicketCardPayload[]>
  counts: Record<TicketKanbanColumn, number>
  meta: {
    endpoint: string
    total: number
    repair_candidates: number
    replace_candidates: number
  }
}

const DEFAULT_LIMIT = 40

export function scoreAssetHealth(asset: InternalAsset | undefined, warrantyCovered: boolean): AssetHealthMetric {
  if (!asset) {
    return {
      asset_id: null,
      item_name: 'General unit issue',
      brand: null,
      condition: null,
      purchase_value: null,
      warranty_expires_at: null,
      warranty_covered: warrantyCovered,
      disposition: 'UNKNOWN',
      disposition_label: 'Inspect on site',
      health_score: 50,
      last_inspected_at: null,
    }
  }

  const condition = asset.condition
  let health = 80
  let disposition: AssetHealthMetric['disposition'] = 'MONITOR'
  let dispositionLabel = 'Monitor & maintain'

  if (condition === 'Excellent') {
    health = 95
    disposition = 'MONITOR'
    dispositionLabel = 'Healthy — routine check'
  } else if (condition === 'Good') {
    health = 80
    disposition = warrantyCovered ? 'REPAIR' : 'MONITOR'
    dispositionLabel = warrantyCovered ? 'Warranty repair preferred' : 'Likely simple repair'
  } else if (condition === 'Fair') {
    health = 55
    disposition = 'REPAIR'
    dispositionLabel = 'Schedule repair before failure'
  } else if (condition === 'Damaged') {
    health = 30
    disposition = 'REPAIR'
    dispositionLabel = 'Repair now — risk of downtime'
  } else if (condition === 'Needs replacement') {
    health = 10
    disposition = 'REPLACE'
    dispositionLabel = 'Full commercial capital replacement'
  }

  // High-value appliances past mid-life with damage → escalate to REPLACE
  const value = asset.purchaseValue ?? 0
  if (condition === 'Damaged' && value >= 15_000 && !warrantyCovered) {
    disposition = 'REPLACE'
    dispositionLabel = 'Capex replacement likely (high value + damage)'
    health = Math.min(health, 20)
  }

  if (warrantyCovered && disposition === 'REPLACE') {
    disposition = 'REPAIR'
    dispositionLabel = 'Warranty covered — push OEM repair before replace'
  }

  return {
    asset_id: asset.id,
    item_name: asset.itemName,
    brand: asset.brand ?? null,
    condition,
    purchase_value: asset.purchaseValue ?? null,
    warranty_expires_at: asset.warrantyExpiresAt ?? null,
    warranty_covered: warrantyCovered || isWarrantyCovered(asset),
    disposition,
    disposition_label: dispositionLabel,
    health_score: health,
    last_inspected_at: asset.lastInspectedAt ?? null,
  }
}

export function buildTicketCard(params: {
  ticket: MaintenanceTicket
  asset?: InternalAsset
  actor: ActorContext
  now?: Date
}): TicketCardPayload {
  const { ticket, asset, actor, now } = params
  const warranty = ticket.warrantyCovered || isWarrantyCovered(asset)
  const health = scoreAssetHealth(asset, warranty)
  const column = kanbanColumnForTicket(ticket.status)

  return {
    id: ticket.id,
    client_id: ticket.agencyId,
    unit_id: ticket.unitId ?? null,
    property_id: ticket.propertyId,
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    status: ticket.status,
    kanban_column: column,
    category_key: ticket.categoryKey ?? null,
    contractor_id: ticket.contractorId,
    assigned_agent_id: ticket.assignedAgentId,
    cost: ticket.cost,
    photos: ticket.photos,
    warranty_covered: health.warranty_covered,
    escalated_at: ticket.escalatedAt ?? null,
    opened_at: ticket.openedAtIso ?? ticket.openedAt,
    asset_health: health,
    display_metadata: buildDisplayMetadata({
      updatedAt: ticket.openedAtIso ?? ticket.openedAt,
      createdAt: ticket.openedAtIso ?? ticket.openedAt,
      statusLabel: `${ticket.status} · ${health.disposition_label}`,
      primaryAmount: ticket.cost || null,
      now,
    }),
    actions: buildTicketActions({
      ticketId: ticket.id,
      status: ticket.status,
      actor,
    }),
  }
}

function encodeTicketCursor(openedAt: string, id: string): string {
  const raw = `${openedAt}|${id}`
  if (typeof btoa === 'function') {
    return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  return encodeURIComponent(raw)
}

function decodeTicketCursor(cursor: string | null | undefined): { openedAt: string; id: string } | null {
  if (!cursor) return null
  try {
    let raw = cursor
    if (typeof atob === 'function') {
      const padded = cursor.replace(/-/g, '+').replace(/_/g, '/')
      const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
      raw = atob(padded + pad)
    } else {
      raw = decodeURIComponent(cursor)
    }
    const [openedAt, id] = raw.split('|')
    if (!openedAt || !id) return null
    return { openedAt, id }
  } catch {
    return null
  }
}

export function listTicketsFeed(params: {
  tickets: MaintenanceTicket[]
  assets: InternalAsset[]
  filters: TicketsFeedFilters
  actor: ActorContext
  now?: Date
}): CursorFeedResponse<TicketCardPayload> | TicketsKanbanResponse {
  const { tickets, assets, filters, actor, now } = params
  const assetById = new Map(assets.map((a) => [a.id, a]))

  let rows = tickets.filter((t) => {
    if (filters.client_id && t.agencyId !== filters.client_id) return false
    if (filters.unit_id && t.unitId !== filters.unit_id) return false
    if (filters.contractor_id && t.contractorId !== filters.contractor_id) return false
    if (filters.category_key && t.categoryKey !== filters.category_key) return false
    if (filters.priority?.length && !filters.priority.includes(t.priority)) return false
    const column = kanbanColumnForTicket(t.status)
    if (filters.column && filters.column !== 'ALL' && column !== filters.column) return false
    return true
  })

  let cards = rows.map((ticket) =>
    buildTicketCard({
      ticket,
      asset: ticket.internalAssetId ? assetById.get(ticket.internalAssetId) : undefined,
      actor,
      now,
    }),
  )

  if (filters.disposition?.length) {
    cards = cards.filter((c) => filters.disposition!.includes(c.asset_health.disposition))
  }

  cards.sort((a, b) => {
    const pri = { Emergency: 0, Urgent: 1, High: 2, Medium: 3, Low: 4 } as Record<string, number>
    const pd = (pri[a.priority] ?? 5) - (pri[b.priority] ?? 5)
    if (pd !== 0) return pd
    return b.opened_at.localeCompare(a.opened_at)
  })

  if (filters.group_by_column) {
    const columns: Record<TicketKanbanColumn, TicketCardPayload[]> = {
      OPEN: [],
      IN_PROGRESS: [],
      RESOLVED: [],
    }
    for (const c of cards) columns[c.kanban_column].push(c)
    return {
      columns,
      counts: {
        OPEN: columns.OPEN.length,
        IN_PROGRESS: columns.IN_PROGRESS.length,
        RESOLVED: columns.RESOLVED.length,
      },
      meta: {
        endpoint: 'GET /api/v1/tickets?group_by_column=true',
        total: cards.length,
        repair_candidates: cards.filter((c) => c.asset_health.disposition === 'REPAIR').length,
        replace_candidates: cards.filter((c) => c.asset_health.disposition === 'REPLACE').length,
      },
    }
  }

  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), 100)
  const cursor = decodeTicketCursor(filters.cursor)
  if (cursor) {
    cards = cards.filter((c) => {
      if (c.opened_at < cursor.openedAt) return true
      if (c.opened_at > cursor.openedAt) return false
      return c.id < cursor.id
    })
  }

  const page = cards.slice(0, limit)
  const hasMore = cards.length > limit
  const last = page[page.length - 1]

  return {
    data: page,
    pagination: {
      next_cursor: hasMore && last ? encodeTicketCursor(last.opened_at, last.id) : null,
      prev_cursor: null,
      has_more: hasMore,
      limit,
      total_estimate: cursor ? null : cards.length,
    },
    meta: {
      endpoint: 'GET /api/v1/tickets',
      repair_candidates: cards.filter((c) => c.asset_health.disposition === 'REPAIR').length,
      replace_candidates: cards.filter((c) => c.asset_health.disposition === 'REPLACE').length,
    },
  }
}
