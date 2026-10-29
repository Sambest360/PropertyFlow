import { describe, expect, it, vi } from 'vitest'

vi.mock('./config', () => ({
  isApiEnabled: false,
}))

import { formatListingEnquiryError, submitListingEnquiry } from './listingEnquiryApi'

const baseInput = {
  propertyId: 'PR-1',
  action: 'lead' as const,
  firstName: 'Sam',
  lastName: 'Test',
  email: 'sam@example.com',
}

describe('formatListingEnquiryError', () => {
  it('maps slot_not_found to friendly copy', () => {
    expect(formatListingEnquiryError('slot_not_found')).toMatch(/no longer available/i)
  })

  it('maps timeouts', () => {
    expect(formatListingEnquiryError('timeout')).toMatch(/too long/i)
  })

  it('maps missing RPC / schema cache errors', () => {
    const msg =
      'Could not find the function public.submit_public_listing_enquiry(...) in the schema cache'
    expect(formatListingEnquiryError(msg)).toMatch(/not available on this environment/i)
  })
})

describe('submitListingEnquiry', () => {
  it('returns ok: false when the API is unavailable (no fake guest lead)', async () => {
    const result = await submitListingEnquiry(baseInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeTruthy()
  })
})
