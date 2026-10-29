import { describe, expect, it } from 'vitest'
import { dbHostFingerprint } from './authMode'

describe('dbHostFingerprint', () => {
  it('returns 8 hex chars and never the host', () => {
    const fp = dbHostFingerprint('postgres://u:p@ep-secret-host.example.net:5432/db')
    expect(fp).toMatch(/^[0-9a-f]{8}$/)
    expect(fp).not.toContain('ep-secret')
  })
  it('null for missing/invalid urls', () => {
    expect(dbHostFingerprint(undefined)).toBeNull()
    expect(dbHostFingerprint('not a url')).toBeNull()
  })
})
