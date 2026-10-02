import { describe, expect, it } from 'vitest'
import { PCR_MODE_A_COPY } from './PcrModeABanner'

describe('PCR Mode A honesty copy', () => {
  it('states soft-demo / not RHA / not PropertyInspect parity', () => {
    expect(PCR_MODE_A_COPY).toMatch(/Mode A soft-demo/i)
    expect(PCR_MODE_A_COPY).toMatch(/not RHA legal advice/i)
    expect(PCR_MODE_A_COPY).toMatch(/not PropertyInspect/i)
    expect(PCR_MODE_A_COPY.toLowerCase()).not.toMatch(/rha certified/)
  })
})
