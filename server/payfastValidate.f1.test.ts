import { describe, expect, it, vi } from 'vitest'
import { PAYFAST_LIVE_PROCESS_URL, PAYFAST_PROCESS_URL, type PayfastConfig } from './payfast.js'

/**
 * F1: PayFast ITN server-to-server confirmation (developer docs, Custom
 * Integration, step 4.3 "Perform a server request to confirm the details",
 * read 30 Oct 2026). Only the injected fetch is faked. All merchant values
 * here are obviously fake.
 */
const mod = await import('./payfastValidate.js')
const { confirmItnWithPayfast, payfastValidateUrl, validateParamString } = mod

const LIVE: PayfastConfig = { merchantId: 'FAKE-1', merchantKey: 'fake-key', processUrl: PAYFAST_LIVE_PROCESS_URL }
const SANDBOX: PayfastConfig = { merchantId: 'FAKE-1', merchantKey: 'fake-key', processUrl: PAYFAST_PROCESS_URL }

const ITN: Record<string, string> = {
  m_payment_id: 'PAY-1',
  pf_payment_id: '900001',
  payment_status: 'COMPLETE',
  item_name: 'Rent May / Unit 4',
  item_description: '',
  amount_gross: '1850.00',
  amount_fee: '-42.00',
  merchant_id: 'FAKE-1',
  signature: 'ffffffffffffffffffffffffffffffff',
}

type Call = { url: string; init: RequestInit }
function fakeFetch(reply: () => Promise<Response>) {
  const calls: Call[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return reply()
  })
  return { fn: fn as unknown as typeof fetch, calls }
}
const reply = (body: string, status = 200) => async () => new Response(body, { status })

describe('F1 validate host follows PAYFAST_MODE (via config.processUrl)', () => {
  it('live config posts to www.payfast.co.za', () => {
    expect(payfastValidateUrl(LIVE)).toBe('https://www.payfast.co.za/eng/query/validate')
  })
  it('sandbox config, and a config with no processUrl, post to sandbox.payfast.co.za', () => {
    expect(payfastValidateUrl(SANDBOX)).toBe('https://sandbox.payfast.co.za/eng/query/validate')
    expect(payfastValidateUrl({ merchantId: 'x', merchantKey: 'y' })).toBe('https://sandbox.payfast.co.za/eng/query/validate')
  })
  it('the call really goes to the mode host', async () => {
    const live = fakeFetch(reply('VALID'))
    await confirmItnWithPayfast(ITN, LIVE, { fetch: live.fn })
    expect(live.calls[0]?.url).toBe('https://www.payfast.co.za/eng/query/validate')
    const sb = fakeFetch(reply('VALID'))
    await confirmItnWithPayfast(ITN, SANDBOX, { fetch: sb.fn })
    expect(sb.calls[0]?.url).toBe('https://sandbox.payfast.co.za/eng/query/validate')
  })
})

