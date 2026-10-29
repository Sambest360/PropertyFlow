import { afterEach, describe, expect, it, vi } from 'vitest'
import { preferServerPersistForSignature, preferServerPersistForUserMint } from './persist'


vi.mock('./config', () => ({
  isApiEnabled: true,
}))

vi.mock('./actorAuth', () => ({
  actorHeaders: () => ({}),
}))

vi.mock('./authClient', () => ({
  authHeaders: () => ({}),
  resolveApiAuthorizationHeader: async () => ({}),
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

describe('persistToApi user mint fail-closed (API)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not report success when /api/persist is false-ok HTML', async () => {
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
  })
})

describe('persistUserCreateViaServer error messages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  const userMintOp = {
    resource: 'user' as const,
    action: 'upsert' as const,
    id: 'u-agent1',
    data: {
      id: 'u-agent1',
      email: 'qa.agent@example.com',
      role: 'ground_agent',
      tempPassword: 'x',
    },
  }

  it('returns dev:full guidance when /api/persist answers with the SPA HTML shell', async () => {
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
    const { persistUserCreateViaServer, LOCAL_API_REQUIRED_MESSAGE } = await import('./persist')
    const res = await persistUserCreateViaServer(userMintOp)
    expect(res).toEqual({ ok: false, error: LOCAL_API_REQUIRED_MESSAGE })
    expect(res.ok === false && res.error).toMatch(/dev:full/i)
  })

  it('returns server message on 502 JSON (auth verification)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: 'persist_failed',
              message:
                'Auth linked but sign-in verification failed (status 400)',
            }),
            { status: 502, headers: { 'content-type': 'application/json' } },
          ),
      ),
    )
    const { persistUserCreateViaServer } = await import('./persist')
    const res = await persistUserCreateViaServer(userMintOp)
    expect(res).toEqual({
      ok: false,
      error: 'Auth linked but sign-in verification failed (status 400)',
    })
  })

  it('returns status fallback when body has only persist_failed code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'persist_failed' }), {
            status: 502,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const { persistUserCreateViaServer } = await import('./persist')
    const res = await persistUserCreateViaServer(userMintOp)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toMatch(/Server error \(502\)/)
    }
  })

  it('returns server message on 401 JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: 'persist_failed',
              message: 'Sign-in required. Please sign in and try again.',
            }),
            { status: 401, headers: { 'content-type': 'application/json' } },
          ),
      ),
    )
    const { persistUserCreateViaServer } = await import('./persist')
    const res = await persistUserCreateViaServer(userMintOp)
    expect(res).toEqual({
      ok: false,
      error: 'Sign-in required. Please sign in and try again.',
    })
  })

  it('names an nginx 413 (body too large) instead of the dev:full hint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<html><head><title>413 Request Entity Too Large</title></head></html>', {
            status: 413,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    )
    const { persistUserCreateViaServer, UPLOAD_TOO_LARGE_MESSAGE } = await import('./persist')
    const res = await persistUserCreateViaServer(userMintOp)
    expect(res).toEqual({ ok: false, error: UPLOAD_TOO_LARGE_MESSAGE })
  })

  it('never shows the dev:full hint in a production build', async () => {
    vi.stubEnv('DEV', false)
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response('<html><body>502 Bad Gateway</body></html>', {
              status: 502,
              headers: { 'content-type': 'text/html' },
            }),
        ),
      )
      const { persistUserCreateViaServer } = await import('./persist')
      const bad = await persistUserCreateViaServer(userMintOp)
      expect(bad).toEqual({ ok: false, error: 'Server is temporarily unavailable. Try again shortly.' })
      vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
      const offline = await persistUserCreateViaServer(userMintOp)
      expect(offline.ok === false && offline.error).not.toMatch(/dev:full/i)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('returns dev:full guidance when fetch fails (API not running)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const { persistUserCreateViaServer, LOCAL_API_REQUIRED_MESSAGE } = await import('./persist')
    const res = await persistUserCreateViaServer(userMintOp)
    expect(res).toEqual({ ok: false, error: LOCAL_API_REQUIRED_MESSAGE })
  })
})

describe('CR10 fix 4: signature writes go to /api/persist', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
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
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String((fetchMock.mock.calls[1] as unknown[])[0])).toContain('/api/persist')
  })
})
