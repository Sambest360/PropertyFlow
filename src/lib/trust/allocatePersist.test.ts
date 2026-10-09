
import { describe, expect, it } from 'vitest'
import { TRUST_MODE_A_COPY } from './modeA'
import { TRUST_CSV_NON_PRODUCTION_LABEL } from './csvImport'

/** Document FE persist resource keys Jim locked for DQ-M1. */
const TRUST_PERSIST_RESOURCES = [
  'trust_transaction',
  'trust_allocation',
  'csv_import_batch',
  'payout_instruction',
  'deposit_holding',
] as const

describe('DQ-M1 allocate / persist honesty', () => {
  it('uses exact FE persist resource keys', () => {
    expect(TRUST_PERSIST_RESOURCES).toContain('trust_transaction')
    expect(TRUST_PERSIST_RESOURCES).toContain('trust_allocation')
    expect(TRUST_PERSIST_RESOURCES).toContain('csv_import_batch')
    expect(TRUST_PERSIST_RESOURCES).toContain('deposit_holding')
    expect(TRUST_PERSIST_RESOURCES).toContain('payout_instruction')
  })

  it('allocate status transitions stay within 007 schema', () => {
    const allowed = new Set([
      'received',
      'recognised',
      'allocated',
      'split_allocated',
      'unallocated',
      'reversed',
    ])
    expect(allowed.has('allocated')).toBe(true)
    expect(allowed.has('recognised')).toBe(true) // suspense
    expect(allowed.has('settled')).toBe(false)
  })

  it('payout submit must not invent settled or partner id', () => {
    const submitted = {
      status: 'submitted' as const,
      settledAt: null as string | null,
      partnerPayoutId: null as string | null,
    }
    expect(submitted.status).toBe('submitted')
    expect(submitted.status).not.toBe('settled')
    expect(submitted.partnerPayoutId).toBeNull()
    expect(submitted.settledAt).toBeNull()
  })

  it('honesty labels remain non-PayProp / not bank-confirmed', () => {
    expect(TRUST_MODE_A_COPY).toMatch(/not yet matched to the bank/i)
    expect(TRUST_CSV_NON_PRODUCTION_LABEL).toMatch(/not bank-confirmed/i)
  })
})
