import { describe, expect, it } from 'vitest'
import { emptyPublicMarketplaceBootstrap } from './publicMarketplaceDemo'

describe('emptyPublicMarketplaceBootstrap', () => {
  it('returns no demo listings', () => {
    const boot = emptyPublicMarketplaceBootstrap()
    expect(boot.properties).toEqual([])
    expect(boot.units).toEqual([])
    expect(boot.buildings).toEqual([])
    expect(boot.users).toEqual([])
  })
})
