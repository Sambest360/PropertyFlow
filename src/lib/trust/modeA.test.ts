import { describe, expect, it } from 'vitest'
import { TRUST_MODE_A_COPY } from './modeA'

describe('Trust Mode A honesty copy', () => {
  it('states Mode A and denies live PayProp / bank-confirmed', () => {
    expect(TRUST_MODE_A_COPY).toMatch(/Mode A soft-demo/i)
    expect(TRUST_MODE_A_COPY).toMatch(/non-production/i)
    expect(TRUST_MODE_A_COPY).toMatch(/not live PayProp/i)
    expect(TRUST_MODE_A_COPY).toMatch(/Manual\/template CSV/i)
    expect(TRUST_MODE_A_COPY.toLowerCase()).not.toMatch(/live payprop http/)
    expect(TRUST_MODE_A_COPY.toLowerCase()).not.toMatch(/auto-match/)
  })
})
