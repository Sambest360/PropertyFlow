import { describe, expect, it } from 'vitest'
import { FICA_PACK_MODE_A_COPY } from './FicaPackModeABanner'

describe('FICA pack Mode A honesty copy', () => {
  it('states Mode A and denies live bureau / live FICA', () => {
    expect(FICA_PACK_MODE_A_COPY).toMatch(/Mode A soft-demo/i)
    expect(FICA_PACK_MODE_A_COPY).toMatch(/not live bureau/i)
    expect(FICA_PACK_MODE_A_COPY).toMatch(/not live FICA verification/i)
  })
})
