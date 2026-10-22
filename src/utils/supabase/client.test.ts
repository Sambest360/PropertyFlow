import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createBrowserClient } = vi.hoisted(() => ({
  createBrowserClient: vi.fn(() => ({ tag: 'client' })),
}))

vi.mock('@supabase/ssr', () => ({
  createBrowserClient,
}))

vi.mock('./env', () => ({
  getSupabaseUrl: () => 'https://abc.supabase.co',
  getSupabasePublishableKey: () => 'pk_test',
}))

import { createClient, resetSupabaseBrowserClient } from './client'

describe('supabase browser client', () => {
  beforeEach(() => {
    resetSupabaseBrowserClient()
    createBrowserClient.mockClear()
  })

  it('returns the same singleton instance', () => {
    const a = createClient()
    const b = createClient()
    expect(a).toBe(b)
    expect(createBrowserClient).toHaveBeenCalledTimes(1)
  })
})
