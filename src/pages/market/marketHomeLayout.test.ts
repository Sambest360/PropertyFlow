import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** G07 regression: home story must not widen the page at 390px (FW-01). */
describe('MarketHome layout guards', () => {
  it('index.css clips horizontal overflow on the home story', () => {
    const css = readFileSync('src/index.css', 'utf8')
    expect(css).toMatch(/overflow-x:\s*clip|overflow:\s*hidden/)
  })

  it('MarketHome story section uses overflow containment', () => {
    const src = readFileSync('src/pages/market/MarketHome.tsx', 'utf8')
    expect(src).toContain('id="home-story"')
    expect(src).toContain('overflow-x-clip')
  })
})
