import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * T3 (spec r4): the enquiry API client.
 * - No fake `LD-guest-${Date.now()}` reference: a 2xx without a leadId is an error.
 * - A repeat (duplicate: true) comes through so the form can say "already registered".
 * - A 20 s timeout is an error, never a fake success.
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
    if (res.ok) expect(res.duplicate).not.toBe(true)
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls).toHaveLength(1)
    expect(urls[0]).toMatch(/\/api\/public\/listing-enquiry$/)
    expect(urls.some((u) => u.includes('/api/persist'))).toBe(false)
  })

  it('a 2xx without a leadId is an error, not a fake LD-guest reference', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, stage: 'New Lead' }))
    const res = await submitListingEnquiry(input)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/could not save/i)
    expect(JSON.stringify(res)).not.toMatch(/LD-guest/)
  })

  it('passes duplicate: true through with the original reference', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, { ok: true, leadId: 'LD-guest-old', stage: 'New Lead', duplicate: true }),
    )
    const res = await submitListingEnquiry(input)
    expect(res).toMatchObject({ ok: true, leadId: 'LD-guest-old', duplicate: true })
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
    if (!res.ok) expect(res.error).toMatch(/took too long/i)
  })
})
