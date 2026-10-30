import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * T3 / Jim C3: the public form never shows raw server or database text.
 * Unknown codes map to the generic message; contact_required and
 * property_not_found get plain copy. Covers an older server that still
 * echoes err.message.
 */
vi.mock('./config', () => ({ isApiEnabled: true }))

import { formatListingEnquiryError, submitListingEnquiry } from './listingEnquiryApi'

const GENERIC = 'We could not save your enquiry. Try again in a moment.'

const input = {
  propertyId: 'PR-1011',
  action: 'lead' as const,
  firstName: 'Kelly',
  lastName: 'Buyer',
  email: 'kelly@example.com',
}

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('T3 C3 formatListingEnquiryError', () => {
  it('maps an unknown code or raw database text to the generic message', () => {
    expect(formatListingEnquiryError('relation "leads" does not exist')).toBe(GENERIC)
    expect(formatListingEnquiryError('duplicate key value violates unique constraint "leads_pkey"')).toBe(GENERIC)
    expect(formatListingEnquiryError('some_new_code')).toBe(GENERIC)
    expect(formatListingEnquiryError('')).toBe(GENERIC)
  })

  it('gives plain copy for contact_required and property_not_found', () => {
    expect(formatListingEnquiryError('contact_required')).toMatch(/email or phone/i)
    expect(formatListingEnquiryError('property_not_found')).toMatch(/no longer listed/i)
  })

  it('keeps the existing mapped copy', () => {
    expect(formatListingEnquiryError('slot_unavailable')).toMatch(/filled up/i)
    expect(formatListingEnquiryError('NOTICE_TOO_SHORT')).toMatch(/more notice/i)
    expect(formatListingEnquiryError('timeout')).toMatch(/too long/i)
  })
})

describe('T3 C3 submitListingEnquiry', () => {
  it('a server that echoes raw database text shows only the generic message', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'enquiry_failed', message: 'column "foo" of relation "leads" does not exist' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const r = await submitListingEnquiry(input)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe(GENERIC)
      expect(r.error).not.toMatch(/relation|column/)
    }
  })
})
