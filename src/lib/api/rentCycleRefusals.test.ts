import { afterEach, describe, expect, it } from 'vitest'
import { releaseRentCycleWrite, rentCycleRefusalHandling, trackRentCycleWrite } from './rentCycleRefusals'

/**
 * Slice A (plan §5.4 / MA11, addendum2 note 4): the rent cycle records the
 * payment ids it writes. A 409 PAYMENT_TERMINAL on one of those ids is quiet
 * (the row was paid meanwhile; the store still refreshes). A 400
 * PAYMENT_AMOUNT_REQUIRED on one of them names the unit. Any other id, or once
 * the write has settled, gets the normal toast.
 */
const refusal = (id: string, status: number, code: string) => ({ resource: 'payment', id, action: 'upsert', status, code, message: 'x' })

afterEach(() => {
  for (const id of ['PAY-sla1', 'PAY-sla2', 'PAY-sla3']) releaseRentCycleWrite(id)
})

describe('rent-cycle refusal handling', () => {
  it('a 409 PAYMENT_TERMINAL on a tracked id is quiet', () => {
    trackRentCycleWrite('PAY-sla1', 'Unit 4 · Sea View')
    expect(rentCycleRefusalHandling(refusal('PAY-sla1', 409, 'PAYMENT_TERMINAL'))).toEqual({ quiet: true })
  })

  it('a 400 PAYMENT_AMOUNT_REQUIRED on a tracked id names the unit', () => {
    trackRentCycleWrite('PAY-sla2', 'Unit 4 · Sea View')
    expect(rentCycleRefusalHandling(refusal('PAY-sla2', 400, 'PAYMENT_AMOUNT_REQUIRED'))).toEqual({
      quiet: false,
      body: 'This lease has no rent amount set (Unit 4 · Sea View).',
    })
  })

  it('untracked or released ids, and other codes, are not special', () => {
    expect(rentCycleRefusalHandling(refusal('PAY-sla3', 409, 'PAYMENT_TERMINAL'))).toEqual({ quiet: false })
    trackRentCycleWrite('PAY-sla3', 'Unit 1')
    releaseRentCycleWrite('PAY-sla3')
    expect(rentCycleRefusalHandling(refusal('PAY-sla3', 409, 'PAYMENT_TERMINAL'))).toEqual({ quiet: false })
    trackRentCycleWrite('PAY-sla1', 'Unit 1')
    expect(rentCycleRefusalHandling(refusal('PAY-sla1', 403, 'PAYMENT_PERMISSION_REQUIRED'))).toEqual({ quiet: false })
    expect(rentCycleRefusalHandling({ ...refusal('PAY-sla1', 409, 'PAYMENT_TERMINAL'), resource: 'tenancy' })).toEqual({ quiet: false })
  })
})
