import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { acquireSubmitLock, releaseSubmitLock } from './wizardSubmitGuard'

describe('wizardSubmitGuard', () => {
  it('allows only one concurrent acquire until released', () => {
    const lock = { current: false }
    expect(acquireSubmitLock(lock)).toBe(true)
    expect(acquireSubmitLock(lock)).toBe(false)
    releaseSubmitLock(lock)
    expect(acquireSubmitLock(lock)).toBe(true)
    releaseSubmitLock(lock)
  })

  it('property wizard uses synchronous submit lock (FW-10 / FW-08 L03)', () => {
    const source = readFileSync('src/pages/property/PropertyCreatePage.tsx', 'utf8')
    expect(source).toContain('acquireSubmitLock')
    expect(source).toContain('submitLockRef')
    expect(source).toContain('sweetToast')
  })
})
