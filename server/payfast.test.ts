import { describe, expect, it } from 'vitest'
import {
  checkoutAmountCents,
  payfastConfigFromEnv,
  payfastEncode,
  payfastSignature,
  payfastSignatureSource,
  centsToAmount,
  amountToCents,
  buildCheckoutFields,
  verifyItn,
} from './payfast'

/**
 * Vector generated independently by scripts/payfast-vector.mjs from the
 * canonical PayFast field order + PHP urlencode rules.
 */
const PASSPHRASE = 'QjjCCNZ1VgtYaxivmXOWLmAlunZpU0Xk'
const VECTOR_FIELDS = {
  merchant_id: '10047719',
  merchant_key: 'wkq8dmfysau1q',
  return_url: 'https://pf.demo/pay/return',
  cancel_url: 'https://pf.demo/pay/cancel',
  notify_url: 'https://pf.demo/api/payfast/itn',
  name_first: 'Thandiwe',
  name_last: 'Mokoena',
  email_address: 'thandiwe@example.com',
  m_payment_id: 'PAY-1',
  amount: '1850.00',
  item_name: 'Rent October',
}

describe('payfast core', () => {
  it('formats money both ways', () => {
    expect(centsToAmount(185000)).toBe('1850.00')
    expect(centsToAmount(5)).toBe('0.05')
    expect(amountToCents('1850.00')).toBe(185000)
    expect(amountToCents('1850,00'.replace(',', '.'))).toBe(185000)
    expect(amountToCents('nonsense')).toBe(0)
  })

  it('encodes per PHP urlencode: specials %XX first, then space → +', () => {
    expect(payfastEncode('Rent October')).toBe('Rent+October')
    expect(payfastEncode('a+b c')).toBe('a%2Bb+c') // literal + must become %2B
    expect(payfastEncode('muñeca')).toBe('mu%C3%B1eca') // UTF-8 byte-wise
    expect(payfastEncode('  pad  ')).toBe('pad')
    expect(payfastEncode('a/b:c?d')).toBe('a%2Fb%3Ac%3Fd')
  })

  it('signs in POSTED order + passphrase (verified against sandbox process URL)', () => {
    // PayFast's own PHP sample iterates $_POST as received; alphabetical order
    // is REJECTED by the live sandbox (verified 2026-09-18, merchant 10047719).
    expect(payfastSignature(VECTOR_FIELDS, PASSPHRASE)).toBe('be9ccda1a048156e5a9443664b2a751e')
  })

  it('differs without a passphrase', () => {
    const withP = payfastSignature(VECTOR_FIELDS, PASSPHRASE)
    const withoutP = payfastSignature(VECTOR_FIELDS)
    expect(withoutP).not.toBe(withP)
    expect(withoutP).toMatch(/^[0-9a-f]{32}$/)
  })

  it('buildCheckoutFields signs all fields and formats amount from cents', () => {
    const fields = buildCheckoutFields(
      {
        merchantId: '10047719',
        merchantKey: 'wkq8dmfysau1q',
        passphrase: PASSPHRASE,
        processUrl: 'https://sandbox.payfast.co.za/eng/process',
      },
      {
        paymentId: 'PAY-1',
        amountCents: 185000,
        itemName: 'Rent October',
        payer: { firstName: 'Thandiwe', lastName: 'Mokoena', email: 'thandiwe@example.com' },
        returnUrl: 'https://pf.demo/pay/return',
        cancelUrl: 'https://pf.demo/pay/cancel',
        notifyUrl: 'https://pf.demo/api/payfast/itn',
      },
    )
    expect(fields.amount).toBe('1850.00')
    expect(fields.signature).toBe('be9ccda1a048156e5a9443664b2a751e')
    expect(fields.m_payment_id).toBe('PAY-1')
    expect(fields.item_name).toBe('Rent October')
  })

  it('ITN: valid COMPLETE notification passes with amount check', () => {
    const itn = { ...VECTOR_FIELDS, payment_status: 'COMPLETE', amount_gross: '1850.00' }
    const signed = payfastSignature(itn, PASSPHRASE)
    const verdict = verifyItn(
      { ...itn, signature: signed },
      { merchantId: '10047719', merchantKey: 'wkq8dmfysau1q', passphrase: PASSPHRASE },
      { sourceIp: '197.97.145.140', expectedPaymentId: 'PAY-1', expectedAmountCents: 185000 },
    )
    expect(verdict.ok).toBe(true)
  })

  it('ITN: tampered amount fails amount reconciliation', () => {
    // Re-sign the tampered payload so the signature is internally valid but
    // disagrees with the ledger amount — must fail on amount, not signature.
    const tampered = { ...VECTOR_FIELDS, payment_status: 'COMPLETE', amount_gross: '9999.00' }
    const signed = payfastSignature(tampered, PASSPHRASE)
    const verdict = verifyItn(
      { ...tampered, signature: signed },
      { merchantId: '10047719', merchantKey: 'wkq8dmfysau1q', passphrase: PASSPHRASE },
      { sourceIp: null, expectedPaymentId: 'PAY-1', expectedAmountCents: 185000 },
    )
    expect(verdict.ok).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/amount/i)
  })

  it('uses the ledger amount and ignores a client-supplied amount', () => {
    expect(checkoutAmountCents(1850, 1)).toBe(185000)
    expect(checkoutAmountCents(1850, 999999)).toBe(185000)
    expect(checkoutAmountCents(0, 100)).toBe(0)
  })

  it('refuses live mode when the passphrase is missing', () => {
    const prev = {
      id: process.env.PAYFAST_MERCHANT_ID,
      key: process.env.PAYFAST_MERCHANT_KEY,
      mode: process.env.PAYFAST_MODE,
      pass: process.env.PAYFAST_PASSPHRASE,
    }
    process.env.PAYFAST_MERCHANT_ID = '10047719'
    process.env.PAYFAST_MERCHANT_KEY = 'wkq8dmfysau1q'
    process.env.PAYFAST_MODE = 'live'
    delete process.env.PAYFAST_PASSPHRASE
    expect(payfastConfigFromEnv()).toBeNull()
    process.env.PAYFAST_PASSPHRASE = PASSPHRASE
    expect(payfastConfigFromEnv()?.processUrl).toBe('https://www.payfast.io/eng/process')
    if (prev.id == null) delete process.env.PAYFAST_MERCHANT_ID
    else process.env.PAYFAST_MERCHANT_ID = prev.id
    if (prev.key == null) delete process.env.PAYFAST_MERCHANT_KEY
    else process.env.PAYFAST_MERCHANT_KEY = prev.key
    if (prev.mode == null) delete process.env.PAYFAST_MODE
    else process.env.PAYFAST_MODE = prev.mode
    if (prev.pass == null) delete process.env.PAYFAST_PASSPHRASE
    else process.env.PAYFAST_PASSPHRASE = prev.pass
  })

  it('ITN: missing source IP is rejected in live mode', () => {
    const itn = { ...VECTOR_FIELDS, payment_status: 'COMPLETE', amount_gross: '1850.00' }
    const signed = payfastSignature(itn, PASSPHRASE)
    const verdict = verifyItn(
      { ...itn, signature: signed },
      {
        merchantId: '10047719',
        merchantKey: 'wkq8dmfysau1q',
        passphrase: PASSPHRASE,
        processUrl: 'https://www.payfast.io/eng/process',
      },
      { sourceIp: null, expectedPaymentId: 'PAY-1', expectedAmountCents: 185000 },
    )
    expect(verdict.ok).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/source IP/i)
  })

  it('ITN: bad source IP rejected in live mode', () => {
    const verdict = verifyItn(
      { m_payment_id: 'PAY-1', signature: 'x' },
      {
        merchantId: '10047719',
        merchantKey: 'wkq8dmfysau1q',
        processUrl: 'https://www.payfast.io/eng/process',
      },
      { sourceIp: '203.0.113.9' },
    )
    expect(verdict.ok).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/source IP/i)
  })

  it('ITN: sandbox mode relaxes the IP allowlist but keeps signature checks', () => {
    const itn = { ...VECTOR_FIELDS, payment_status: 'COMPLETE', amount_gross: '1850.00' }
    const signed = payfastSignature(itn, PASSPHRASE)
    const verdict = verifyItn(
      { ...itn, signature: signed },
      { merchantId: '10047719', merchantKey: 'wkq8dmfysau1q', passphrase: PASSPHRASE },
      { sourceIp: '203.0.113.9', expectedPaymentId: 'PAY-1', expectedAmountCents: 185000 },
    )
    expect(verdict.ok).toBe(true)
  })

  it('ITN: CANCELLED accepted but amount check skipped', () => {
    const itn = { ...VECTOR_FIELDS, payment_status: 'CANCELLED', amount_gross: '0.00' }
    const signed = payfastSignature(itn, PASSPHRASE)
    const verdict = verifyItn(
      { ...itn, signature: signed },
      { merchantId: '10047719', merchantKey: 'wkq8dmfysau1q', passphrase: PASSPHRASE },
      { sourceIp: null, expectedPaymentId: 'PAY-1', expectedAmountCents: 185000 },
    )
    expect(verdict.ok).toBe(true)
    expect((verdict as { status: string }).status).toBe('CANCELLED')
  })
})
