import { describe, expect, it } from 'vitest'
import { draftSaasInvoice, tierForPropertyCount } from './saasPricing'

describe('Lekaya pricing', () => {
  it('picks the tier by number of properties', () => {
    expect(tierForPropertyCount(0).id).toBe('up-to-50')
    expect(tierForPropertyCount(50).id).toBe('up-to-50')
    expect(tierForPropertyCount(51).id).toBe('51-150')
    expect(tierForPropertyCount(300).id).toBe('151-300')
    expect(tierForPropertyCount(1000).id).toBe('301-1000')
    expect(tierForPropertyCount(1001).id).toBe('1000-plus')
  })

  it('first invoice adds the sign-up fee, advertising and VAT', () => {
    const d = draftSaasInvoice({ propertyCount: 120, advertisedCount: 4, includeSignUp: true, periodLabel: 'November 2026' })
    expect(d.lines.map((l) => l.amount)).toEqual([2500, 1950, 100])
    expect(d.subtotal).toBe(4550)
    expect(d.vat).toBe(682.5)
    expect(d.total).toBe(5232.5)
  })

  it('1,000+ needs an agreed fee; an agreed fee overrides the tier', () => {
    expect(draftSaasInvoice({ propertyCount: 1500, advertisedCount: 0, includeSignUp: false, periodLabel: 'x' }).needsAgreedFee).toBe(true)
    const d = draftSaasInvoice({ propertyCount: 1500, advertisedCount: 0, includeSignUp: false, periodLabel: 'x', settings: { customMonthlyFee: 9000 } })
    expect(d.needsAgreedFee).toBe(false)
    expect(d.subtotal).toBe(9000)
  })
})
