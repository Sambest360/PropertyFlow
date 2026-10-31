import { describe, expect, it } from 'vitest'
import { erfSizeFieldState, initialUnitErfSizeSupported, unitErfSizeSupportedFromBootstrap } from './unitErfSizeSupport'

describe('erf size support flag (T2, migration 037)', () => {
  it('API mode starts unsupported, local mode supported', () => {
    expect(initialUnitErfSizeSupported({ apiEnabled: true })).toBe(false)
    expect(initialUnitErfSizeSupported({ apiEnabled: false })).toBe(true)
  })
  it('only an explicit true from the bootstrap counts', () => {
    expect(unitErfSizeSupportedFromBootstrap({ unitErfSizeSupported: true })).toBe(true)
    expect(unitErfSizeSupportedFromBootstrap({ unitErfSizeSupported: false })).toBe(false)
    expect(unitErfSizeSupportedFromBootstrap({})).toBe(false)
  })
  it('disables the field with a hint while unsupported', () => {
    expect(erfSizeFieldState(true)).toEqual({ disabled: false, hint: null })
    expect(erfSizeFieldState(false).disabled).toBe(true)
    expect(erfSizeFieldState(false).hint).toMatch(/Not saved yet/)
    // agency wording, no developer terms in the UI (Jim C5)
    expect(erfSizeFieldState(false).hint).not.toMatch(/migration|037|database/i)
  })
})
