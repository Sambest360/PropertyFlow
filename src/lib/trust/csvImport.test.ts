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

  it('rejects a file with no date + amount header', () => {
    const bad = parseTrustTemplateCsv('when,how much,memo\n2026-01-01,100,x')
    expect(bad.rows).toHaveLength(0)
    expect(bad.errors[0]).toMatch(/Expected header/)
    expect(TRUST_CSV_TEMPLATE_HEADER).toContain('amount_zar')
  })

  it('reads a bank export: preamble, day-first dates, signed amounts, running balance', () => {
    const csv = [
      'ACC-NO,62000000001,Trust Account',
      'Opening Balance,10000.00',
      'Date,Amount,Balance,Description,Reference',
      '01/11/2026,12500.00,22500.00,FNB OB PMT,NKOSI FLAT 4',
      '02/11/2026,-3500.00,19000.00,PAYMENT TO LANDLORD,',
      '02/11/2026,0.00,19000.00,FEE REVERSAL,',
      '03 Nov 2026,"1,250.00",20250.00,DEPOSIT,NKOSI FLAT 4',
    ].join('\n')
    const r = parseTrustTemplateCsv(csv)
    expect(r.errors).toEqual([])
    expect(r.layout).toBe('bank')
    expect(r.skippedBlank).toBe(1)
    expect(r.rows.map((x) => [x.valueDate, x.direction, x.amountCents])).toEqual([
      ['2026-11-01', 'in', 1_250_000],
      ['2026-11-02', 'out', 350_000],
      ['2026-11-03', 'in', 125_000],
    ])
    expect(r.closingBalance).toEqual({ valueDate: '2026-11-03', cents: 2_025_000 })
  })

  it('reads debit / credit columns and Cr/Dr suffixes', () => {
    const csv = ['Transaction Date,Description,Debit,Credit,Balance', '2026/11/05,RENT MOLEFE,,8000.00,8000.00Cr', '2026/11/06,BANK FEE,15.50,,7984.50Cr'].join('\n')
    const r = parseTrustTemplateCsv(csv)
    expect(r.rows.map((x) => [x.direction, x.amountCents])).toEqual([
      ['in', 800_000],
      ['out', 1_550],
    ])
    expect(r.closingBalance?.cents).toBe(798_450)
  })

  it('keeps a monthly repeated payer reference and same-day identical payments apart', () => {
    const oct = parseTrustTemplateCsv('Date,Amount,Description,Reference\n2026-10-01,9000,RENT,FLAT 4')
    const nov = parseTrustTemplateCsv('Date,Amount,Description,Reference\n2026-11-01,9000,RENT,FLAT 4\n2026-11-01,9000,RENT,FLAT 4')
    const existing = oct.rows.map((x) => ({ bankRef: x.bankRef, partnerTxnId: buildTrustCsvPartnerTxnId(x.idempotencyKey) }))
    const { fresh, duplicateCount } = filterNewTrustCsvRows(nov.rows, existing)
    expect(duplicateCount).toBe(0)
    expect(fresh).toHaveLength(2)
    // Re-importing the same November file is a no-op.
    const again = filterNewTrustCsvRows(nov.rows, [...existing, ...fresh.map((x) => ({ bankRef: x.bankRef, partnerTxnId: buildTrustCsvPartnerTxnId(x.idempotencyKey) }))])
    expect(again.fresh).toHaveLength(0)
  })

  it('rejects impossible dates instead of rolling them over', () => {
    const r = parseTrustTemplateCsv('Date,Amount\n31/02/2026,100')
    expect(r.rows).toHaveLength(0)
    expect(r.errors[0]).toMatch(/not a date/)
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
    expect(TRUST_CSV_NON_PRODUCTION_LABEL.toLowerCase()).toMatch(/not yet matched to the bank/)
    expect(TRUST_CSV_NON_PRODUCTION_LABEL.toLowerCase()).not.toMatch(/bank-confirmed|payprop/)
    expect(TRUST_CSV_NON_PRODUCTION_LABEL.toLowerCase()).not.toMatch(/live bank http/)
  })
})

describe('parseStatementFile: other bank export formats', () => {
  it('reads Standard Bank HIST lines and skips account / balance lines', async () => {
    const { parseStatementFile } = await import('./csvImport')
    const r = parseStatementFile(
      [
        'ACC-NO,012345678,CURRENT ACCOUNT',
        'OPEN,20261101,,10000.00,OPENING BALANCE,,0,0',
        'HIST,20261101,,12500,CREDIT TRANSFER,NKOSI FLAT 4,6088,0',
        'HIST,20261102,,-3500.5,IB PAYMENT TO,LANDLORD,1234,0',
        'CLOSE,20261130,,19000.00,CLOSING BALANCE,,0,0',
      ].join('\n'),
    )
    expect(r.errors).toEqual([])
    expect(r.rows.map((x) => [x.valueDate, x.direction, x.amountCents, x.bankRef])).toEqual([
      ['2026-11-01', 'in', 1_250_000, 'NKOSI FLAT 4'],
      ['2026-11-02', 'out', 350_050, 'LANDLORD'],
    ])
  })

  it('reads OFX (SGML) with FITID as the unique key and the ledger balance', async () => {
    const { parseStatementFile } = await import('./csvImport')
    const ofx = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>ZAR<BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261101120000[+2:SAST]<TRNAMT>12500.00<FITID>2026110100001<NAME>NKOSI T<MEMO>FLAT 4</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261102<TRNAMT>-15.50<FITID>2026110200002<NAME>SERVICE FEE</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>22484.50<DTASOF>20261102</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`
    const r = parseStatementFile(ofx)
    expect(r.errors).toEqual([])
    expect(r.rows.map((x) => [x.direction, x.amountCents, x.description, x.idempotencyKey])).toEqual([
      ['in', 1_250_000, 'NKOSI T FLAT 4', 'fitid:2026110100001'],
      ['out', 1_550, 'SERVICE FEE', 'fitid:2026110200002'],
    ])
    expect(r.closingBalance).toEqual({ valueDate: '2026-11-02', cents: 2_248_450 })
  })

  it('reads OFX 2 (XML with closing tags)', async () => {
    const { parseStatementFile } = await import('./csvImport')
    const r = parseStatementFile(
      '<?xml version="1.0"?><?OFX OFXHEADER="200"?><OFX><STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261105</DTPOSTED><TRNAMT>800.00</TRNAMT><FITID>A1</FITID><NAME>MOLEFE</NAME></STMTTRN></OFX>',
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ valueDate: '2026-11-05', amountCents: 80_000, description: 'MOLEFE' })
  })

  it('reads QIF with day-first and two-digit-year dates', async () => {
    const { parseStatementFile } = await import('./csvImport')
    const r = parseStatementFile('!Type:Bank\nD01/11/2026\nT12,500.00\nPNKOSI T\nMFLAT 4\n^\nD2/11\'26\nT-15.50\nPSERVICE FEE\n^\n')
    expect(r.errors).toEqual([])
    expect(r.rows.map((x) => [x.valueDate, x.direction, x.amountCents, x.bankRef])).toEqual([
      ['2026-11-01', 'in', 1_250_000, 'FLAT 4'],
      ['2026-11-02', 'out', 1_550, ''],
    ])
  })

  it('falls through to the CSV reader for an ordinary export', async () => {
    const { parseStatementFile } = await import('./csvImport')
    expect(parseStatementFile('Date,Amount\n2026-11-01,100').rows).toHaveLength(1)
  })
})
