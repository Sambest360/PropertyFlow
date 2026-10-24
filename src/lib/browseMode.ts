/**
 * Marketplace navbar sections (Buy / Rent / Commercial) — one rule for the
 * browse grid, the units feed cards and tests, so the sections never overlap:
 *
 *  - commercial: Commercial / Office listings only (for sale or to rent)
 *  - buy:  for sale (sale, or sale-or-rent with a sale price), not commercial
 *  - rent: to rent  (rent, or sale-or-rent with a rent),      not commercial
 */
import type { PropertyAsset } from '../types/domain'

export const COMMERCIAL_TYPES: readonly string[] = ['Commercial', 'Office']

export function isCommercialType(type: string | null | undefined): boolean {
  return Boolean(type) && COMMERCIAL_TYPES.includes(type as string)
}

export function matchesBrowseMode(
  p: Pick<PropertyAsset, 'type' | 'listingMode' | 'price' | 'rent'>,
  mode: string,
): boolean {
  if (mode === 'commercial') return isCommercialType(p.type)
  if (mode === 'buy') {
    return !isCommercialType(p.type) && (p.listingMode === 'sale' || p.listingMode === 'both') && p.price != null
  }
  if (mode === 'rent') {
    return !isCommercialType(p.type) && (p.listingMode === 'rent' || p.listingMode === 'both') && p.rent != null
  }
  return true
}
