import { describe, expect, it } from 'vitest'
import { SYNDICATION_MODE_A_COPY } from './SyndicationModeABanner'

describe('Syndication Mode A honesty copy', () => {
  it('states own-site / manual pack — not live P24', () => {
    expect(SYNDICATION_MODE_A_COPY).toMatch(/Mode A soft-demo/i)
    expect(SYNDICATION_MODE_A_COPY).toMatch(/own-site marketplace/i)
    expect(SYNDICATION_MODE_A_COPY).toMatch(/not live P24/i)
    expect(SYNDICATION_MODE_A_COPY.toLowerCase()).not.toMatch(/portal parity live/)
  })
})
