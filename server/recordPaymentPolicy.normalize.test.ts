/**
 * Q-R1 method mapping + mutant table (Angela/Jim MUST on PR #139).
 * Pure unit tests — no Postgres.
 */
import { describe, expect, it } from 'vitest'
import { normalizeMarkPaidMethod, isMarkPaidMethod } from './recordPaymentPolicy.js'

/** Canonical Q-R1 maps. Dropping any entry must fail the mutant below. */
const Q_R1_MAPS: Array<[string, string]> = [
  ['Card', 'CARD_AT_OFFICE'],
  ['CARD', 'CARD_AT_OFFICE'],
  ['Card at the office', 'CARD_AT_OFFICE'],
  ['CARD_AT_THE_OFFICE', 'CARD_AT_OFFICE'],
  ['Debit order', 'EFT'],
  ['DEBIT_ORDER', 'EFT'],
  ['Instant EFT', 'EFT'],
  ['INSTANT_EFT', 'EFT'],
  ['Cheque', 'OTHER'],
  ['CHEQUE', 'OTHER'],
  ['cheque', 'OTHER'],
  ['EFT', 'EFT'],
  ['Cash', 'CASH'],
  ['CASH', 'CASH'],
  ['Other', 'OTHER'],
]

describe('normalizeMarkPaidMethod Q-R1', () => {
  it.each(Q_R1_MAPS)('maps %s → %s', (raw, expected) => {
    expect(normalizeMarkPaidMethod(raw)).toBe(expected)
    expect(isMarkPaidMethod(raw)).toBe(true)
  })

  it('mutant: every Q-R1 legacy label is present (dropping one map fails this)', () => {
    const got = Object.fromEntries(Q_R1_MAPS.map(([raw]) => [raw, normalizeMarkPaidMethod(raw)]))
    expect(got).toEqual(Object.fromEntries(Q_R1_MAPS))
    // Explicit pins so a careless delete of Debit order / Instant EFT / Cheque / Card fails loudly.
    expect(normalizeMarkPaidMethod('Debit order')).toBe('EFT')
    expect(normalizeMarkPaidMethod('Instant EFT')).toBe('EFT')
    expect(normalizeMarkPaidMethod('Cheque')).toBe('OTHER')
    expect(normalizeMarkPaidMethod('Card')).toBe('CARD_AT_OFFICE')
  })

  it('still refuses unknown methods', () => {
    expect(isMarkPaidMethod('PayFast')).toBe(false)
    expect(isMarkPaidMethod('')).toBe(false)
    expect(isMarkPaidMethod('Bitcoin')).toBe(false)
  })
})
