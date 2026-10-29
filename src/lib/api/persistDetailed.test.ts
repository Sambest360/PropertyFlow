import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { persistToApiDetailed } from './persist'

vi.mock('./config', () => ({
  isApiEnabled: true,
}))

describe('persistToApiDetailed', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns server error message on 400', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ message: 'agent not resolved: u-missing' }),
    } as Response)

    const result = await persistToApiDetailed({
      resource: 'unit',
      action: 'upsert',
      id: 'unt-test',
      data: { id: 'unt-test' },
    })

    expect(result).toEqual({ ok: false, error: 'agent not resolved: u-missing' })
  })
})
