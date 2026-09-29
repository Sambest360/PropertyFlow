import { describe, expect, it, vi } from 'vitest'
import {
  applicationCreateRequest,
  submitApplicationViaApi,
  viteEnableApiIsOn,
} from './applicationCreate'

const application = {
  id: 'APP-100',
  agencyId: 'ag-1',
  propertyId: 'prop-1',
  applicantName: 'Ada Applicant',
  email: 'ada@example.com',
  phone: '0820000000',
  type: 'Rental',
  income: 12345,
  grossMonthlyIncomeCents: 1234567,
  idType: 'sa_id',
  idNumberOrPassport: '9001015009086',
}

describe('VITE_ENABLE_API', () => {
  it('is on only for 1 and true', () => {
    expect(viteEnableApiIsOn('1')).toBe(true)
    expect(viteEnableApiIsOn('true')).toBe(true)
    expect(viteEnableApiIsOn('0')).toBe(false)
    expect(viteEnableApiIsOn('')).toBe(false)
    expect(viteEnableApiIsOn(undefined)).toBe(false)
    expect(viteEnableApiIsOn('yes')).toBe(false)
  })
})

describe('POST /api/applications', () => {
  it('posts the application with a bearer token from the session', () => {
    const { url, init } = applicationCreateRequest(application, 'tok-1', 'https://api.example')
    expect(url).toBe('https://api.example/api/applications')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok-1')
    const body = JSON.parse(init.body) as Record<string, unknown>
    expect(body).toEqual(application)
    expect(body.id).toBe('APP-100')
    expect(body).not.toHaveProperty('referenceCode')
    expect(url).not.toContain('/api/notify/application-received')
  })

  it('sends that request and does not call notify', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }))
    await submitApplicationViaApi(application, {
      fetchImpl,
      getAccessToken: async () => 'tok-1',
      apiBase: '',
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/applications')
    expect(url).not.toBe('/api/notify/application-received')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.id).toBe('APP-100')
    expect(body).not.toEqual({ referenceCode: 'APP-100' })
    expect(Object.keys(body)).not.toEqual(['referenceCode'])
  })

  it('does not post when the session has no access token', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await submitApplicationViaApi(application, {
      fetchImpl,
      getAccessToken: async () => null,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('does not post a body without an id', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await submitApplicationViaApi(
      { applicantName: 'Ada' },
      { fetchImpl, getAccessToken: async () => 'tok-1' },
    )
    expect(fetchImpl).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
