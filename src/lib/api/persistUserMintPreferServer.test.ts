import { afterEach, describe, expect, it, vi } from 'vitest'
import { preferServerPersistForSignature, preferServerPersistForUserMint } from './persist'

const persistToSupabase = vi.fn(async () => true)

vi.mock('./config', () => ({
  isApiEnabled: false,
  isSupabaseMode: true,
}))

vi.mock('../supabase/persist', () => ({
  persistToSupabase: (...args: unknown[]) => persistToSupabase(...args),
  persistBatchToSupabase: vi.fn(async () => true),
  supabaseMarkNotificationsRead: vi.fn(async () => true),
}))

vi.mock('./actorAuth', () => ({
  actorHeaders: () => ({}),
}))

vi.mock('./authClient', () => ({
  authHeaders: () => ({}),
}))

vi.mock('../bootstrapMerge', () => ({
  markLocalPersistWrite: vi.fn(),
}))

describe('preferServerPersistForUserMint', () => {
  it('routes user upserts with tempPassword through /api/persist', () => {
    expect(
      preferServerPersistForUserMint('user', 'upsert', { tempPassword: 'x' }),
    ).toBe(true)
  })

  it('routes user upserts with password through /api/persist', () => {
    expect(preferServerPersistForUserMint('user', 'upsert', { password: 'x' })).toBe(
      true,
    )
  })

  it('does not force password-less user upserts onto the server path', () => {
    expect(preferServerPersistForUserMint('user', 'upsert', { email: 'a@b.co' })).toBe(false)
    expect(preferServerPersistForUserMint('user', 'delete', { tempPassword: 'x' })).toBe(false)
    expect(preferServerPersistForUserMint('agency', 'upsert', { tempPassword: 'x' })).toBe(false)
  })
})

describe('persistToApi user mint fail-closed (supabase mode)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    persistToSupabase.mockClear()
  })

  it('does not toast-path via supabase when /api/persist is false-ok HTML', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<!doctype html><html></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    )
    const { persistToApi } = await import('./persist')
    const ok = await persistToApi({
      resource: 'user',
      action: 'upsert',
      id: 'u-agent1',
      data: {
        id: 'u-agent1',
        email: 'qa.agent@example.com',
        role: 'ground_agent',
        tempPassword: 'x',
      },
    })
    expect(ok).toBe(false)
    expect(persistToSupabase).not.toHaveBeenCalled()
  })

  it('returns true only when /api/persist returns JSON { ok: true }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: true, id: 'u-agent1', uuid: 'uuid-1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const { persistToApi } = await import('./persist')
    const ok = await persistToApi({
      resource: 'user',
      action: 'upsert',
      id: 'u-agent1',
      data: {
        id: 'u-agent1',
        email: 'qa.agent@example.com',
        role: 'ground_agent',
        tempPassword: 'x',
      },
    })
    expect(ok).toBe(true)
    expect(persistToSupabase).not.toHaveBeenCalled()
  })

  it('returns false when Auth link fails on the server (HTTP 502 JSON error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: 'persist_failed',
              message: 'Auth linked but sign-in verification failed (status 400)',
            }),
            {
              status: 502,
              headers: { 'content-type': 'application/json' },
            },
          ),
      ),
    )
    const { persistToApi } = await import('./persist')
    const ok = await persistToApi({
      resource: 'user',
      action: 'upsert',
      id: 'u-agent1',
      data: {
        id: 'u-agent1',
        email: 'qa.agent@example.com',
        role: 'ground_agent',
        tempPassword: 'x',
      },
    })
    expect(ok).toBe(false)
    expect(persistToSupabase).not.toHaveBeenCalled()
  })
})

describe('CR10 fix 4: signature writes go to /api/persist in supabase mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    persistToSupabase.mockClear()
  })
  it('flags user upserts that carry signature', () => {
    expect(preferServerPersistForSignature('user', 'upsert', { signature: 'x' })).toBe(true)
    expect(preferServerPersistForSignature('user', 'upsert', { name: 'x' })).toBe(false)
    expect(preferServerPersistForSignature('tenancy', 'upsert', { signature: 'x' })).toBe(false)
  })
  it('single and batch signature writes hit /api/persist, never the browser upsert', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { persistToApi, persistBatchToApi } = await import('./persist')
    const op = { resource: 'user' as const, action: 'upsert' as const, id: 'u-t', data: { id: 'u-t', signature: 'data:image/png;base64,AAAA' } }
    expect(await persistToApi(op)).toBe(true)
    expect(await persistBatchToApi([op])).toBe(true)
    expect(persistToSupabase).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String((fetchMock.mock.calls[1] as unknown[])[0])).toContain('/api/persist')
  })
})
