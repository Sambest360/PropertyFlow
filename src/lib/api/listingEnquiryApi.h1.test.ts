import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * H1 (spec r5 :84-85, Oscar A5, Jim C10): the public form's 429 text is
 * neutral (no limit, count or IP), says try again shortly or contact the
 * agency, and names the staff lead screen for agency staff.
 */
vi.mock('./config', () => ({ isApiEnabled: true }))

import { ENQUIRY_RATE_LIMITED_COPY, submitListingEnquiry } from './listingEnquiryApi'
import { LEAD_SCREEN_WALK_IN_HELP } from '../leadScreenCopy'

const input = { propertyId: 'PR-1011', action: 'lead' as const, firstName: 'K', lastName: 'B', email: 'k@example.com' }
const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('H1 public enquiry 429 copy', () => {
  it('a 429 shows the neutral copy, whatever text the server sent', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'rate_limited', message: 'Too many attempts from 198.51.100.1' }), { status: 429, headers: { 'Retry-After': '600' } }),
    )
    const r = await submitListingEnquiry(input)
    expect(r).toEqual({ ok: false, error: ENQUIRY_RATE_LIMITED_COPY, waitlist: false })
  })

  it('the copy is neutral, says try again shortly or contact the agency, and names the staff lead screen', () => {
    expect(ENQUIRY_RATE_LIMITED_COPY).toMatch(/try again shortly/i)
    expect(ENQUIRY_RATE_LIMITED_COPY).toMatch(/contact the agency/i)
    expect(ENQUIRY_RATE_LIMITED_COPY).toMatch(/agency staff/i)
    expect(ENQUIRY_RATE_LIMITED_COPY).toMatch(/staff lead screen/i)
    expect(ENQUIRY_RATE_LIMITED_COPY).not.toMatch(/\bIP\b|limit|attempt|too many|\d/i)
  })

  it('the staff lead-screen help says walk-in enquiries go through the staff lead screen (C10)', () => {
    expect(LEAD_SCREEN_WALK_IN_HELP).toMatch(/walk-in enquiries/i)
    expect(LEAD_SCREEN_WALK_IN_HELP).toMatch(/lead screen/i)
    expect(LEAD_SCREEN_WALK_IN_HELP).toMatch(/not the public/i)
  })
})
