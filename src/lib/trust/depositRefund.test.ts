import { describe, expect, it } from 'vitest'
import { checkRefundSplit, DEPOSIT_REFUND_RECORDED_LABEL, DEPOSIT_NEEDS_SERVER_COPY } from './depositDualControl'
import { DEPOSIT_REFUND_RECORDED_LABEL as SERVER_LABEL } from '../../../server/depositRoutes'

describe('D2 refund copy and split', () => {
  it('copy says recorded, not bank-confirmed; never Refunded, paid or settled', () => {
    expect(DEPOSIT_REFUND_RECORDED_LABEL).toBe('Refund recorded (not bank-confirmed)')
    expect(SERVER_LABEL).toBe(DEPOSIT_REFUND_RECORDED_LABEL)
    expect(DEPOSIT_REFUND_RECORDED_LABEL).not.toMatch(/refunded|paid|settled/i)
    expect(DEPOSIT_NEEDS_SERVER_COPY).toMatch(/need the server/)
  })

  it('accepts a balanced split', () => {
    expect(checkRefundSplit(100000, { refundedCents: 81500, interestCents: 1500, deductions: [{ reason: 'Window', amountCents: 20000 }] })).toBeNull()
    expect(checkRefundSplit(100000, { refundedCents: 100000, interestCents: 0, deductions: [] })).toBeNull()
  })

  it('refuses an unbalanced split, negative or fractional cents, and a deduction without a reason', () => {
    expect(checkRefundSplit(100000, { refundedCents: 90000, interestCents: 0, deductions: [] })).toMatch(/must equal/)
    expect(checkRefundSplit(100000, { refundedCents: -1, interestCents: 0, deductions: [] })).toMatch(/whole cents/)
    expect(checkRefundSplit(100000, { refundedCents: 0.5, interestCents: 0, deductions: [] })).toMatch(/whole cents/)
    expect(checkRefundSplit(100000, { refundedCents: 80000, interestCents: 0, deductions: [{ reason: ' ', amountCents: 20000 }] })).toMatch(/needs a reason/)
  })
})
