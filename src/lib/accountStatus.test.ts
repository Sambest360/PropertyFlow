import { describe, expect, it } from 'vitest'
import { accountStatusLabel } from './accountStatus'

describe('accountStatusLabel', () => {
  it('is Pending until the email is confirmed', () => {
    expect(accountStatusLabel({ active: true, emailVerified: false })).toBe('Pending')
    expect(accountStatusLabel({ active: true })).toBe('Active')
    expect(accountStatusLabel({ active: false, emailVerified: false })).toBe('Disabled')
    expect(accountStatusLabel({ active: false }, 'Inactive')).toBe('Inactive')
  })
})
