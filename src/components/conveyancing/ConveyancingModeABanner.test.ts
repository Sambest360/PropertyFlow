import { describe, expect, it } from 'vitest'
import { CONVEYANCING_MODE_A_COPY } from './ConveyancingModeABanner'

describe('Conveyancing Mode A honesty copy', () => {
  it('never claims live attorney, deeds, or bond partner', () => {
    expect(CONVEYANCING_MODE_A_COPY).toMatch(/Mode A soft-demo/i)
    expect(CONVEYANCING_MODE_A_COPY).toMatch(/staff-recorded/i)
    expect(CONVEYANCING_MODE_A_COPY).toMatch(/not a live attorney portal/i)
    expect(CONVEYANCING_MODE_A_COPY).toMatch(/not a quote/i)
    expect(CONVEYANCING_MODE_A_COPY).not.toMatch(/successfully lodged at the Deeds Office/i)
  })
})
