// @vitest-environment happy-dom
/**
 * Pin for startPayfastCheckout (plan T5): body shape, credentials, the hidden
 * form posts to the SERVER's processUrl with the SERVER's fields, and every
 * failure (403, 409, 404, network) returns a mapped message without
 * submitting anything. fetch is stubbed: no network, no PayFast contact.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startPayfastCheckout } from './checkout'

const PROCESS_URL = 'https://process.example.invalid/eng/process'
let submitted: HTMLFormElement[] = []

function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

beforeEach(() => {
  submitted = []
  vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
    submitted.push(this)
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('startPayfastCheckout', () => {
  it('POSTs {paymentId, itemName} with credentials and submits the server-signed form', async () => {
    const fetchMock = vi.fn(async () =>
      res(200, { ok: true, processUrl: PROCESS_URL, fields: { m_payment_id: 'PAY-abc', signature: 'srv' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const r = await startPayfastCheckout('PAY-abc', { itemName: 'Lekaya · Deposit' })
    expect(r.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/payfast/create')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(JSON.parse(String(init.body))).toEqual({ paymentId: 'PAY-abc', itemName: 'Lekaya · Deposit' })
    expect(submitted).toHaveLength(1)
    expect(submitted[0].action).toBe(PROCESS_URL)
    expect(submitted[0].method.toUpperCase()).toBe('POST')
    const inputs = Array.from(submitted[0].querySelectorAll('input')).map((i) => [i.name, i.value])
    expect(inputs).toEqual([
      ['m_payment_id', 'PAY-abc'],
      ['signature', 'srv'],
    ])
  })

  const failures: Array<[string, () => Promise<Response>, string]> = [
    ['403 payment_not_yours', async () => res(403, { ok: false, error: 'payment_not_yours' }), 'You can only pay your own payments.'],
    ['409 payment_already_paid', async () => res(409, { ok: false, error: 'payment_already_paid' }), 'This payment is already marked paid.'],
    ['404 payment_not_found', async () => res(404, { ok: false, error: 'payment_not_found' }), 'This payment could not be found on the ledger.'],
    ['network error', async () => { throw new TypeError('Failed to fetch') }, 'We could not reach the payment server. Check your connection and try again.'],
  ]
  for (const [name, impl, message] of failures) {
    it(`${name}: mapped message, no form submitted`, async () => {
      vi.stubGlobal('fetch', vi.fn(impl))
      const r = await startPayfastCheckout('PAY-abc')
      expect(r.ok).toBe(false)
      expect(r.userMessage).toBe(message)
      expect(submitted).toHaveLength(0)
      expect(document.querySelectorAll('form')).toHaveLength(0)
    })
  }
})
