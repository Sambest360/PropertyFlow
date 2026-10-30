/**
 * open-checkout-real: the rules behind the application checkout card.
 * C2 rows: this application only; tenant sees only rows where partyUserId is
 *    the signed-in user (anything else the server answers 403).
 * C3 no invented rows: nothing is created here, only live store rows filtered.
 * A2 every row is listed with its state; only Due/Overdue rows are payable.
 * PURCHASE: Sale Deposit is not payable online while the switch is off.
 * C4/C8 launcher: one in-flight POST per row, itemName only (no amount, no payer).
 */
import { describe, expect, it, vi } from 'vitest'
import type { PaymentRecord } from '../../types/domain'
import {
  AGENT_PAY_LABEL,
  SALE_DEPOSIT_EFT_COPY,
  SALE_DEPOSIT_ONLINE_PAY_ENABLED,
  applicationLedgerRows,
  createCheckoutLauncher,
  isPayableOnline,
  outstandingTotal,
  rowStateLabel,
} from './applicationCheckout'

function pay(o: Partial<PaymentRecord>): PaymentRecord {
  return {
    id: 'PAY-x',
    agencyId: 'ag-1',
    propertyId: 'PR-1',
    applicationId: 'APP-1',
    tenancyId: null,
    partyName: 'Applicant A',
    partyUserId: 'u-a',
    type: 'Deposit',
    amount: 1000,
    status: 'Due',
    dueDate: '2026-11-04',
    paidAt: null,
    method: null,
    landlordVisible: true,
    ...o,
  }
}

const ROWS: PaymentRecord[] = [
  pay({ id: 'PAY-rent', type: 'First Month Rent', amount: 18500 }),
  pay({ id: 'PAY-dep', type: 'Deposit', amount: 37000 }),
  pay({ id: 'PAY-other-app', applicationId: 'APP-2' }),
  pay({ id: 'PAY-paid', type: 'Rent', status: 'Paid', amount: 100 }),
  pay({ id: 'PAY-cancel', type: 'Other', status: 'Cancelled', amount: 5 }),
  pay({ id: 'PAY-not-mine', partyUserId: 'u-someone-else', amount: 7 }),
  pay({ id: 'PAY-null-party', partyUserId: null, amount: 9 }),
]

describe('applicationLedgerRows', () => {
  it('agent: every row of this application (any status, any party), deposit first', () => {
    const rows = applicationLedgerRows(ROWS, { applicationId: 'APP-1', viewer: { mode: 'agent' } })
    expect(rows.map((r) => r.id)).toEqual([
      'PAY-dep',
      'PAY-not-mine',
      'PAY-null-party',
      'PAY-rent',
      'PAY-paid',
      'PAY-cancel',
    ])
  })

  it('C2 tenant: only rows whose partyUserId is the signed-in user', () => {
    const rows = applicationLedgerRows(ROWS, { applicationId: 'APP-1', viewer: { mode: 'tenant', userId: 'u-a' } })
    expect(rows.map((r) => r.id)).toEqual(['PAY-dep', 'PAY-rent', 'PAY-paid', 'PAY-cancel'])
    expect(rows.every((r) => r.partyUserId === 'u-a')).toBe(true)
  })

  it('C2 tenant: a blank user id never matches a null partyUserId', () => {
    expect(applicationLedgerRows(ROWS, { applicationId: 'APP-1', viewer: { mode: 'tenant', userId: '' } })).toEqual([])
  })

  it('C1: persistedDueIds drops open rows this session did not save, keeps settled history', () => {
    const rows = applicationLedgerRows(ROWS, {
      applicationId: 'APP-1',
      viewer: { mode: 'agent' },
      persistedDueIds: ['PAY-dep', 'PAY-rent'],
    })
    expect(rows.map((r) => r.id)).toEqual(['PAY-dep', 'PAY-rent', 'PAY-paid', 'PAY-cancel'])
  })

  it('C3: no rows in, no rows out (nothing is invented)', () => {
    expect(applicationLedgerRows([], { applicationId: 'APP-1', viewer: { mode: 'agent' } })).toEqual([])
    expect(
      applicationLedgerRows([pay({ applicationId: null })], { applicationId: 'APP-1', viewer: { mode: 'agent' } }),
    ).toEqual([])
  })
})