describe('F1 validate request body (docs: every posted field except signature, received order, PHP urlencode)', () => {
  it('keeps received order, keeps empty values, drops signature, PHP-encodes (space +, / %2F)', () => {
    expect(validateParamString(ITN)).toBe(
      'm_payment_id=PAY-1&pf_payment_id=900001&payment_status=COMPLETE&item_name=Rent+May+%2F+Unit+4&item_description=&amount_gross=1850.00&amount_fee=-42.00&merchant_id=FAKE-1',
    )
  })
  it('does not reorder alphabetically', () => {
    expect(validateParamString({ z: '1', a: '2' })).toBe('z=1&a=2')
  })
  it('does not trim values (PayFast compares the exact data it sent)', () => {
    expect(validateParamString({ item_name: ' Rent ' })).toBe('item_name=+Rent+')
  })
  it('encodes ~ * and non-ASCII the PHP way', () => {
    expect(validateParamString({ n: 'a~b*c', s: 'Zoë' })).toBe('n=a%7Eb%2Ac&s=Zo%C3%AB')
  })
  it('a field posted after the signature is still sent (so PayFast judges it, not us)', () => {
    expect(validateParamString({ a: '1', signature: 's', m_payment_id: 'PAY-9' })).toBe('a=1&m_payment_id=PAY-9')
  })
  it('the fetch is a form POST of exactly that string, no redirects followed, with an abort signal', async () => {
    const f = fakeFetch(reply('VALID'))
    await confirmItnWithPayfast(ITN, LIVE, { fetch: f.fn })
    expect(f.calls).toHaveLength(1)
    const init = f.calls[0]!.init
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('content-type')).toBe('application/x-www-form-urlencoded')
    expect(init.body).toBe(validateParamString(ITN))
    expect(String(init.body)).not.toContain('signature')
    expect(init.redirect).toBe('error')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('F1 verdicts: only an HTTP 200 with body VALID passes; everything else fails closed', () => {
  it('VALID → ok', async () => {
    expect(await confirmItnWithPayfast(ITN, LIVE, { fetch: fakeFetch(reply('VALID')).fn })).toEqual({ ok: true })
  })
  it('VALID with surrounding whitespace/newline → ok', async () => {
    expect(await confirmItnWithPayfast(ITN, LIVE, { fetch: fakeFetch(reply('VALID\n')).fn })).toEqual({ ok: true })
  })
  it('INVALID → rejected, not retryable', async () => {
    expect(await confirmItnWithPayfast(ITN, LIVE, { fetch: fakeFetch(reply('INVALID')).fn })).toEqual({
      ok: false,
      retryable: false,
      reason: 'PayFast validate replied INVALID',
    })
  })
  it('network error → rejected, retryable', async () => {
    const r = await confirmItnWithPayfast(ITN, LIVE, {
      fetch: fakeFetch(async () => {
        throw new TypeError('fetch failed')
      }).fn,
    })
    expect(r).toEqual({ ok: false, retryable: true, reason: 'PayFast validate request failed' })
  })
  it('timeout → aborts the request and rejects, retryable', async () => {
    let aborted = false
    const hang = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true
            reject(new DOMException('aborted', 'AbortError'))
          })
        }),
    ) as unknown as typeof fetch
    const r = await confirmItnWithPayfast(ITN, LIVE, { fetch: hang, timeoutMs: 20 })
    expect(aborted).toBe(true)
    expect(r).toEqual({ ok: false, retryable: true, reason: 'PayFast validate timed out after 20 ms' })
  })
  it('a fetch that ignores the abort signal still times out', async () => {
    const r = await confirmItnWithPayfast(ITN, LIVE, {
      fetch: (() => new Promise<Response>(() => {})) as unknown as typeof fetch,
      timeoutMs: 20,
    })
    expect(r).toEqual({ ok: false, retryable: true, reason: 'PayFast validate timed out after 20 ms' })
  })
  it('the default timeout is short (5-10 s)', () => {
    expect(mod.PAYFAST_VALIDATE_TIMEOUT_MS).toBeGreaterThanOrEqual(5000)
    expect(mod.PAYFAST_VALIDATE_TIMEOUT_MS).toBeLessThanOrEqual(10_000)
  })
  it.each([500, 503, 404, 302])('HTTP %i (even with body VALID) → rejected, retryable', async (status) => {
    const r = await confirmItnWithPayfast(ITN, LIVE, { fetch: fakeFetch(async () => new Response('VALID', { status })).fn })
    expect(r).toEqual({ ok: false, retryable: true, reason: `PayFast validate answered HTTP ${status}` })
  })
  it.each(['', 'valid', 'VALIDX', 'VALID VALID', '<html>VALID</html>', 'OK', 'x'.repeat(5000) + 'VALID'])(
    'malformed body %j → rejected, retryable',
    async (body) => {
      const r = await confirmItnWithPayfast(ITN, LIVE, { fetch: fakeFetch(reply(body)).fn })
      expect(r).toEqual({ ok: false, retryable: true, reason: 'PayFast validate reply was not VALID or INVALID' })
    },
  )
  it('one call per ITN: no retry loop on failure', async () => {
    const f = fakeFetch(async () => {
      throw new TypeError('fetch failed')
    })
    await confirmItnWithPayfast(ITN, LIVE, { fetch: f.fn })
    expect(f.calls).toHaveLength(1)
  })
  it('the reason never carries the reply body, the signature or ITN values', async () => {
    const r = await confirmItnWithPayfast(ITN, LIVE, { fetch: fakeFetch(reply('secret-ish reply text')).fn })
    const text = JSON.stringify(r)
    for (const bad of ['secret-ish', ITN.signature!, '1850.00', 'Rent May']) expect(text).not.toContain(bad)
  })
})
