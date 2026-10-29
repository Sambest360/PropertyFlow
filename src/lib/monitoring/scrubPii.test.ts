import { describe, expect, it } from 'vitest'
import { scrubEvent, scrubText } from './scrubPii'

describe('scrubText', () => {
  it('redacts emails', () => {
    expect(scrubText('contact user@example.com now')).toBe('contact [email] now')
  })

  it('redacts SA phone numbers', () => {
    expect(scrubText('call +27 82 555 1234 or 082-555-1234')).toContain('[phone]')
  })

  it('redacts 13-digit SA ID', () => {
    expect(scrubText('id 8001015009087 end')).toBe('id [sa-id] end')
  })

  it('redacts JWT-shaped strings', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
    expect(scrubText(`token ${jwt}`)).toBe('token [jwt]')
  })

  it('redacts sensitive query params', () => {
    expect(scrubText('/x?access_token=secret&foo=1')).toBe('/x?access_token=[redacted]&foo=1')
    expect(scrubText('#password=abc')).toBe('#password=[redacted]')
  })
})

describe('scrubEvent', () => {
  it('strips cookies and auth headers from request', () => {
    const event = {
      request: {
        url: 'https://api.test/path?token=abc',
        cookies: { sid: 'x' },
        headers: {
          authorization: 'Bearer x',
          cookie: 'a=b',
          apikey: 'k',
          'content-type': 'application/json',
        },
      },
    }
    const out = scrubEvent(event)
    expect(out.request.cookies).toBeUndefined()
    expect(out.request.headers).toEqual({ 'content-type': 'application/json' })
    expect(out.request.url).toContain('[redacted]')
  })

  it('keeps only user id', () => {
    const event = {
      user: { id: 'u-1', email: 'a@b.com', ip_address: '1.2.3.4', username: 'x' },
    }
    expect(scrubEvent(event).user).toEqual({ id: 'u-1' })
  })

  it('scrubs exception values and breadcrumbs', () => {
    const event = {
      exception: { values: [{ value: 'failed for user@x.com' }] },
      breadcrumbs: { values: [{ message: 'hit user@x.com', url: '/?token=1' }] },
    }
    const out = scrubEvent(event)
    expect(out.exception.values[0].value).toBe('failed for [email]')
    expect(out.breadcrumbs.values[0].message).toBe('hit [email]')
    expect(out.breadcrumbs.values[0].url).toContain('[redacted]')
  })

  it('does not throw on malformed input', () => {
    expect(scrubEvent(null)).toBe(null)
    expect(scrubEvent('x' as unknown as Record<string, unknown>)).toBe('x')
  })
})
