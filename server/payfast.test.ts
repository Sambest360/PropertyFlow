import { describe, expect, it, vi } from 'vitest'
import {
  checkoutAmountCents,
  clientIpSettingsFromEnv,
  confirmItnWithPayfast,
  payfastConfigFromEnv,
  payfastEncode,
  payfastSignature,
  centsToAmount,
  amountToCents,
  buildCheckoutFields,
  resolveItnClientIp,
  verifyItn,
  PAYFAST_VALIDATE_URL,
  type PayfastConfig,
} from './payfast'

/**
 * PayFast's published custom-integration example
 * (https://developers.payfast.co.za/docs). These are documentation values,
 * not PropertyFlow merchant credentials.
 *
 * Parameter string + passphrase MD5: 8317e2bbd1ae2a6f4f36837e83be4ca9
 */
const PASSPHRASE = 'jt7NOE43FZPn'
const MERCHANT_ID = '10000100'
const MERCHANT_KEY = '46f0cd694581a'
const PUBLISHED_SIGNATURE = '8317e2bbd1ae2a6f4f36837e83be4ca9'
const PAYFAST_IP = '197.97.145.140'
const VECTOR_FIELDS = {
  merchant_id: MERCHANT_ID,
  merchant_key: MERCHANT_KEY,
  return_url: 'http://www.yourdomain.co.za/return.php',
  cancel_url: 'http://www.yourdomain.co.za/cancel.php',
  notify_url: 'http://www.yourdomain.co.za/notify.php',
  name_first: 'First Name',
  name_last: 'Last Name',
  email_address: 'test@test.com',
  m_payment_id: '1234',
  amount: '10.00',
  item_name: 'Order#123',
}

const SANDBOX: PayfastConfig = {
  merchantId: MERCHANT_ID,
  merchantKey: MERCHANT_KEY,
  passphrase: PASSPHRASE,
  processUrl: 'https://sandbox.payfast.co.za/eng/process',
  validateUrl: PAYFAST_VALIDATE_URL,
}

function signedItn(overrides: Record<string, string> = {}) {
  const fields = {
    ...VECTOR_FIELDS,
    payment_status: 'COMPLETE',
    amount_gross: '10.00',
    pf_payment_id: '1089250',
    ...overrides,
  }
  return { ...fields, signature: payfastSignature(fields, PASSPHRASE) }
}

