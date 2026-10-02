import { describe, expect, it } from 'vitest'
import { RENEWALS_MODE_A_COPY } from './RenewalsModeABanner'

describe('RenewalsModeABanner honesty', () => {
  it('denies CPA legal / live notice / live CPI claims', () => {
    const copy = RENEWALS_MODE_A_COPY.toLowerCase()
    expect(copy).toMatch(/not cpa legal service/)
    expect(copy).toMatch(/not live notice/)
    expect(copy).toMatch(/not live cpi/)
    expect(copy).not.toMatch(/statutory cpa product/)
  })
})
