import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { PostgresBootstrap } from './api/postgresClient'
import {
  bootstrapActorKey,
  dedupeBootstrapFetch,
  isBootstrapFetchInFlight,
  markBootstrapFetched,
  resetBootstrapCoordForRetry,
  resetBootstrapCoordForTests,
  shouldIgnoreBootstrapMissAfterFetch,
  shouldSkipAuthBootstrapRefresh,
} from './bootstrapCoord'

function stubBoot(tag: string): PostgresBootstrap {
  return { fetchedAt: tag } as PostgresBootstrap
}

describe('isBootstrapFetchInFlight', () => {
  beforeEach(() => {
    resetBootstrapCoordForTests()
  })

  it('is false when no fetch is running', () => {
    expect(isBootstrapFetchInFlight()).toBe(false)
  })

  it('is true while a deduped lite fetch is in flight', async () => {
    let resolve!: (v: PostgresBootstrap | null) => void
    const fetcher = vi.fn(
      () =>
        new Promise<PostgresBootstrap | null>((r) => {
          resolve = r
        }),
    )
    const p = dedupeBootstrapFetch(true, fetcher, { actorKey: 'agent:u-1' })
    expect(isBootstrapFetchInFlight()).toBe(true)
    resolve(stubBoot('done'))
    await p
    expect(isBootstrapFetchInFlight()).toBe(false)
  })
})

describe('shouldSkipAuthBootstrapRefresh (P04 cold /workspace)', () => {
  beforeEach(() => {
    resetBootstrapCoordForTests()
  })

  it('does not skip when the session user is not hydrated yet', () => {
    markBootstrapFetched(true, 'null')
    expect(shouldSkipAuthBootstrapRefresh('u-tenant', null)).toBe(false)
    expect(shouldSkipAuthBootstrapRefresh('u-tenant', 'u-other')).toBe(false)
  })

  it('skips duplicate refresh when the same user just hydrated', () => {
    markBootstrapFetched(true, 'tenant:u-tenant')
    expect(shouldSkipAuthBootstrapRefresh('u-tenant', 'u-tenant')).toBe(true)
  })
})

describe('resetBootstrapCoordForRetry (P04 portal Try again)', () => {
  beforeEach(() => {
    resetBootstrapCoordForTests()
  })

  it('clears lite cooldown so the next fetch runs after a forced retry', async () => {
    const fetcher = vi.fn(async () => stubBoot('retry'))
    markBootstrapFetched(true, 'tenant:u-tenant')
    const cooled = await dedupeBootstrapFetch(true, fetcher, { actorKey: 'tenant:u-tenant' })
    expect(cooled).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
    resetBootstrapCoordForRetry()
    const boot = await dedupeBootstrapFetch(true, fetcher, { actorKey: 'tenant:u-tenant' })
    expect(boot?.fetchedAt).toBe('retry')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('shouldIgnoreBootstrapMissAfterFetch (P09b portal retry)', () => {
  beforeEach(() => {
    resetBootstrapCoordForTests()
  })

  it('never ignores a forced portal retry', () => {
    markBootstrapFetched(true, 'tenant:u-tenant')
    expect(
      shouldIgnoreBootstrapMissAfterFetch({
        force: true,
        sessionUserId: 'u-tenant',
        hydratedForUserId: null,
      }),
    ).toBe(false)
  })

  it('ignores duplicate auth refresh after a recent hydrate', () => {
    markBootstrapFetched(true, 'tenant:u-tenant')
    expect(
      shouldIgnoreBootstrapMissAfterFetch({
        sessionUserId: 'u-tenant',
        hydratedForUserId: 'u-tenant',
      }),
    ).toBe(true)
  })
})

describe('bootstrapActorKey', () => {
  it('keys null actor distinctly from tenant', () => {
    expect(bootstrapActorKey(null)).toBe('null')
    expect(bootstrapActorKey({ userId: 'u-1', role: 'tenant' })).toBe('tenant:u-1')
    expect(bootstrapActorKey({ userId: 'u-1', role: null })).toBe('unknown:u-1')
  })
})

describe('dedupeBootstrapFetch actor isolation (remint56)', () => {
  beforeEach(() => {
    resetBootstrapCoordForTests()
  })

  it('does not share inflight across null vs tenant actor keys', async () => {
    let nullResolve!: (v: PostgresBootstrap | null) => void
    const nullPromise = new Promise<PostgresBootstrap | null>((r) => {
      nullResolve = r
    })

    const nullFetcher = vi.fn(() => nullPromise)
    const tenantFetcher = vi.fn(async () => stubBoot('tenant'))

    const pNull = dedupeBootstrapFetch(true, nullFetcher, { actorKey: 'null' })
    const pTenant = dedupeBootstrapFetch(true, tenantFetcher, {
      actorKey: 'tenant:u-50cc6e30',
    })

    expect(nullFetcher).toHaveBeenCalledTimes(1)
    expect(tenantFetcher).toHaveBeenCalledTimes(1)

    nullResolve(stubBoot('null'))
    const [nullBoot, tenantBoot] = await Promise.all([pNull, pTenant])
    expect(nullBoot?.fetchedAt).toBe('null')
    expect(tenantBoot?.fetchedAt).toBe('tenant')
  })

  it('does not start lite cooldown until AppStore marks a successful hydrate', async () => {
    const fetcher = vi.fn(async () => stubBoot('first'))
    const first = await dedupeBootstrapFetch(true, fetcher, { actorKey: 'super_admin:sa-1' })
    expect(first?.fetchedAt).toBe('first')
    expect(fetcher).toHaveBeenCalledTimes(1)
    // Cooldown is applied only after markBootstrapFetched (post-hydrate), not on raw fetch.
    const second = await dedupeBootstrapFetch(true, fetcher, { actorKey: 'super_admin:sa-1' })
    expect(second?.fetchedAt).toBe('first')
    expect(fetcher).toHaveBeenCalledTimes(2)
    markBootstrapFetched(true, 'super_admin:sa-1')
    const cooled = await dedupeBootstrapFetch(true, fetcher, { actorKey: 'super_admin:sa-1' })
    expect(cooled).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('shares inflight for the same actor key', async () => {
    let resolve!: (v: PostgresBootstrap | null) => void
    const shared = new Promise<PostgresBootstrap | null>((r) => {
      resolve = r
    })
    const fetcher = vi.fn(() => shared)

    const a = dedupeBootstrapFetch(true, fetcher, { actorKey: 'tenant:u-1' })
    const b = dedupeBootstrapFetch(true, fetcher, { actorKey: 'tenant:u-1' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    resolve(stubBoot('same'))
    expect((await a)?.fetchedAt).toBe('same')
    expect((await b)?.fetchedAt).toBe('same')
  })
})
