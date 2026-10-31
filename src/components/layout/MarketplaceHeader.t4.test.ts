import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('MarketplaceHeader search (T4)', () => {
  it('builds the URL with the current mode kept', () => {
    const src = readFileSync('src/components/layout/MarketplaceHeader.tsx', 'utf8')
    expect(src).not.toContain('navigate(`/browse?q=${encodeURIComponent(q.trim())}`)')
    expect(src).toContain('navigate(browseSearchUrlKeepingMode(location.search, q))')
  })
})
