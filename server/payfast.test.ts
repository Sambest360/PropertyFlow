import { describe, expect, it } from 'vitest'
import {
  payfastEncode,
  payfastSignature,
  payfastSignatureSource,
  centsToAmount,
  amountToCents,
  buildCheckoutFields,
  verifyItn,
  PAYFAST_LIVE_PROCESS_URL,
  PAYFAST_PROCESS_URL,
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
      { merchantId: '10047719', merchantKey: 'wkq8dmfysau1q', passphrase: PASSPHRASE, processUrl: PAYFAST_LIVE_PROCESS_URL },
      { sourceIp: '197.97.145.150', expectedPaymentId: 'PAY-1', expectedAmountCents: 185000 },
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
      { merchantId: '10047719', merchantKey: 'wkq8dmfysau1q', passphrase: PASSPHRASE, processUrl: PAYFAST_LIVE_PROCESS_URL },
      { sourceIp: '197.97.145.150', expectedPaymentId: 'PAY-1', expectedAmountCents: 185000 },
    )
    expect(verdict.ok).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/amount/i)
  })

  it('ITN: bad source IP rejected in live mode', () => {
    const verdict = verifyItn(
      { m_payment_id: 'PAY-1', signature: 'x' },
      {
        merchantId: '10047719',
        merchantKey: 'wkq8dmfysau1q',
        processUrl: 'https://www.payfast.co.za/eng/process',
      },
      { sourceIp: '203.0.113.9' },
    )
    expect(verdict.ok).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/source IP/i)
  })

  it('ITN (H1): sandbox has no IP skip; a non-range IP passes only as a resolved sandbox address', () => {
    const itn = { ...VECTOR_FIELDS, payment_status: 'COMPLETE', amount_gross: '1850.00' }
    const body = { ...itn, signature: payfastSignature(itn, PASSPHRASE) }
    const sandbox = { merchantId: '10047719', merchantKey: 'wkq8dmfysau1q', passphrase: PASSPHRASE, processUrl: PAYFAST_PROCESS_URL }
    const exp = { expectedPaymentId: 'PAY-1', expectedAmountCents: 185000 }
    expect(verifyItn(body, sandbox, { sourceIp: '203.0.113.9', sandboxAddresses: new Set(['198.18.0.10']), ...exp }).ok).toBe(false)
    expect(verifyItn(body, sandbox, { sourceIp: '198.18.0.10', sandboxAddresses: new Set(['198.18.0.10']), ...exp }).ok).toBe(true)
    expect(verifyItn(body, sandbox, { sourceIp: '197.97.145.150', sandboxAddresses: new Set(), ...exp }).ok).toBe(true)
    // No lookup result (failed or never made): fail closed.
    expect(verifyItn(body, sandbox, { sourceIp: '198.18.0.10', sandboxAddresses: null, ...exp }).ok).toBe(false)
    expect(verifyItn(body, sandbox, { sourceIp: '197.97.145.150', ...exp }).ok).toBe(false)
  })

  it('ITN (H1): live mode ignores sandbox addresses, and rejects a missing or unknown source IP', () => {
    const itn = { ...VECTOR_FIELDS, payment_status: 'COMPLETE', amount_gross: '1850.00' }
    const body = { ...itn, signature: payfastSignature(itn, PASSPHRASE) }
    const live = { merchantId: '10047719', merchantKey: 'wkq8dmfysau1q', passphrase: PASSPHRASE, processUrl: PAYFAST_LIVE_PROCESS_URL }
    expect(verifyItn(body, live, { sourceIp: '198.18.0.10', sandboxAddresses: new Set(['198.18.0.10']) }).ok).toBe(false)
    expect(verifyItn(body, live, { sourceIp: 'unknown' }).ok).toBe(false)
    expect(verifyItn(body, live, { sourceIp: '' }).ok).toBe(false)
    expect(verifyItn(body, live, { sourceIp: '::ffff:197.97.145.150' }).ok).toBe(true)
  })

  it('ITN (H1): merchant_id must equal the configured merchant id', () => {
    const itn = { ...VECTOR_FIELDS, merchant_id: 'FAKE-OTHER-MERCHANT', payment_status: 'COMPLETE', amount_gross: '1850.00' }
    const verdict = verifyItn(
      { ...itn, signature: payfastSignature(itn, PASSPHRASE) },
      { merchantId: '10047719', merchantKey: 'wkq8dmfysau1q', passphrase: PASSPHRASE, processUrl: PAYFAST_LIVE_PROCESS_URL },
      { sourceIp: '197.97.145.150' },
    )
    expect(verdict.ok).toBe(false)
    expect((verdict as { reason: string }).reason).toMatch(/merchant_id/)
  })

  it('ITN: CANCELLED accepted but amount check skipped', () => {
    const itn = { ...VECTOR_FIELDS, payment_status: 'CANCELLED', amount_gross: '0.00' }
    const signed = payfastSignature(itn, PASSPHRASE)
    const verdict = verifyItn(
      { ...itn, signature: signed },
      { merchantId: '10047719', merchantKey: 'wkq8dmfysau1q', passphrase: PASSPHRASE, processUrl: PAYFAST_LIVE_PROCESS_URL },
      { sourceIp: '197.97.145.150', expectedPaymentId: 'PAY-1', expectedAmountCents: 185000 },
    )
    expect(verdict.ok).toBe(true)
    expect((verdict as { status: string }).status).toBe('CANCELLED')
  })
})
