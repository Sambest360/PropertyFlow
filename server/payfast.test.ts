import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  checkoutAmountCents,
  clientIpSettingsFromEnv,
  confirmItnWithPayfast,
  payfastConfigFromEnv,
  payfastEncode,
  payfastSignature,
  payfastSignatureSource,
  centsToAmount,
  amountToCents,
  buildCheckoutFields,
  resolveItnClientIp,
  validatePlanFromEnv,
  verifyItn,
  PAYFAST_VALIDATE_URL,
  type PayfastConfig,
} from './payfast'

/** Clearly fake merchant values. The passphrase is generated when the test loads. */
const MERCHANT_ID = 'fake-merchant-id'
const MERCHANT_KEY = 'fake-merchant-key'
const PASSPHRASE = randomBytes(12).toString('hex')
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

/** Hand-written parameter string for VECTOR_FIELDS, in posted order, PHP-urlencode. */
const VECTOR_PARAM_STRING =
  'merchant_id=fake-merchant-id&merchant_key=fake-merchant-key&return_url=http%3A%2F%2Fwww.yourdomain.co.za%2Freturn.php&cancel_url=http%3A%2F%2Fwww.yourdomain.co.za%2Fcancel.php&notify_url=http%3A%2F%2Fwww.yourdomain.co.za%2Fnotify.php&name_first=First+Name&name_last=Last+Name&email_address=test%40test.com&m_payment_id=1234&amount=10.00&item_name=Order%23123'

