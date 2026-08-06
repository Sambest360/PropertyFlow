import type { PropertyAsset } from '../types/domain'

/** Canonical portfolio statuses shown in the UI */
export const STANDARD_PROPERTY_STATUSES = [
  'Draft',
  'Available',
  'Featured',
  'Under Offer',
  'Occupied',
  'Maintenance',
  'Sold',
  'Archived',
] as const

export type StandardPropertyStatus = (typeof STANDARD_PROPERTY_STATUSES)[number]

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'accent'

/**
 * Resolve a single user-facing status from listing status + unit occupancy.
 * Avoids showing conflicting “Published” + “Occupied” / “Sale” signals side by side.
 */
export function resolvePortfolioStatus(
  status: PropertyAsset['status'],
  occupancy: string | null | undefined,
): { label: StandardPropertyStatus; tone: StatusTone } {
  const occ = (occupancy ?? '').toUpperCase()

  if (status === 'Sold') return { label: 'Sold', tone: 'info' }
  if (status === 'Archived') return { label: 'Archived', tone: 'neutral' }
  if (status === 'Maintenance' || occ === 'MAINTENANCE') return { label: 'Maintenance', tone: 'danger' }
  if (status === 'Rented' || occ === 'OCCUPIED') return { label: 'Occupied', tone: 'info' }
  if (status === 'Under Offer' || occ === 'UNDER_OFFER') return { label: 'Under Offer', tone: 'warning' }
  if (status === 'Featured' || occ === 'FEATURED') return { label: 'Featured', tone: 'brand' }
  if (status === 'Draft' || occ === 'DRAFT') return { label: 'Draft', tone: 'warning' }
  if (status === 'Published' || occ === 'PUBLISHED' || occ === 'VACANT') {
    return { label: 'Available', tone: 'success' }
  }
  return { label: 'Available', tone: 'success' }
}

/** Map any status string to a badge tone — used app-wide via statusTone enhancements */
export function propertyStatusTone(label: string): StatusTone {
  const s = label.toLowerCase()
  if (s === 'available' || s === 'published' || s === 'featured') return s === 'featured' ? 'brand' : 'success'
  if (s === 'draft' || s === 'under offer') return 'warning'
  if (s === 'maintenance') return 'danger'
  if (s === 'occupied' || s === 'rented' || s === 'sold') return 'info'
  if (s === 'archived' || s === 'quiet') return 'neutral'
  return 'neutral'
}

/** Returns a user-facing reason when a draft cannot go live yet. */
export function validatePropertyReadyToPublish(property: PropertyAsset): string | null {
  if (property.status !== 'Draft') return null
  if (!property.title?.trim()) return 'Add a listing title before publishing.'
  if (!property.images?.length) return 'Add at least one listing photo before publishing.'
  if (!property.address?.trim() && !property.suburb?.trim()) {
    return 'Add a street address or suburb before publishing.'
  }
  return null
}
