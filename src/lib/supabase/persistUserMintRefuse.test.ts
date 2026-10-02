import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
          maybeSingle: async () => ({ data: null }),
        }),
      }),
      upsert: vi.fn(async () => ({ error: null })),
      insert: vi.fn(async () => ({ error: null })),
    }),
  }),
}))

describe('browser supabase persist — passworded user mint refuse', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('returns false and does not write when tempPassword is present', async () => {
    const { persistToSupabase } = await import('./persist')
    const ok = await persistToSupabase({
      resource: 'user',
      action: 'upsert',
      id: 'u-r13d',
      data: {
        id: 'u-r13d',
        email: 'qa.agent.r13d@example.com',
        role: 'ground_agent',
        tempPassword: 'x',
      },
    })
    expect(ok).toBe(false)
  })

  it('returns false when password is present', async () => {
    const { persistToSupabase } = await import('./persist')
    const ok = await persistToSupabase({
      resource: 'user',
      action: 'upsert',
      id: 'u-r13d-b',
      data: {
        id: 'u-r13d-b',
        email: 'qa.agent.r13d.b@example.com',
        role: 'ground_agent',
        password: 'x',
      },
    })
    expect(ok).toBe(false)
  })
})