function phpUrlEncode(value: string): string {
  const bytes = Buffer.from(value.trim(), 'utf8')
  let out = ''
  for (const byte of bytes) {
    const digit = byte >= 48 && byte <= 57
    const upper = byte >= 65 && byte <= 90
    const lower = byte >= 97 && byte <= 122
    const unreserved = digit || upper || lower || byte === 45 || byte === 95 || byte === 46
    if (unreserved) out += String.fromCharCode(byte)
    else if (byte === 32) out += '+'
    else out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

function independentSignature(): string {
  const source = `${VECTOR_PARAM_STRING}&passphrase=${phpUrlEncode(PASSPHRASE)}`
  return createHash('md5').update(source).digest('hex')
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

  it('builds the PayFast parameter string and signs it with an independent MD5', () => {
    expect(payfastSignatureSource(VECTOR_FIELDS)).toBe(VECTOR_PARAM_STRING)
    expect(payfastSignature(VECTOR_FIELDS, PASSPHRASE)).toBe(independentSignature())
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
    expect(fields.signature).toBe(independentSignature())
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

  it('reads only the platform IP and ignores every caller forwarding header', () => {
    expect(clientIpSettingsFromEnv({}).header).toBe('x-real-ip')
    const caller = (name: string) => {
      if (name === 'x-forwarded-for') return PAYFAST_IP
      if (name === 'forwarded') return `for=${PAYFAST_IP}`
      if (name === 'x-client-ip') return PAYFAST_IP
      if (name === 'x-real-ip') return '203.0.113.50'
      return undefined
    }
    expect(resolveItnClientIp(caller)).toBe('203.0.113.50')
    expect(resolveItnClientIp((name) => (name === 'x-real-ip' ? undefined : caller(name)))).toBeNull()
    const listed = resolveItnClientIp((name) =>
      name === 'x-real-ip' ? `${PAYFAST_IP}, 203.0.113.50` : undefined,
    )
    expect(listed).toBeNull()
    const verdict = verifyItn(signedItn(), SANDBOX, {
      sourceIp: '203.0.113.50',
      expectedPaymentId: '1234',
      expectedAmountCents: 1000,
    })
    expect(verdict.ok).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/source IP/i)
  })

  it('uses the last trusted hop only when that header is the configured platform source', () => {
    const absent = resolveItnClientIp(
      (name) => (name === 'x-forwarded-for' ? `${PAYFAST_IP}, 198.51.100.10, 203.0.113.9` : undefined),
      {
        header: null,
        trustedProxyHops: 1,
        localMode: false,
        harnessSecret: null,
        harnessIpHeader: 'x-pf-platform-ip',
        harnessSecretHeader: 'x-pf-platform-secret',
        fixedPlatformIp: null,
      },
    )
    expect(absent).toBeNull()
    const headers = (name: string) => {
      if (name === 'x-forwarded-for') return `${PAYFAST_IP}, 198.51.100.10, 203.0.113.9`
      if (name === 'forwarded') return `for=${PAYFAST_IP}`
      if (name === 'x-client-ip') return PAYFAST_IP
      return undefined
    }
    const settings = {
      header: 'x-forwarded-for',
      trustedProxyHops: 1,
      localMode: false,
      harnessSecret: null,
      harnessIpHeader: 'x-pf-platform-ip',
      harnessSecretHeader: 'x-pf-platform-secret',
      fixedPlatformIp: null,
    }
    expect(resolveItnClientIp(headers, settings)).toBe('203.0.113.9')
    expect(resolveItnClientIp(headers, { ...settings, trustedProxyHops: 2 })).toBe('198.51.100.10')
    expect(
      resolveItnClientIp(
        (name) => (name === 'forwarded' ? `for=${PAYFAST_IP}, for=203.0.113.9` : undefined),
        { ...settings, header: 'forwarded' },
      ),
    ).toBe('203.0.113.9')
  })

  it('local mode takes the secret-gated platform address and ignores caller headers', () => {
    const env = {
      PAYFAST_ITN_LOCAL: '1',
      PAYFAST_ITN_PLATFORM_SECRET: 'qa-secret',
      PAYFAST_CLIENT_IP_HEADER: 'x-real-ip',
    }
    const headers = (name: string) => {
      if (name === 'x-pf-platform-secret') return 'qa-secret'
      if (name === 'x-pf-platform-ip') return '203.0.113.50'
      if (name === 'x-real-ip' || name === 'x-forwarded-for' || name === 'x-client-ip') return PAYFAST_IP
      if (name === 'forwarded') return `for=${PAYFAST_IP}`
      return undefined
    }
    expect(resolveItnClientIp(headers, clientIpSettingsFromEnv(env))).toBe('203.0.113.50')
    const withoutSecret = (name: string) => (name === 'x-pf-platform-secret' ? undefined : headers(name))
    expect(resolveItnClientIp(withoutSecret, clientIpSettingsFromEnv(env))).toBeNull()
    const production = clientIpSettingsFromEnv({ ...env, PAYFAST_ITN_LOCAL: '0' })
    expect(resolveItnClientIp(headers, production)).toBe(PAYFAST_IP)
  })

  it('validate stub is honored only in local mode with the platform secret', () => {
    const header = (name: string) => {
      if (name === 'x-pf-platform-secret') return 'qa-secret'
      if (name === 'x-pf-validate-stub') return 'INVALID'
      return undefined
    }
    const local = {
      PAYFAST_ITN_LOCAL: '1',
      PAYFAST_ITN_PLATFORM_SECRET: 'qa-secret',
      PAYFAST_VALIDATE_STUB: '1',
      PAYFAST_VALIDATE_URL: 'http://127.0.0.1:8799/validate',
    }
    expect(validatePlanFromEnv(header, local)).toEqual({ kind: 'stub', result: 'INVALID' })
    expect(validatePlanFromEnv(header, { ...local, PAYFAST_ITN_LOCAL: '0' })).toEqual({
      kind: 'stub',
      result: 'ERROR',
    })
    expect(validatePlanFromEnv(() => undefined, { PAYFAST_VALIDATE_URL: 'http://127.0.0.1:8799/validate' })).toEqual({
      kind: 'fetch',
      url: 'http://127.0.0.1:8799/validate',
    })
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

  it('ITN: an amount one cent off the ledger is rejected', () => {
    const verdict = verifyItn(signedItn({ amount_gross: '10.01' }), SANDBOX, {
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
