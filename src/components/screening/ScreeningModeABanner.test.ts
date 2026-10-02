import { describe, expect, it } from 'vitest'
import { SCREENING_MODE_A_COPY } from './ScreeningModeABanner'

describe('Screening Mode A honesty copy', () => {
  it('denies live TPN / live bureau claims', () => {
    expect(SCREENING_MODE_A_COPY).toMatch(/Mode A soft-demo/i)
    expect(SCREENING_MODE_A_COPY).toMatch(/not live TPN/i)
    expect(SCREENING_MODE_A_COPY).toMatch(/mock or manual/i)
    expect(SCREENING_MODE_A_COPY.toLowerCase()).not.toMatch(/live bureau http/)
    expect(SCREENING_MODE_A_COPY.toLowerCase()).not.toMatch(/bureau cleared/)
  })
})
