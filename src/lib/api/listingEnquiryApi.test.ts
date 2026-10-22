import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./config', () => ({
  isApiEnabled: false,
  isSupabaseMode: true,
}))

const rpc = vi.fn()

vi.mock('../../utils/supabase/client', () => ({
  createClient: () => ({ rpc }),
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
  beforeEach(() => {
    rpc.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns ok: false on RPC error (no fake guest lead)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'enquiry_failed' } })
    const result = await submitListingEnquiry(baseInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeTruthy()
  })

  it('returns ok: false when RPC hangs past timeout', async () => {
    vi.useFakeTimers()
    rpc.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves */
        }),
    )
    const pending = submitListingEnquiry(baseInput)
    await vi.advanceTimersByTimeAsync(15_001)
    const result = await pending
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/too long/i)
  })
})
