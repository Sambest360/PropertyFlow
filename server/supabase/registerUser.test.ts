import { describe, expect, it } from 'vitest'
import { resolveSignupRole } from './registerUser.js'

describe('signup role', () => {
  it('does not make the first user a super admin', () => {
    expect(resolveSignupRole('tenant')).toBe('tenant')
    expect(resolveSignupRole(undefined)).toBe('tenant')
    expect(resolveSignupRole('super_admin')).toBe('tenant')
    expect(resolveSignupRole('client_admin')).toBe('tenant')
  })

  it('keeps the public portal roles', () => {
    expect(resolveSignupRole('landlord')).toBe('landlord')
    expect(resolveSignupRole('contractor')).toBe('contractor')
    expect(resolveSignupRole('applicant')).toBe('tenant')
  })
})
