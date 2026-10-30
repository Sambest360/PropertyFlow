import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./config', () => ({ isApiEnabled: true }))

import { submitListingEnquiry } from './listingEnquiryApi'

/** T1: Register interest does not collect or send an ID / passport number. */
describe('T1: Register interest sends no ID number', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('never puts idNumber in the enquiry body, even if a caller passes one', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, leadId: 'LD-1', stage: 'New Lead' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const res = await submitListingEnquiry({
      propertyId: 'PR-1',
      action: 'lead',
      firstName: 'Sam',
      lastName: 'Test',
      email: 'sam@example.com',
      idNumber: '8001015009087',
    } as Parameters<typeof submitListingEnquiry>[0])
    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body).not.toHaveProperty('idNumber')
    expect(JSON.stringify(body)).not.toContain('8001015009087')
  })

  it('the listing enquiry form has no ID / passport field', () => {
    const src = readFileSync(fileURLToPath(new URL('../../pages/market/ListingDetail.tsx', import.meta.url)), 'utf8')
    expect(src).not.toMatch(/SA ID or passport/i)
    expect(src).not.toMatch(/\bidNumber\b/)
  })
})
