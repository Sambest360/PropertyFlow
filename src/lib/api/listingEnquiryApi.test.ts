import { describe, expect, it } from 'vitest'
import { formatListingEnquiryError } from './listingEnquiryApi'

describe('formatListingEnquiryError', () => {
  it('maps slot_not_found to friendly copy', () => {
    expect(formatListingEnquiryError('slot_not_found')).toMatch(/no longer available/i)
  })

  it('maps timeouts', () => {
    expect(formatListingEnquiryError('timeout')).toMatch(/too long/i)
  })
})
