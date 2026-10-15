import type { PropertyAsset } from '../../types/domain'
import { STANDARD_PROPERTY_STATUSES } from '../../lib/propertyStatus'

export type PropertiesViewMode = 'list' | 'cards' | 'map'

export type AttentionFilter = 'all' | 'any' | 'tickets' | 'viewings' | 'apps'
export type OccupancyFilter =
  | 'all'
  | 'VACANT'
  | 'OCCUPIED'
  | 'UNDER_OFFER'
  | 'MAINTENANCE'
  | 'DRAFT'
  | 'PUBLISHED'
  | 'unknown'
export type SortKey = 'name' | 'suburb' | 'status' | 'price' | 'attention' | 'building'

export type PortfolioProperty = {
  property: PropertyAsset
  occupancy: string | null
  openTickets: number
  scheduledViewings: number
  waitingApps: number
  agentName: string | null
  attentionScore: number
  /** Resolved building display name when linked */
  buildingName?: string | null
  unitNumber?: string | null
}

export const PROPERTY_TYPES = [
  'All',
  'House',
  'Apartment',
  'Townhouse',
  'Commercial',
  'Office',
  'Vacant Land',
  'Student Accommodation',
] as const

/** Filter options — raw listing statuses from data model */
export const PROPERTY_STATUSES = [
  'All',
  'Draft',
  'Published',
  'Featured',
  'Under Offer',
  'Sold',
  'Rented',
  'Archived',
  'Maintenance',
] as const

export { STANDARD_PROPERTY_STATUSES }

export const VIEW_STORAGE_KEY = 'propertyflow-properties-view'

export function rentPriceLabel(p: PropertyAsset, formatZAR: (n: number) => string) {
  if (p.rent != null) return `${formatZAR(p.rent)} / mo`
  return '—'
}

export function salePriceLabel(p: PropertyAsset, formatZAR: (n: number) => string) {
  if (p.price != null) return formatZAR(p.price)
  return '—'
}

export function priceLabel(p: PropertyAsset, formatZAR: (n: number) => string) {
  if (p.listingMode === 'both') {
    const parts = [
      p.rent != null ? `${formatZAR(p.rent)} / mo` : null,
      p.price != null ? formatZAR(p.price) : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : '—'
  }
  if (p.listingMode === 'sale' || (p.price != null && p.rent == null)) return salePriceLabel(p, formatZAR)
  if (p.rent != null) return rentPriceLabel(p, formatZAR)
  if (p.price != null) return formatZAR(p.price)
  return '—'
}

export type PropertyListMarketSegment = 'rent' | 'sale'

export type PropertyListRow = {
  item: PortfolioProperty
  marketSegment?: PropertyListMarketSegment
}

export function marketSegmentLabel(segment: PropertyListMarketSegment): string {
  return segment === 'rent' ? 'To rent' : 'For sale'
}

export function priceLabelForSegment(
  p: PropertyAsset,
  segment: PropertyListMarketSegment,
  formatZAR: (n: number) => string,
) {
  return segment === 'rent' ? rentPriceLabel(p, formatZAR) : salePriceLabel(p, formatZAR)
}

export function listingModeLabel(mode: PropertyAsset['listingMode']) {
  if (mode === 'sale') return 'For sale'
  if (mode === 'rent') return 'For rent'
  return 'Sale & rent'
}
