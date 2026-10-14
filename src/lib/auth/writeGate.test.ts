import { describe, expect, it } from 'vitest'
import { assertCanPersistWrites, canPersistWrites, setWriteGateHydration } from './writeGate'

describe('canPersistWrites', () => {
  it('allows guest/demo writes without hydration', () => {
    expect(canPersistWrites(null, null)).toBe(true)
    expect(canPersistWrites(null, 'guest')).toBe(true)
  })

  it('blocks signed-in writes until hydration matches session user', () => {
    expect(canPersistWrites(null, 'u-1')).toBe(false)
    expect(canPersistWrites('u-2', 'u-1')).toBe(false)
    expect(canPersistWrites('u-1', 'u-1')).toBe(true)
  })

  it('assertCanPersistWrites reads hydration ref from AppStore hook', () => {
    setWriteGateHydration(null)
    expect(assertCanPersistWrites()).toBe(true)
    setWriteGateHydration('u-1')
    expect(assertCanPersistWrites()).toBe(true)
  })
})
