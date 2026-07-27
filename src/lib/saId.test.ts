import { describe, expect, it } from 'vitest'
import { parseIdentityDocument, saIdChecksumValid } from './saId'

describe('parseIdentityDocument', () => {
  it('accepts a checksum-valid SA ID and derives DOB / gender', () => {
    const id = '9001015009086'
    expect(saIdChecksumValid(id)).toBe(true)
    const parsed = parseIdentityDocument(id)
    expect(parsed).toMatchObject({
      kind: 'sa_id',
      valid: true,
      normalized: id,
      dateOfBirth: '1990-01-01',
      gender: 'male',
      citizen: true,
    })
  })

  it('rejects 13-digit numbers that fail the checksum', () => {
    const parsed = parseIdentityDocument('9001015009080')
    expect(parsed.kind).toBe('sa_id')
    expect(parsed.valid).toBe(false)
    if (parsed.kind === 'sa_id' && parsed.valid === false) {
      expect(parsed.error).toMatch(/checksum/i)
    }
  })

  it('rejects incomplete numeric SA ID entry', () => {
    const parsed = parseIdentityDocument('900101')
    expect(parsed.kind).toBe('sa_id')
    expect(parsed.valid).toBe(false)
    if (parsed.kind === 'sa_id' && parsed.valid === false) {
      expect(parsed.error).toMatch(/13 digits/i)
    }
  })

  it('treats long alphanumeric values as passport', () => {
    expect(parseIdentityDocument('A1234567')).toMatchObject({
      kind: 'passport',
      valid: true,
      normalized: 'A1234567',
    })
  })

  it('returns empty for blank input without erroring', () => {
    expect(parseIdentityDocument('   ')).toEqual({
      kind: 'empty',
      valid: true,
      normalized: '',
    })
  })
})
