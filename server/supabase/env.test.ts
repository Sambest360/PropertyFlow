import { afterEach, describe, expect, it, vi } from 'vitest'

describe('supabaseAuthConfigured', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('treats .env.example placeholders as not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://YOUR_PROJECT_REF.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_YOUR_KEY')
    const { supabaseAuthConfigured } = await import('./env.js')
    expect(supabaseAuthConfigured()).toBe(false)
  })
})
