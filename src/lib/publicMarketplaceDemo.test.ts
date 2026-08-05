import { describe, expect, it } from 'vitest'
import { buildPublicMarketplaceDemoBootstrap } from './publicMarketplaceDemo'
import { isPubliclyListed } from './publicListings'

describe('buildPublicMarketplaceDemoBootstrap', () => {
  it('includes published listings for guest browse', () => {
    const boot = buildPublicMarketplaceDemoBootstrap()
    expect(boot.properties.length).toBeGreaterThan(0)
    expect(
      boot.properties.every((p) => isPubliclyListed(p, { units: boot.units, users: boot.users })),
    ).toBe(true)
  })

  it('includes both rent and sale listings', () => {
    const boot = buildPublicMarketplaceDemoBootstrap()
    const modes = new Set(boot.properties.map((p) => p.listingMode))
    expect(modes.has('rent') || modes.has('sale') || modes.has('both')).toBe(true)
  })
})
