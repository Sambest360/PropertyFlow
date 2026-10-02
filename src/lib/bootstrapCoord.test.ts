import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { PostgresBootstrap } from './api/postgresClient'
import {
  bootstrapActorKey,
  dedupeBootstrapFetch,
  resetBootstrapCoordForTests,
} from './bootstrapCoord'

function stubBoot(tag: string): PostgresBootstrap {
  return { fetchedAt: tag } as PostgresBootstrap
}

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
