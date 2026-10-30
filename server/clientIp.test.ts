import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clientIp, clientIpOrNull, resetClientIpWarningForTests } from './clientIp'

/**
 * H1 (spec r5 :49, Jim C3): clientIp(c) trusts forwarding headers only from
 * the loopback nginx hop. Driven through a real Hono app; the peer address is
 * the node-server binding (env.incoming.socket), exactly what
 * @hono/node-server hands the app in production.
 */
const peer = (remoteAddress: string | undefined, remoteFamily = 'IPv4') => ({
  incoming: { socket: { remoteAddress, remotePort: 40123, remoteFamily } },
})

const app = new Hono()
app.get('/ip', (c) => c.json({ ip: clientIp(c), orNull: clientIpOrNull(c) }))

async function ipFor(headers: Record<string, string>, env?: unknown) {
  const res = await app.request('/ip', { headers }, env as never)
  return (await res.json()) as { ip: string; orNull: string | null }
}

afterEach(() => {
  vi.restoreAllMocks()
  resetClientIpWarningForTests()
})

describe('H1 clientIp table', () => {
  const rows: Array<[string, string | undefined, Record<string, string>, string]> = [
    ['loopback peer + X-Real-IP', '127.0.0.1', { 'x-real-ip': '203.0.113.7' }, '203.0.113.7'],
    ['loopback peer + XFF "1.1.1.1, 9.9.9.9" -> rightmost', '127.0.0.1', { 'x-forwarded-for': '1.1.1.1, 9.9.9.9' }, '9.9.9.9'],
    ['loopback peer: X-Real-IP wins over XFF', '127.0.0.1', { 'x-real-ip': '203.0.113.8', 'x-forwarded-for': '1.1.1.1, 9.9.9.9' }, '203.0.113.8'],
    ['::1 peer is loopback', '::1', { 'x-real-ip': '203.0.113.9' }, '203.0.113.9'],
    ['::ffff:127.0.0.1 peer is loopback', '::ffff:127.0.0.1', { 'x-real-ip': '203.0.113.10' }, '203.0.113.10'],
    ['loopback peer: junk X-Real-IP is skipped for a valid rightmost XFF', '127.0.0.1', { 'x-real-ip': 'not-an-ip', 'x-forwarded-for': '1.1.1.1, 198.51.100.4' }, '198.51.100.4'],
    ['loopback peer: junk rightmost XFF falls back to the peer', '127.0.0.1', { 'x-forwarded-for': '1.1.1.1, garbage' }, '127.0.0.1'],
    ['loopback peer + ::ffff:-mapped X-Real-IP is normalised', '127.0.0.1', { 'x-real-ip': '::ffff:203.0.113.11' }, '203.0.113.11'],
    ['non-loopback peer ignores X-Real-IP and XFF', '198.51.100.20', { 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8, 9.9.9.9' }, '198.51.100.20'],
    ['non-loopback ::ffff: peer is normalised', '::ffff:198.51.100.21', { 'x-forwarded-for': '5.6.7.8' }, '198.51.100.21'],
  ]
  for (const [name, addr, headers, want] of rows) {
    it(name, async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect((await ipFor(headers, peer(addr))).ip).toBe(want)
    })
  }

  it('no node binding (getConnInfo throws, e.g. app.request without env) gives "unknown" and never trusts headers', async () => {
    const r = await ipFor({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '1.1.1.1, 9.9.9.9' })
    expect(r.ip).toBe('unknown')
    expect(r.orNull).toBeNull()
  })

  it('a peer with no address gives "unknown" and never trusts headers', async () => {
    const r = await ipFor({ 'x-real-ip': '203.0.113.7' }, peer(undefined))
    expect(r.ip).toBe('unknown')
  })

  it('loopback peer with no forwarding header: one warning only (shared-bucket risk), peer returned', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await ipFor({}, peer('127.0.0.1'))).ip).toBe('127.0.0.1')
    expect((await ipFor({}, peer('127.0.0.1'))).ip).toBe('127.0.0.1')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/X-Real-IP/)
  })
})
