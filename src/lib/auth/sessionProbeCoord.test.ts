import { describe, expect, it } from 'vitest'
import { isStaleSessionProbe } from './sessionProbeCoord'

describe('isStaleSessionProbe (FW-09 password change)', () => {
  it('treats mismatched generations as stale', () => {
    expect(isStaleSessionProbe(0, 1)).toBe(true)
    expect(isStaleSessionProbe(1, 2)).toBe(true)
  })

  it('accepts results when generation is unchanged', () => {
    expect(isStaleSessionProbe(0, 0)).toBe(false)
    expect(isStaleSessionProbe(3, 3)).toBe(false)
  })
})
