/**
 * Lekaya Rentals pricing for agencies (price sheet, October 2026):
 * a once-off sign-up fee and a monthly fee by portfolio size, plus R25 per
 * property per month for front-page advertising. Shared by server and app.
 */

export const SAAS_VAT_RATE = 0.15
export const ADVERTISING_FEE_PER_PROPERTY = 25

export type PricingTier = {
  id: string
  label: string
  minProperties: number
  /** null = no upper limit */
  maxProperties: number | null
  /** null = "Contact us": priced per agency by the platform team */
  signUpFee: number | null
  monthlyFee: number | null
}

export const PRICING_TIERS: PricingTier[] = [
  { id: 'up-to-50', label: 'Up to 50 properties', minProperties: 0, maxProperties: 50, signUpFee: 1500, monthlyFee: 750 },
  { id: '51-150', label: '51 – 150 properties', minProperties: 51, maxProperties: 150, signUpFee: 2500, monthlyFee: 1950 },
  { id: '151-300', label: '151 – 300 properties', minProperties: 151, maxProperties: 300, signUpFee: 3500, monthlyFee: 3500 },
  { id: '301-1000', label: '301 – 1,000 properties', minProperties: 301, maxProperties: 1000, signUpFee: 5000, monthlyFee: 6500 },
  { id: '1000-plus', label: '1,000+ properties', minProperties: 1001, maxProperties: null, signUpFee: null, monthlyFee: null },
]

export const INCLUDED_IN_EVERY_PLAN = ['Unlimited users', 'Rental management system', 'Ongoing updates', 'Support']

export function tierForPropertyCount(count: number): PricingTier {
  return PRICING_TIERS.find((t) => count >= t.minProperties && (t.maxProperties === null || count <= t.maxProperties)) ?? PRICING_TIERS[0]!
}

/** Per-agency billing settings kept in clients.settings.billing. */
export type AgencyBillingSettings = {
  /** Agreed monthly fee (for 1,000+ or a special deal); overrides the tier. */
  customMonthlyFee?: number | null
  customSignUpFee?: number | null
  /** The sign-up fee was already billed (or waived). */
  signUpBilled?: boolean
  /** Not billed at all (e.g. the platform's own test agency). */
  exempt?: boolean
  /** Day of the month invoices fall due (default 7). */
  dueDay?: number
}

export type InvoiceLine = { label: string; quantity: number; unitPrice: number; amount: number }

export type SaasInvoiceDraft = {
  tierId: string
  tierLabel: string
  propertyCount: number
  advertisedCount: number
  lines: InvoiceLine[]
  subtotal: number
  vat: number
  total: number
  /** True when the tier is "Contact us" and no agreed fee is set yet. */
  needsAgreedFee: boolean
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function draftSaasInvoice(input: {
  propertyCount: number
  advertisedCount: number
  settings?: AgencyBillingSettings | null
  /** Add the sign-up fee (first invoice). */
  includeSignUp: boolean
  periodLabel: string
}): SaasInvoiceDraft {
  const s = input.settings ?? {}
  const tier = tierForPropertyCount(input.propertyCount)
  const monthly = s.customMonthlyFee ?? tier.monthlyFee
  const signUp = s.customSignUpFee ?? tier.signUpFee
  const lines: InvoiceLine[] = []
  if (input.includeSignUp && signUp) lines.push({ label: `Once-off sign-up (${tier.label})`, quantity: 1, unitPrice: signUp, amount: signUp })
  if (monthly) lines.push({ label: `Monthly subscription — ${input.periodLabel} (${tier.label})`, quantity: 1, unitPrice: monthly, amount: monthly })
  if (input.advertisedCount > 0) {
    lines.push({
      label: 'Front-page advertising',
      quantity: input.advertisedCount,
      unitPrice: ADVERTISING_FEE_PER_PROPERTY,
      amount: r2(input.advertisedCount * ADVERTISING_FEE_PER_PROPERTY),
    })
  }
  const subtotal = r2(lines.reduce((a, l) => a + l.amount, 0))
  const vat = r2(subtotal * SAAS_VAT_RATE)
  return {
    tierId: tier.id,
    tierLabel: tier.label,
    propertyCount: input.propertyCount,
    advertisedCount: input.advertisedCount,
    lines,
    subtotal,
    vat,
    total: r2(subtotal + vat),
    needsAgreedFee: monthly == null,
  }
}
