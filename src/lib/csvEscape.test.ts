import { describe, expect, it } from 'vitest'
import { csvEscape } from './csvEscape'
import { rentRollTableToCsv } from './rentRoll/rentRollTable'

describe('csvEscape: CSV injection guard', () => {
  it("prefixes ' on text starting with = + - @ tab or CR", () => {
    expect(csvEscape('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvEscape('+27 82')).toBe("'+27 82")
    expect(csvEscape('-cmd')).toBe("'-cmd")
    expect(csvEscape('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvEscape('\tx')).toBe("'\tx")
    expect(csvEscape('\rx')).toBe(`"'\rx"`)
  })
  it('leaves plain and negative numbers and ordinary text alone', () => {
    expect(csvEscape('-1250.00')).toBe('-1250.00')
    expect(csvEscape('12500.00')).toBe('12500.00')
    expect(csvEscape('Humewood B12')).toBe('Humewood B12')
    expect(csvEscape('a, b')).toBe('"a, b"')
  })
  it('applies inside the report CSVs', () => {
    const row = { tenantName: '=evil()', propertyTitle: 'Unit 1', landlordName: 'L', status: 'Active', startDate: '2026-01-01', endDate: null, rentZar: 1, arrearsZar: -5, increaseDate: null, escalationPct: null }
    const csv = rentRollTableToCsv([row as never], ['tenant', 'outstanding'])
    expect(csv.split('\n')[1]).toBe("'=evil(),-5.00")
  })
})