describe('payfast core', () => {
  it('formats money both ways', () => {
    expect(centsToAmount(1000)).toBe('10.00')
    expect(centsToAmount(5)).toBe('0.05')
    expect(amountToCents('10.00')).toBe(1000)
    expect(amountToCents('10,00'.replace(',', '.'))).toBe(1000)
    expect(amountToCents('nonsense')).toBe(0)
  })

  it('encodes per PHP urlencode: specials %XX first, then space → +', () => {
    expect(payfastEncode('First Name')).toBe('First+Name')
    expect(payfastEncode('a+b c')).toBe('a%2Bb+c')
    expect(payfastEncode('muñeca')).toBe('mu%C3%B1eca')
    expect(payfastEncode('  pad  ')).toBe('pad')
    expect(payfastEncode('a/b:c?d')).toBe('a%2Fb%3Ac%3Fd')
  })

  it('matches PayFast published signature example', () => {
    expect(payfastSignature(VECTOR_FIELDS, PASSPHRASE)).toBe(PUBLISHED_SIGNATURE)
  })

  it('differs without a passphrase', () => {
    const withP = payfastSignature(VECTOR_FIELDS, PASSPHRASE)
    const withoutP = payfastSignature(VECTOR_FIELDS)
    expect(withoutP).not.toBe(withP)
    expect(withoutP).toMatch(/^[0-9a-f]{32}$/)
  })

  it('buildCheckoutFields signs the published vector and omits the passphrase', () => {
    const fields = buildCheckoutFields(SANDBOX, {
      paymentId: '1234',
      amountCents: 1000,
      itemName: 'Order#123',
      payer: { firstName: 'First Name', lastName: 'Last Name', email: 'test@test.com' },
      returnUrl: 'http://www.yourdomain.co.za/return.php',
      cancelUrl: 'http://www.yourdomain.co.za/cancel.php',
      notifyUrl: 'http://www.yourdomain.co.za/notify.php',
    })
    expect(fields.amount).toBe('10.00')
    expect(fields.signature).toBe(PUBLISHED_SIGNATURE)
    expect(fields.merchant_id).toBe(MERCHANT_ID)
    expect(fields).not.toHaveProperty('passphrase')
    expect(JSON.stringify(fields)).not.toContain(PASSPHRASE)
  })

  it('uses the ledger amount and ignores a client-supplied amount', () => {
    expect(checkoutAmountCents(10, 1)).toBe(1000)
    expect(checkoutAmountCents(10, 999999)).toBe(1000)
    expect(checkoutAmountCents(0, 100)).toBe(0)
  })

  it('refuses live mode when the passphrase is missing', () => {
    const prev = {
      id: process.env.PAYFAST_MERCHANT_ID,
      key: process.env.PAYFAST_MERCHANT_KEY,
      mode: process.env.PAYFAST_MODE,
      pass: process.env.PAYFAST_PASSPHRASE,
    }
    process.env.PAYFAST_MERCHANT_ID = MERCHANT_ID
    process.env.PAYFAST_MERCHANT_KEY = MERCHANT_KEY
    process.env.PAYFAST_MODE = 'live'
    delete process.env.PAYFAST_PASSPHRASE
    expect(payfastConfigFromEnv()).toBeNull()
    process.env.PAYFAST_PASSPHRASE = PASSPHRASE
    const live = payfastConfigFromEnv()
    expect(live?.processUrl).toBe('https://www.payfast.io/eng/process')
    expect(live?.validateUrl).toBe('https://www.payfast.co.za/eng/query/validate')
    if (prev.id == null) delete process.env.PAYFAST_MERCHANT_ID
    else process.env.PAYFAST_MERCHANT_ID = prev.id
    if (prev.key == null) delete process.env.PAYFAST_MERCHANT_KEY
    else process.env.PAYFAST_MERCHANT_KEY = prev.key
    if (prev.mode == null) delete process.env.PAYFAST_MODE
    else process.env.PAYFAST_MODE = prev.mode
    if (prev.pass == null) delete process.env.PAYFAST_PASSPHRASE
    else process.env.PAYFAST_PASSPHRASE = prev.pass
  })

  it('reads the platform IP header and ignores a spoofed first X-Forwarded-For hop', () => {
    expect(clientIpSettingsFromEnv({}).header).toBe('x-real-ip')
    const spoofed = resolveItnClientIp((name) => {
      if (name === 'x-forwarded-for') return `${PAYFAST_IP}, 203.0.113.9`
      if (name === 'x-real-ip') return '203.0.113.50'
      return undefined
    })
    expect(spoofed).toBe('203.0.113.50')
    const verdict = verifyItn(signedItn(), SANDBOX, {
      sourceIp: spoofed,
      expectedPaymentId: '1234',
      expectedAmountCents: 1000,
    })
    expect(verdict.ok).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/source IP/i)
  })

  it('uses the last trusted proxy hop when the platform header is absent', () => {
    const ip = resolveItnClientIp(
      (name) => (name === 'x-forwarded-for' ? `${PAYFAST_IP}, 198.51.100.10, 203.0.113.9` : undefined),
      { header: null, trustedProxyHops: 1 },
    )
    expect(ip).toBe('203.0.113.9')
    const twoHops = resolveItnClientIp(
      (name) => (name === 'x-forwarded-for' ? `${PAYFAST_IP}, 198.51.100.10, 203.0.113.9` : undefined),
      { header: null, trustedProxyHops: 2 },
    )
    expect(twoHops).toBe('198.51.100.10')
  })

  it('ITN: bad signature is rejected in sandbox', () => {
    const verdict = verifyItn(
      { ...signedItn(), signature: 'deadbeefdeadbeefdeadbeefdeadbeef' },
      SANDBOX,
      { sourceIp: PAYFAST_IP, expectedPaymentId: '1234', expectedAmountCents: 1000 },
    )
    expect(verdict.ok).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/signature/i)
  })

  it('ITN: missing signature is rejected in sandbox', () => {
    const { signature: _drop, ...unsigned } = signedItn()
    const verdict = verifyItn(unsigned, SANDBOX, {
      sourceIp: PAYFAST_IP,
      expectedPaymentId: '1234',
      expectedAmountCents: 1000,
    })
    expect(verdict.ok).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/signature/i)
  })

  it('ITN: wrong merchant id is rejected in sandbox', () => {
    const verdict = verifyItn(signedItn({ merchant_id: '10009999' }), SANDBOX, {
      sourceIp: PAYFAST_IP,
      expectedPaymentId: '1234',
      expectedAmountCents: 1000,
    })
    expect(verdict.ok).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/merchant_id/i)
  })

  it('ITN: wrong amount is rejected against the ledger', () => {
    const verdict = verifyItn(signedItn({ amount_gross: '9999.00' }), SANDBOX, {
      sourceIp: PAYFAST_IP,
      expectedPaymentId: '1234',
      expectedAmountCents: 1000,
    })
    expect(verdict.ok).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/amount/i)
  })

  it('ITN: valid COMPLETE notification passes merchant, amount and IP checks', () => {
    const verdict = verifyItn(signedItn(), SANDBOX, {
      sourceIp: PAYFAST_IP,
      expectedPaymentId: '1234',
      expectedAmountCents: 1000,
    })
    expect(verdict.ok).toBe(true)
  })

  it('ITN: missing or non-PayFast source IP is rejected in sandbox', () => {
    const missing = verifyItn(signedItn(), SANDBOX, {
      sourceIp: null,
      expectedPaymentId: '1234',
      expectedAmountCents: 1000,
    })
    expect(missing.ok).toBe(false)
    const foreign = verifyItn(signedItn(), SANDBOX, {
      sourceIp: '203.0.113.9',
      expectedPaymentId: '1234',
      expectedAmountCents: 1000,
    })
    expect(foreign.ok).toBe(false)
    expect((foreign as { reason: string }).reason).toMatch(/source IP/i)
  })

  it('validate postback is VALID only when PayFast returns that exact body', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe(PAYFAST_VALIDATE_URL)
      expect(String(url)).not.toContain('/eng/process')
      return new Response('VALID', { status: 200 })
    })
    const ok = await confirmItnWithPayfast(signedItn(), PAYFAST_VALIDATE_URL, fetchImpl as typeof fetch)
    expect(ok.valid).toBe(true)

    const invalid = await confirmItnWithPayfast(
      signedItn(),
      PAYFAST_VALIDATE_URL,
      (async () => new Response('INVALID', { status: 200 })) as typeof fetch,
    )
    expect(invalid.valid).toBe(false)

    const failed = await confirmItnWithPayfast(
      signedItn(),
      PAYFAST_VALIDATE_URL,
      (async () => {
        throw new Error('network down')
      }) as typeof fetch,
    ).catch((err: unknown) => err)
    expect(failed).toBeInstanceOf(Error)
  })
})
