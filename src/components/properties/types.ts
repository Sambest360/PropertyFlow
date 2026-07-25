import type { PropertyAsset } from '../../types/domain'
import { STANDARD_PROPERTY_STATUSES } from '../../lib/propertyStatus'

export type PropertiesViewMode = 'list' | 'cards'

export type AttentionFilter = 'all' | 'any' | 'tickets' | 'viewings' | 'apps'
export type SortKey = 'name' | 'suburb' | 'status' | 'price' | 'attention'

export type PortfolioProperty = {
  property: PropertyAsset
  occupancy: string | null
  openTickets: number
  scheduledViewings: number
  waitingApps: number
  agentName: string | null
  attentionScore: number
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

export function priceLabel(p: PropertyAsset, formatZAR: (n: number) => string) {
  if (p.price != null) return formatZAR(p.price)
  if (p.rent != null) return `${formatZAR(p.rent)} / mo`
  return '—'
}

export function listingModeLabel(mode: PropertyAsset['listingMode']) {
  if (mode === 'sale') return 'For sale'
  if (mode === 'rent') return 'For rent'
  return 'Sale & rent'
}
