import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * T3 (spec r4): the enquiry API client.
 * - No fake `LD-guest-${Date.now()}` reference: a 2xx without a leadId is an error.
 * - A repeat (duplicate: true) comes through so the form can say "already registered",
 *   with NO reference, even if a server sent one (F4).
 * - A 20 s timeout is an error, never a fake success (spec r5 wording).
 *
 * B2: narrow with `res.ok === false` (tsconfig.app has no strictNullChecks, so
 * `!res.ok` does not narrow the union and `res.error` was TS2339).
 * - The only request is POST /api/public/listing-enquiry (no /api/persist).
 */
vi.mock('./config', () => ({ isApiEnabled: true }))

import { submitListingEnquiry } from './listingEnquiryApi'

const input = {
  propertyId: 'PR-1011',
  action: 'lead' as const,
  firstName: 'Kelly',
  lastName: 'Buyer',
  email: 'kelly@example.com',
  phone: '0821234567',
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const fetchMock = vi.fn()
/** Spec r5 T3 timeout wording, exact. */
const TIMEOUT_COPY =
  'The server took too long. Your enquiry may have been received. Try again and we will tell you if it is already registered.'

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('T3 submitListingEnquiry', () => {
  it('returns the server reference and calls only the public enquiry route', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, leadId: 'LD-guest-1-abc', stage: 'New Lead' }))
    const res = await submitListingEnquiry(input)
    expect(res).toMatchObject({ ok: true, leadId: 'LD-guest-1-abc' })
    if (res.ok === true) expect(res.duplicate).not.toBe(true)
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls).toHaveLength(1)
    expect(urls[0]).toMatch(/\/api\/public\/listing-enquiry$/)
    expect(urls.some((u) => u.includes('/api/persist'))).toBe(false)
  })

  it('a 2xx without a leadId is an error, not a fake LD-guest reference', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, stage: 'New Lead' }))
    const res = await submitListingEnquiry(input)
    expect(res.ok).toBe(false)
    if (res.ok === false) expect(res.error).toMatch(/could not save/i)
    expect(JSON.stringify(res)).not.toMatch(/LD-guest/)
  })

  it('a whitespace-only leadId is an error, not a saved enquiry (M14)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, leadId: '   ', stage: 'New Lead' }))
    const res = await submitListingEnquiry(input)
    expect(res.ok).toBe(false)
    if (res.ok === false) expect(res.error).toMatch(/could not save/i)
  })

  it('a slot booking that matched an existing lead (no leadId, a booking id) is a real save, referenced by the booking', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, { ok: true, leadId: null, bookingId: 'VW-guest-1-abc', stage: 'Viewing Scheduled', duplicate: false }),
    )
    const res = await submitListingEnquiry({ ...input, action: 'viewing', slotId: 'VS-1' })
    expect(res).toMatchObject({ ok: true, leadId: null, bookingId: 'VW-guest-1-abc' })
    if (res.ok === true) expect(res.duplicate).not.toBe(true)
  })

  it('a 2xx with neither a leadId nor a booking id is an error', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, leadId: null, bookingId: '  ', stage: 'New Lead' }))
    const res = await submitListingEnquiry(input)
    expect(res.ok).toBe(false)
  })

  it('passes duplicate: true through and drops any reference a server sent (F4)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, { ok: true, leadId: 'LD-guest-old', stage: 'New Lead', duplicate: true }),
    )
    const res = await submitListingEnquiry(input)
    expect(res).toEqual({ ok: true, duplicate: true })
    expect(JSON.stringify(res)).not.toMatch(/LD-guest-old/)
  })

  it('a duplicate with no reference at all is still "already registered", not an error', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, leadId: null, stage: 'New Lead', duplicate: true }))
    const res = await submitListingEnquiry(input)
    expect(res).toEqual({ ok: true, duplicate: true })
  })

  it('a 20 s timeout gives an error', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted.')
            err.name = 'AbortError'
            reject(err)
          })
        }),
    )
    const pending = submitListingEnquiry(input)
    await vi.advanceTimersByTimeAsync(19_999)
    let settled = false
    void pending.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const res = await pending
    expect(res.ok).toBe(false)
    if (res.ok === false) expect(res.error).toBe(TIMEOUT_COPY)
  })
})
