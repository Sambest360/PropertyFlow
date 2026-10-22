import { describe, expect, it } from 'vitest'
import { dbHostFingerprint, resolveServerAuthMode } from './authMode'

describe('resolveServerAuthMode', () => {
  it('only exact "supabase" enables Supabase mode', () => {
    expect(resolveServerAuthMode({ AUTH_MODE: 'supabase' })).toBe('supabase')
    for (const v of [undefined, '', 'Supabase', 'SUPABASE', ' supabase', 'api', '1', 'true']) {
      expect(resolveServerAuthMode({ AUTH_MODE: v })).toBe('api')
    }
  })
  it('AUTH_MODE unset with SUPABASE_* and VITE_* present stays API mode', () => {
    expect(
      resolveServerAuthMode({
        SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
        VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
        VITE_AUTH_MODE: 'supabase',
      }),
    ).toBe('api')
  })
})

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
