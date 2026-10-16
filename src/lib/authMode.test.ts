import { describe, expect, it } from 'vitest'
import { resolveClientAuthMode } from './authMode'

describe('resolveClientAuthMode (VITE_AUTH_MODE)', () => {
  it('only exact "supabase" enables Supabase mode', () => {
    expect(resolveClientAuthMode('supabase')).toBe('supabase')
    for (const v of [undefined, '', 'Supabase', 'api', 'true', ' supabase']) {
      expect(resolveClientAuthMode(v)).toBe('api')
    }
  })
})
