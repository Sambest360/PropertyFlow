import { describe, expect, it } from 'vitest'
import { mustChangePasswordFromMetadata } from './mustChangePassword'

describe('mustChangePasswordFromMetadata (FW-12 staff temp password)', () => {
  it('is true only when metadata.mustChangePassword is boolean true', () => {
    expect(mustChangePasswordFromMetadata({ mustChangePassword: true })).toBe(true)
    expect(mustChangePasswordFromMetadata({ mustChangePassword: false })).toBe(false)
    expect(mustChangePasswordFromMetadata({ mustChangePassword: 'true' })).toBe(false)
    expect(mustChangePasswordFromMetadata({})).toBe(false)
    expect(mustChangePasswordFromMetadata(null)).toBe(false)
    expect(mustChangePasswordFromMetadata(undefined)).toBe(false)
  })
})
