import { describe, expect, it } from 'vitest'
import {
  TRUST_CSV_NON_PRODUCTION_LABEL,
  TRUST_CSV_TEMPLATE_HEADER,
  buildTrustCsvPartnerTxnId,
  filterNewTrustCsvRows,
  parseTrustTemplateCsv,
  trustCsvTemplateSample,
  trustTransactionsToCsv,
} from './csvImport'

describe('Mode A trust template CSV', () => {
  it('parses template rows into unallocated-ready fields', () => {
    const result = parseTrustTemplateCsv(trustCsvTemplateSample())
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({
      valueDate: '2026-09-01',
      direction: 'in',
      amountCents: 1_250_000,
      bankRef: 'TPL-001',
    })
    expect(buildTrustCsvPartnerTxnId(result.rows[0]!.idempotencyKey)).toMatch(
      /^tpl-csv:/,
    )
  })

  it('is idempotent on bank_ref against existing cashbook', () => {
    const parsed = parseTrustTemplateCsv(trustCsvTemplateSample())
    const { fresh, duplicateCount } = filterNewTrustCsvRows(parsed.rows, [
      { bankRef: 'TPL-001', partnerTxnId: null },
    ])
    expect(duplicateCount).toBe(1)
    expect(fresh).toHaveLength(1)
    expect(fresh[0]!.bankRef).toBe('TPL-002')
  })

  it('rejects arbitrary / missing headers (template only)', () => {
    const bad = parseTrustTemplateCsv('date,amount,memo\n2026-01-01,100,x')
    expect(bad.rows).toHaveLength(0)
    expect(bad.errors[0]).toMatch(/Expected header/)
    expect(TRUST_CSV_TEMPLATE_HEADER).toContain('amount_zar')
  })

  it('export round-trips header and honesty label stays non-PayProp', () => {
    const csv = trustTransactionsToCsv([
      {
        valueDate: '2026-09-01',
        direction: 'in',
        amountCents: 10000,
        description: 'Demo',
        bankRef: 'X1',
        status: 'unallocated',
      },
    ])
    expect(csv.split('\n')[0]).toContain('value_date')
    expect(TRUST_CSV_NON_PRODUCTION_LABEL.toLowerCase()).toMatch(/not bank-confirmed/)
    expect(TRUST_CSV_NON_PRODUCTION_LABEL.toLowerCase()).toMatch(/not payprop/)
    expect(TRUST_CSV_NON_PRODUCTION_LABEL.toLowerCase()).not.toMatch(/live bank http/)
  })
})
