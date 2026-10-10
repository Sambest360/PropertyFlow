import { afterEach, describe, expect, it, vi } from 'vitest'

const upsert = vi.fn(async () => ({ error: null }))
let storedMeta: Record<string, unknown> | null = null
vi.mock('../../utils/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null }) }),
          maybeSingle: async () => ({ data: storedMeta ? { id: 'uuid-u', metadata: storedMeta } : null }),
        }),
      }),
      upsert,
      insert: vi.fn(async () => ({ error: null })),
    }),
  }),
}))

describe('CR10 fix 4: browser supabase user upsert and signature', () => {
  afterEach(() => {
    vi.resetModules()
    upsert.mockClear()
    storedMeta = null
  })

  it('refuses a signature write on the browser path (no own-row / PNG check there)', async () => {
    const { persistToSupabase } = await import('./persist')
    const ok = await persistToSupabase({
      resource: 'user',
      action: 'upsert',
      id: 'u-t',
      data: { id: 'u-t', email: 't@example.com', signature: 'data:image/png;base64,AAAA' },
    })
    expect(ok).toBe(false)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('a profile save keeps the stored signature instead of dropping it', async () => {
    storedMeta = { signature: 'data:image/png;base64,KEEP' }
    const { persistToSupabase } = await import('./persist')
    const ok = await persistToSupabase({
      resource: 'user',
      action: 'upsert',
      id: 'u-t',
      data: { id: 'u-t', email: 't@example.com', name: 'T User' },
    })
    expect(ok).toBe(true)
    const users = upsert.mock.calls.map((c) => (c as unknown[])[0] as Record<string, unknown>).filter((r) => r && 'email' in r)
    expect((users.at(-1)?.metadata as Record<string, unknown>).signature).toBe('data:image/png;base64,KEEP')
  })
})
