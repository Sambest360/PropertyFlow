import { describe, expect, it, vi } from 'vitest'
import {
  applicationReceivedNotifyRequest,
  notifyApplicationReceived,
} from './applicationReceivedNotify'

describe('application received notify', () => {
  it('sends only the reference code with a bearer token', () => {
    const { url, init } = applicationReceivedNotifyRequest('APP-100', 'tok-1')
    expect(url).toBe('/api/notify/application-received')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok-1')
    expect(JSON.parse(init.body)).toEqual({ referenceCode: 'APP-100' })
    expect(Object.keys(JSON.parse(init.body))).toEqual(['referenceCode'])
  })

  it('posts that request and skips the call when there is no session', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    await notifyApplicationReceived('APP-100', {
      fetchImpl,
      getAccessToken: async () => 'tok-1',
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/notify/application-received')
    expect(JSON.parse(String(init.body))).toEqual({ referenceCode: 'APP-100' })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1')

    fetchImpl.mockClear()
    await notifyApplicationReceived('APP-100', {
      fetchImpl,
      getAccessToken: async () => null,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
