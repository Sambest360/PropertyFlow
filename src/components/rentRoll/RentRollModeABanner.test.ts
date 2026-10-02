import { describe, expect, it } from 'vitest'
import { AUDIT_PACK_MODE_A_COPY, RENT_ROLL_MODE_A_COPY } from './RentRollModeABanner'

describe('RentRollModeABanner honesty', () => {
  it('denies trust-audit / PPRA / bank claims', () => {
    const copy = `${RENT_ROLL_MODE_A_COPY} ${AUDIT_PACK_MODE_A_COPY}`.toLowerCase()
    expect(copy).toMatch(/not trust-audited/)
    expect(copy).toMatch(/ppra/)
    expect(copy).toMatch(/not bank-confirmed|not bank-matched/)
    expect(copy).not.toMatch(/live payprop remittance api/)
  })
})
