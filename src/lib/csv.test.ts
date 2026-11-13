import { describe, expect, it } from 'vitest'
import { csvCell, csvFileName, toCsv } from './csv'

describe('csv export', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Unit 4, Beachview')).toBe('"Unit 4, Beachview"')
    expect(csvCell('The "Loft"')).toBe('"The ""Loft"""')
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"')
    expect(csvCell('plain')).toBe('plain')
  })

  it('neutralises text a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`)
    expect(csvCell('+27 82 000 0001')).toBe("'+27 82 000 0001")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('-cmd')).toBe("'-cmd")
  })

  it('keeps numbers as numbers, including negatives, and blanks out empties', () => {
    expect(csvCell(-1250.5)).toBe('-1250.5')
    expect(csvCell(0)).toBe('0')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(Number.NaN)).toBe('')
    expect(csvCell(true)).toBe('Yes')
  })

  it('builds a header row and CRLF lines', () => {
    expect(toCsv(['Tenant', 'Amount'], [['Lucas Pretorius', 12500], ['Nomsa, D', null]])).toBe(
      'Tenant,Amount\r\nLucas Pretorius,12500\r\n"Nomsa, D",\r\n',
    )
  })

  it('names the file with the local date', () => {
    expect(csvFileName('payments', new Date(2026, 10, 3))).toBe('payments-2026-11-03.csv')
  })
})
