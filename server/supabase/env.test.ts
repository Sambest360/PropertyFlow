import { afterEach, describe, expect, it, vi } from 'vitest'

describe('supabaseAuthConfigured', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('treats .env.example placeholders as not configured', async () => {
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', '')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://YOUR_PROJECT_REF.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_YOUR_KEY')
    vi.resetModules()
    const { supabaseAuthConfigured } = await import('./env.js')
    expect(supabaseAuthConfigured()).toBe(false)
  })

  it('prefers SUPABASE_* over Vercel encrypted VITE config blobs for GoTrue', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'eyJ2IjoidjIiLCJjIjoiZm9vIn0')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'eyJ2IjoidjIiLCJjIjoiYmFkIn0')
    vi.stubEnv('SUPABASE_URL', 'https://kivrltmcdthcwijcjrnm.supabase.co')
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test_key_abc')
    vi.stubEnv('AUTH_MODE', 'supabase')
    const {
      resolveSupabasePublishableKeyForGoTrue,
      resolveSupabaseUrlForGoTrue,
      supabaseAuthConfigured,
    } = await import('./env.js')
    expect(resolveSupabaseUrlForGoTrue()).toBe('https://kivrltmcdthcwijcjrnm.supabase.co')
    expect(resolveSupabasePublishableKeyForGoTrue()).toBe('sb_publishable_test_key_abc')
    expect(supabaseAuthConfigured()).toBe(true)
  })

  it('AUTH_MODE unset with SUPABASE_* present: GoTrue not configured (API mode)', async () => {
    vi.stubEnv('AUTH_MODE', '')
    vi.stubEnv('SUPABASE_URL', 'https://kivrltmcdthcwijcjrnm.supabase.co')
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test_key_abc')
    vi.resetModules()
    const { supabaseAuthConfigured } = await import('./env.js')
    expect(supabaseAuthConfigured()).toBe(false)
  })

  it('never reads VITE_* on the server', async () => {
    vi.stubEnv('AUTH_MODE', 'supabase')
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', '')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_vite_only')
    vi.resetModules()
    const { resolveSupabaseUrlForGoTrue, supabaseAuthConfigured } = await import('./env.js')
    expect(resolveSupabaseUrlForGoTrue()).toBe('')
    expect(supabaseAuthConfigured()).toBe(false)
  })
})
