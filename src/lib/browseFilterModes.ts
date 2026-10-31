/**
 * Buy and Rent get their own filter sets on /browse. Every filter here is
 * backed by a real listing field: rent-only and sale-only features come from
 * the listing's amenities (src/lib/propertyFeatures.ts scopes), availability
 * from units.available_from and floor size from the listing's m² (area).
 */
import type { PropertyAsset } from '../types/domain'
import { AMENITY_FILTER_OPTIONS } from './propertyFeatures'

export const FURNISHING_OPTIONS = ['Furnished', 'Semi-furnished', 'Unfurnished'] as const
/** "Pets allowed" matches either label an agent can tick. */
export const PET_LABELS = ['Pet Friendly', 'Pets negotiable'] as const
export const LEASE_TERM_OPTIONS = ['Month-to-month', 'Bills included', 'WiFi included'] as const
export const SALE_DETAIL_OPTIONS = [
  'Freehold',
  'Sectional title',
  'Vacant possession',
  'Bondable',
  'Investment ready',
] as const

/** Property types that can appear in each section (see src/lib/browseMode.ts). */
export function propertyTypesForMode(mode: string): string[] {
  if (mode === 'rent') return ['House', 'Apartment', 'Townhouse', 'Student Accommodation']
  if (mode === 'buy') return ['House', 'Apartment', 'Townhouse', 'Vacant Land', 'Farm']
  if (mode === 'commercial') return ['Commercial', 'Office']
  return [
    'House',
    'Apartment',
    'Townhouse',
    'Commercial',
    'Office',
    'Vacant Land',
    'Farm',
    'Student Accommodation',
  ]
}

/** General amenity chips — minus the ones a mode shows in its own section. */
export function amenityOptionsForMode(mode: string): string[] {
  const own = new Set<string>(FURNISHING_OPTIONS)
  if (mode === 'rent') PET_LABELS.forEach((l) => own.add(l))
  return AMENITY_FILTER_OPTIONS.filter((a) => !own.has(a))
}

export type PriceBounds = { min: number; max: number; step: number; presets: number[] }

export function priceBoundsForMode(mode: string): PriceBounds {
  if (mode === 'rent') {
    return { min: 0, max: 60_000, step: 500, presets: [5_000, 8_000, 12_000, 20_000, 35_000] }
  }
  return {
    min: 0,
    max: 20_000_000,
    step: 100_000,
    presets: [1_000_000, 2_000_000, 3_000_000, 5_000_000, 10_000_000, 15_000_000],
  }
}

export type ModeFilterFields = {
  types: string[]
  minPrice: string
  maxPrice: string
  amenities: string[]
  /** Rent */
  furnishing: string[]
  petsAllowed: boolean
  /** YYYY-MM-DD: available on or before this date (no date = available now). */
  availableBy: string
  leaseTerms: string[]
  /** Buy */
  saleDetails: string[]
  minFloorSize: string
}

/** Today as YYYY-MM-DD in local time. */
function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The Buy-only and Rent-only checks. Filters for the other mode are ignored,
 * so a stale value can never hide listings.
 */
export function matchesModeFilters(
  p: Pick<PropertyAsset, 'amenities' | 'availableFrom' | 'area'>,
  mode: string,
  f: ModeFilterFields,
): boolean {
  const has = (label: string) => p.amenities.includes(label)
  if (mode === 'rent') {
    if (f.furnishing.length && !f.furnishing.some(has)) return false
    if (f.petsAllowed && !PET_LABELS.some(has)) return false
    if (f.leaseTerms.length && !f.leaseTerms.every(has)) return false
    if (f.availableBy) {
      const from = p.availableFrom ? p.availableFrom.slice(0, 10) : todayIso()
      if (from > f.availableBy) return false
    }
  }
  if (mode === 'buy') {
    if (f.saleDetails.length && !f.saleDetails.every(has)) return false
    const minArea = f.minFloorSize ? Number(f.minFloorSize) : 0
    if (minArea > 0 && !(p.area >= minArea)) return false
  }
  return true
}

export function hasModeFilters(mode: string, f: ModeFilterFields): boolean {
  if (mode === 'rent') return Boolean(f.furnishing.length || f.petsAllowed || f.leaseTerms.length || f.availableBy)
  if (mode === 'buy') return Boolean(f.saleDetails.length || f.minFloorSize)
  return false
}

/**
 * Switching Buy ↔ Rent (or to All / Commercial): drop the price range (R/month
 * means nothing for a sale), the other mode's filters, and types or amenities
 * the new section doesn't offer. Rooms, parking, utilities and sort carry over.
 */
export function translateFiltersForMode<T extends ModeFilterFields>(f: T, from: string, to: string): T {
  if (from === to) return f
  const types = propertyTypesForMode(to)
  const amenities = amenityOptionsForMode(to)
  const next: T = {
    ...f,
    minPrice: '',
    maxPrice: '',
    types: f.types.filter((t) => types.includes(t)),
    amenities: f.amenities.filter((a) => amenities.includes(a)),
  }
  if (to !== 'rent') {
    next.furnishing = []
    next.petsAllowed = false
    next.availableBy = ''
    next.leaseTerms = []
  }
  if (to !== 'buy') {
    next.saleDetails = []
    next.minFloorSize = ''
  }
  return next
}