describe('row state, payability and total', () => {
  it('A2 labels', () => {
    expect(rowStateLabel(pay({ type: 'Deposit', status: 'Paid' }))).toBe('Deposit paid')
    expect(rowStateLabel(pay({ type: 'First Month Rent', status: 'Due' }))).toBe('First month rent due')
    expect(rowStateLabel(pay({ type: 'Deposit', status: 'Overdue' }))).toBe('Deposit overdue')
    expect(rowStateLabel(pay({ type: 'Rent', status: 'Cancelled' }))).toBe('Rent cancelled')
    expect(rowStateLabel(pay({ type: 'Sale Deposit', status: 'Due' }))).toBe('Sale deposit due')
  })

  it('only Due/Overdue rows are payable online', () => {
    expect(isPayableOnline(pay({ status: 'Due' }))).toBe(true)
    expect(isPayableOnline(pay({ status: 'Overdue' }))).toBe(true)
    expect(isPayableOnline(pay({ status: 'Paid' }))).toBe(false)
    expect(isPayableOnline(pay({ status: 'Cancelled' }))).toBe(false)
  })

  it('PURCHASE: Sale Deposit is EFT-only by default, one switch flips it', () => {
    expect(SALE_DEPOSIT_ONLINE_PAY_ENABLED).toBe(false)
    expect(isPayableOnline(pay({ type: 'Sale Deposit' }))).toBe(false)
    expect(isPayableOnline(pay({ type: 'Sale Deposit' }), true)).toBe(true)
    expect(SALE_DEPOSIT_EFT_COPY).toBe('Pay by EFT to the details in your agreement')
  })

  it('A4 total is the sum of the open rows only', () => {
    const rows = applicationLedgerRows(ROWS, { applicationId: 'APP-1', viewer: { mode: 'tenant', userId: 'u-a' } })
    expect(outstandingTotal(rows)).toBe(37000 + 18500)
  })

  it('A1 agent label is exact', () => {
    expect(AGENT_PAY_LABEL).toBe('Pay on behalf of applicant (applicant pays on this screen)')
  })
})

describe('createCheckoutLauncher', () => {
  it('C4: a double click makes exactly one start call; C8: itemName only', async () => {
    let release!: (v: { ok: boolean }) => void
    const start = vi.fn(() => new Promise<{ ok: boolean }>((r) => (release = r)))
    const launch = createCheckoutLauncher(start)
    const row = pay({ id: 'PAY-abc', type: 'Deposit', amount: 37000 })
    const a = launch(row)
    const b = launch(row)
    expect(start).toHaveBeenCalledTimes(1)
    expect(await b).toBeNull()
    release({ ok: true })
    expect(await a).toEqual({ ok: true })
    expect(start.mock.calls[0]).toEqual(['PAY-abc', { itemName: 'Lekaya · Deposit' }])
    // Success navigates away: the row stays locked.
    expect(await launch(row)).toBeNull()
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('a failure unlocks the row so the user can retry', async () => {
    const start = vi.fn(async () => ({ ok: false, error: 'payment_not_yours', userMessage: 'x' }))
    const launch = createCheckoutLauncher(start)
    const row = pay({ id: 'PAY-abc' })
    expect((await launch(row))?.ok).toBe(false)
    expect((await launch(row))?.ok).toBe(false)
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('a thrown start is reported as a failure, never as success', async () => {
    const launch = createCheckoutLauncher(vi.fn(async () => { throw new Error('boom') }))
    const r = await launch(pay({}))
    expect(r?.ok).toBe(false)
    expect(r?.userMessage).toBeTruthy()
  })

  it('two different rows can each start (per-button lock, not a page lock)', async () => {
    const start = vi.fn(() => new Promise<{ ok: boolean }>(() => {}))
    const launch = createCheckoutLauncher(start)
    void launch(pay({ id: 'PAY-1' }))
    void launch(pay({ id: 'PAY-2' }))
    expect(start).toHaveBeenCalledTimes(2)
  })
})
