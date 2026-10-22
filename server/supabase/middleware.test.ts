import { describe, expect, it } from 'vitest'
import { shouldSkipSupabaseRefresh } from './middleware.js'

describe('shouldSkipSupabaseRefresh', () => {
  it('skips GET public marketplace routes', () => {
    expect(shouldSkipSupabaseRefresh('/api/public/marketplace', 'GET')).toBe(true)
  })

  it('does not skip POST public listing enquiry', () => {
    expect(shouldSkipSupabaseRefresh('/api/public/listing-enquiry', 'POST')).toBe(false)
  })

  it('skips auth routes', () => {
    expect(shouldSkipSupabaseRefresh('/api/auth/login', 'POST')).toBe(true)
  })
})
