import { describe, expect, it } from 'vitest'
import { storageLevel } from './agencyStorage.js'

const MB = 1024 * 1024

describe('storageLevel', () => {
  it('is unlimited without an allowance', () => {
    expect(storageLevel(10 * MB, null, 80)).toBe('unlimited')
  })
  it('warns at the warning percentage and flags going over', () => {
    expect(storageLevel(79 * MB, 100, 80)).toBe('ok')
    expect(storageLevel(80 * MB, 100, 80)).toBe('warning')
    expect(storageLevel(100 * MB, 100, 80)).toBe('exceeded')
  })
})
