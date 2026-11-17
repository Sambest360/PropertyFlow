/**
 * Public price list (November 2026): what the website shows and the pricing
 * calculator works out. Rand per month, excl. VAT. Billing still uses
 * saasPricing.ts; this file is the published price sheet only.
 */

/** Graduated per-property bands: each band is charged at its own rate, like tax brackets. */
export const PER_PROPERTY_BANDS = [
  { label: '1 to 200', upTo: 200, rate: 25 },
  { label: '201 to 1 000', upTo: 1000, rate: 18 },
  { label: '1 001 and up', upTo: Infinity, rate: 12 },
] as const

/** Fixed monthly maintenance fee by size. Enterprise+ (2 001+) is quoted. */
export const MAINTENANCE_TIERS = [
  { name: 'Landlord', range: '1 to 10', upTo: 10, fee: 250 },
  { name: 'Boutique', range: '11 to 50', upTo: 50, fee: 750 },
  { name: 'Small agency', range: '51 to 200', upTo: 200, fee: 1500 },
  { name: 'Mid-size agency', range: '201 to 500', upTo: 500, fee: 2950 },
  { name: 'Large agency', range: '501 to 1 000', upTo: 1000, fee: 4950 },
  { name: 'Enterprise', range: '1 001 to 2 000', upTo: 2000, fee: 7950 },
] as const

export const ONBOARDING_FEES = [
  { range: 'Up to 200 properties', upTo: 200, fee: 2950 },
  { range: '201 to 1 000', upTo: 1000, fee: 4950 },
  { range: '1 001+', upTo: Infinity, fee: 9950 },
] as const

/** Largest portfolio the calculator prices; above this it's "Contact us for a quote". */
export const MAX_QUOTED_PROPERTIES = 2000

/** Annual payers pay 10 months for 12. */
export const ANNUAL_MONTHS_PAID = 10

export const EXAMPLE_PORTFOLIOS = [30, 150, 350, 800, 1500] as const

export const PER_PROPERTY_INCLUDES = [
  'Advertising and listings',
  'Viewing bookings',
  'Online tenant applications',
  'E-signed leases (ECTA)',
  'The property and tenant timeline',
  'The trust ledger: a record of whose money is whose (Lekaya never holds or moves money)',
  'Full audit trail',
  'Tenant, landlord and contractor portals',
  'Unlimited staff users',
]

export const MAINTENANCE_INCLUDES = [
  'Inspections with photos',
  'Tenant fault logging',
  'Maintenance tickets',
  'Contractor quotes',
  'Job sign-off with photos',
  'Contractor invoices recorded in the ledger',
  'Planned maintenance schedules',
]

export type PriceQuote = {
  properties: number
  perProperty: number
  maintenance: number
  monthlyTotal: number
  /** monthlyTotal / properties, in rand (not rounded) */
  effectivePerProperty: number
  onboarding: number
  annual: number
}

/** Price for n properties, or null when n is above 2 000 (quoted) or not a whole number from 1. */
export function quote(n: number): PriceQuote | null {
  if (!Number.isInteger(n) || n < 1 || n > MAX_QUOTED_PROPERTIES) return null
  let perProperty = 0
  let from = 0
  for (const b of PER_PROPERTY_BANDS) {
    perProperty += Math.max(0, Math.min(n, b.upTo) - from) * b.rate
    from = b.upTo
  }
  const maintenance = MAINTENANCE_TIERS.find((t) => n <= t.upTo)!.fee
  const monthlyTotal = perProperty + maintenance
  return {
    properties: n,
    perProperty,
    maintenance,
    monthlyTotal,
    effectivePerProperty: monthlyTotal / n,
    onboarding: ONBOARDING_FEES.find((t) => n <= t.upTo)!.fee,
    annual: monthlyTotal * ANNUAL_MONTHS_PAID,
  }
}

/** SA format: R25, R1 500, R33 350; cents=true gives R93.18. */
export function rand(amount: number, cents = false): string {
  const [whole, dec] = (Math.round(amount * 100) / 100).toFixed(cents ? 2 : 0).split('.')
  return `R${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${dec ? `.${dec}` : ''}`
}
