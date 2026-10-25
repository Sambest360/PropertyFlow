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

/**
 * Commercial is decided by the property type, never by rent / sale. Besides
 * the built-in Commercial and Office, agency-added types such as Retail,
 * Industrial or Warehouse count too (matched case-insensitively).
 */
const COMMERCIAL_TYPE_RE = /\b(commercial|office|retail|industrial|warehouse|shop|factory|business)\b/i

export function isCommercialType(type: string | null | undefined): boolean {
  return Boolean(type) && COMMERCIAL_TYPE_RE.test(String(type))
}

/**
 * The price a browse card shows. A sale-or-rent listing shows the price for
 * the section it is in — sale price under Buy, rent under Rent — and both
 * where the section covers either (All, Commercial).
 */
export function browseCardPrice(
  p: Pick<PropertyAsset, 'listingMode' | 'price' | 'rent'>,
  mode: string | undefined,
  fmt: (n: number) => string,
): string {
  const sale = p.price != null ? fmt(p.price) : null
  const rent = p.rent != null ? `${fmt(p.rent)} / month` : null
  if (p.listingMode === 'sale') return sale ?? ''
  if (p.listingMode === 'rent') return rent ?? sale ?? ''
  if (mode === 'buy') return sale ?? rent ?? ''
  if (mode === 'rent') return rent ?? sale ?? ''
  return [rent, sale ? `${sale} to buy` : null].filter(Boolean).join(' · ')
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
