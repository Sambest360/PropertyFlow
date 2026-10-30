import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PayFast ITN receipt email: server/db.ts query() resolves to a plain row
 * array (result.rows), not a pg QueryResult. The receipt lookup must read
 * payer[0], not payer.rows[0] — otherwise no receipt is ever sent.
 *
 * Only the mailer and the network edges are mocked; query() returns the same
 * shape the real helper returns.
 */
const PAYMENT_UUID = '11111111-1111-4111-8111-111111111111'
const PARTY_USER_ID = '22222222-2222-4222-8222-222222222222'

const sendPaymentReceipt = vi.fn(async (_input: unknown) => undefined)
vi.mock('./mailtrap.js', () => ({
  sendPaymentReceipt: (input: unknown) => sendPaymentReceipt(input),
}))

const query = vi.fn(async (text: string, _params?: unknown[]): Promise<unknown[]> => {
  if (text.includes('FROM payments')) {
    return [
      {
        id: PAYMENT_UUID,
        amount: '1850.00',
        status: 'DUE',
        payment_type: 'Rent',
        party_name: 'Thandiwe Mokoena',
        party_user_id: PARTY_USER_ID,
        client_id: null,
        unit_id: null,
      },
    ]
  }
  if (text.includes('FROM users')) {
    return [{ email: 'thandiwe@example.com', first_name: 'Thandiwe' }]
  }
  return []
})
const clientQuery = vi.fn(async () => ({ rowCount: 1, rows: [] }))
vi.mock('./db.js', () => ({
  query: (text: string, params?: unknown[]) => query(text, params),
  withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({ query: clientQuery }),
}))

vi.mock('./entityMap.js', () => ({
  resolveUuid: vi.fn(async () => PAYMENT_UUID),
}))

// F1: the ITN handler confirms with PayFast's /eng/query/validate before any
// write. This file tests the receipt, so PayFast's reply is a stubbed VALID.
vi.stubGlobal('fetch', vi.fn(async () => new Response('VALID', { status: 200 })))

vi.mock('./payfast.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./payfast.js')>()
  return {
    ...actual,
    payfastConfigFromEnv: () => ({ merchantId: 'm', merchantKey: 'k', passphrase: 'p' }),
    verifyItn: () => ({
      ok: true,
      status: 'COMPLETE',
      raw: { pf_payment_id: '987654', payment_status: 'COMPLETE' },
    }),
  }
})

const { payfastItn } = await import('./payfastRoutes.js')

function app() {
  const a = new Hono()
  a.post('/api/payfast/itn', (c) => payfastItn(c))
  return a
}

describe('PayFast ITN receipt email', () => {
  beforeEach(() => {
    sendPaymentReceipt.mockClear()
    query.mockClear()
    clientQuery.mockClear()
  })

  it('sends the receipt to the payer row query() returns', async () => {
    const res = await app().request('/api/payfast/itn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ m_payment_id: 'PAY-1', payment_status: 'COMPLETE', signature: 'x' }),
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ITN accepted')

    // The receipt runs fire-and-forget after the reply.
    await vi.waitFor(() => expect(sendPaymentReceipt).toHaveBeenCalledTimes(1))
    expect(sendPaymentReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'thandiwe@example.com',
        payerName: 'Thandiwe',
        paymentId: 'PAY-1',
        amountDisplay: 'R1850.00',
        status: 'COMPLETE',
      }),
    )
    const usersCall = query.mock.calls.find(([text]) => text.includes('FROM users'))
    expect(usersCall?.[1]).toEqual([PARTY_USER_ID])
  })

  it('in-app notification body says "paid via PayFast"', async () => {
    await app().request('/api/payfast/itn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ m_payment_id: 'PAY-1', payment_status: 'COMPLETE', signature: 'x' }),
    })
    const insert = clientQuery.mock.calls.find((call) =>
      String((call as unknown[])[0]).includes('INSERT INTO notifications'),
    ) as unknown[] | undefined
    const params = insert?.[1] as string[] | undefined
    expect(params?.[3]).toBe('Rent of R1850.00 for Thandiwe Mokoena — paid via PayFast.')
  })
})
