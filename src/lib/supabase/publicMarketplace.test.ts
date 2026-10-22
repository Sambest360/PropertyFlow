import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('../../utils/supabase/client', () => ({
  createClient: () => ({ rpc }),
}))

import { fetchPublicMarketplaceBootstrap } from './publicMarketplace'

describe('fetchPublicMarketplaceBootstrap', () => {
  beforeEach(() => {
    rpc.mockReset()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null on RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const result = await fetchPublicMarketplaceBootstrap(true, 5000)
    expect(result).toBeNull()
  })

  it('returns null on timeout', async () => {
    vi.useFakeTimers()
    rpc.mockImplementation(
      () =>
        new Promise(() => {
          /* hang */
        }),
    )
    const pending = fetchPublicMarketplaceBootstrap(true, 100)
    await vi.advanceTimersByTimeAsync(150)
    const result = await pending
    expect(result).toBeNull()
  })

  it('returns mapped bootstrap when lite RPC has units', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        units: [{ id: 'u1', property_id: 'p1', status_key: 'PUBLISHED' }],
        buildings: [],
        users: [],
        clients: [],
      },
      error: null,
    })
    const result = await fetchPublicMarketplaceBootstrap(true, 5000)
    expect(result).not.toBeNull()
    expect(result?.units.length).toBeGreaterThan(0)
    expect(result?.marketplaceFetchFailed).toBeFalsy()
  })
})
