import { describe, expect, it } from 'vitest'
import { shouldShowAddressLine } from './addressLines'

describe('shouldShowAddressLine (P2)', () => {
  it('title equal to the address: hidden', () => {
    expect(shouldShowAddressLine('12 Main Rd', '12 Main Rd')).toBe(false)
  })
  it('case, spacing and comma differences: hidden', () => {
    expect(shouldShowAddressLine('12  MAIN Rd, Walmer', '12 main rd walmer')).toBe(false)
  })
  it('address contained in the title: hidden', () => {
    expect(shouldShowAddressLine('Sea View, 12 Main Rd', '12 Main Rd')).toBe(false)
  })
  it('"Unit 4, 12 Main Rd" vs "12 Main Rd, 4": not contained, so both show', () => {
    expect(shouldShowAddressLine('Unit 4, 12 Main Rd', '12 Main Rd, 4')).toBe(true)
  })
  it('empty address: hidden', () => {
    expect(shouldShowAddressLine('Sea View', '')).toBe(false)
    expect(shouldShowAddressLine('Sea View', undefined)).toBe(false)
  })
  it('a different address: shown', () => {
    expect(shouldShowAddressLine('Sea View Flat', '12 Main Rd')).toBe(true)
  })
  it('matches whole words only: "12 Main Rd" is not hidden under "112 Main Rd"', () => {
    expect(shouldShowAddressLine('112 Main Rd', '12 Main Rd')).toBe(true)
    expect(shouldShowAddressLine('Sea View 12 Main Rd', '12 Main Rd')).toBe(false)
  })
  it('whole-word cases still show both lines', () => {
    expect(shouldShowAddressLine('112 Main Rd', '12 Main Rd')).toBe(true)
    expect(shouldShowAddressLine('Unit 14', '4')).toBe(true)
    expect(shouldShowAddressLine('12', '12 Main Rd')).toBe(true)
  })
})
