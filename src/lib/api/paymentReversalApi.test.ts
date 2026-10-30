import { describe, expect, it, vi } from 'vitest'

/** Admin reversal client (spec-admin-reversal 9.3 / 9.4; Step 1). */
const load = () => import('./paymentReversalApi')

const jsonResponse = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response

describe('paymentReversalApi', () => {
  it('maps every 9.3 code to its plain sentence and never shows a code', async () => {
    const { reversalErrorSentence, REVERSAL_ERROR_SENTENCES } = await load()
    expect(reversalErrorSentence('PAYMENT_STALE')).toBe('Someone changed this payment. Refresh and try again.')
    expect(reversalErrorSentence('PAYMENT_REVERSAL_PERMISSION_REQUIRED')).toBe('Only an agency principal or office admin can do this.')
    expect(reversalErrorSentence('PAYMENT_REVERSAL_TICKET_REQUIRED')).toBe('Add the support ticket reference.')
    expect(reversalErrorSentence('SOMETHING_ELSE')).toBe('Something went wrong. Try again.')
    for (const s of Object.values(REVERSAL_ERROR_SENTENCES)) expect(s).not.toMatch(/[A-Z]{2,}_[A-Z]/)
  })

  it('reversePayment posts to /api/payments/:id/reverse and returns the server row', async () => {
    const { reversePayment } = await load()
    const fetcher = vi.fn(async () => jsonResponse(200, { ok: true, payment: { id: 'pay-1', status: 'Due' }, auditEventId: 'ev-1' }))
    const res = await reversePayment(
      'pay-1',
      { reasonKind: 'WRONG_ROW', reason: 'Recorded on the wrong row', expectedUpdatedAt: '2026-10-30T08:00:00.000Z', requestId: 'r-1' },
      fetcher as unknown as typeof fetch,
    )
    expect(res).toEqual({ ok: true, payment: { id: 'pay-1', status: 'Due' }, auditEventId: 'ev-1' })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/payments\/pay-1\/reverse$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toMatchObject({ reasonKind: 'WRONG_ROW', requestId: 'r-1' })
  })

  it('a refusal carries the sentence and the other payments for a duplicate reopen', async () => {
    const { reopenPayment } = await load()
    const fetcher = vi.fn(async () => jsonResponse(409, { code: 'PAYMENT_REOPEN_DUPLICATE_ROW', message: 'x', otherPayments: ['pay-2'] }))
    const res = await reopenPayment(
      'pay-1',
      { reasonKind: 'STILL_OWED', reason: 'Tenant still owes this', expectedUpdatedAt: 'x', requestId: 'r-2' },
      fetcher as unknown as typeof fetch,
    )
    expect(res).toEqual({
      ok: false,
      status: 409,
      code: 'PAYMENT_REOPEN_DUPLICATE_ROW',
      message: 'Another payment already covers this. Open it instead of reopening this one.',
      otherPayments: ['pay-2'],
    })
  })

  it('history line: "Reversed by <name> on <date>: <reason>" with the reference as "…<last 4>"', async () => {
    const { historyLine } = await load()
    expect(
      historyLine({ id: 'e', type: 'payment_reversed_by_admin', createdAt: '2026-10-30T08:00:00.000Z', actorName: 'Lerato Nkosi', reasonKind: 'WRONG_ROW', reason: 'Wrong tenant row', referenceLast4: '7781' }),
    ).toBe('Reversed by Lerato Nkosi on 2026-10-30: Wrong tenant row (reference …7781)')
    expect(
      historyLine({ id: 'e', type: 'payment_reopened', createdAt: '2026-10-30T08:00:00.000Z', actorName: null, reasonKind: 'STILL_OWED', reason: 'Still owed by tenant', referenceLast4: null }),
    ).toBe('Reopened by an admin on 2026-10-30: Still owed by tenant')
  })

  it('form check: kind, 10 characters, ticket for break-glass, acknowledgement when needed', async () => {
    const { reversalFormProblem } = await load()
    const base = { reasonKind: 'WRONG_ROW', reason: 'Wrong tenant row', needsAck: false, acknowledged: false, needsTicket: false, ticket: '' }
    expect(reversalFormProblem(base)).toBeNull()
    expect(reversalFormProblem({ ...base, reasonKind: null })).toBe('Pick a reason from the list.')
    expect(reversalFormProblem({ ...base, reason: ' short ' })).toBe('Add a reason of at least 10 characters.')
    expect(reversalFormProblem({ ...base, needsTicket: true, ticket: ' ab ' })).toBe('Add the support ticket reference.')
    expect(reversalFormProblem({ ...base, needsAck: true })).toBe('Tick the box to confirm you understand the owner statement will change.')
  })

  it('paidInEarlierMonth is a client hint in SAST months', async () => {
    const { paidInEarlierMonth } = await load()
    const now = new Date('2026-10-15T10:00:00Z')
    expect(paidInEarlierMonth('2026-09-30', now)).toBe(true)
    expect(paidInEarlierMonth('2026-10-01', now)).toBe(false)
    expect(paidInEarlierMonth(null, now)).toBe(false)
  })
})
