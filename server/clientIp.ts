/**
 * H1 (spec r5 :49, Jim C3): the client IP for rate limits, stamps and the
 * PayFast ITN source check.
 *
 * The app binds 127.0.0.1 (index.ts serve), so in production the only peer
 * is the nginx on the same box. Forwarding headers are trusted ONLY when the
 * TCP peer is loopback:
 *   1. X-Real-IP (nginx sets it to $remote_addr), if it is a valid IP;
 *   2. else the RIGHTMOST X-Forwarded-For entry (nginx appends $remote_addr;
 *      everything left of it is client-supplied), if it is a valid IP;
 *   3. else the peer itself (one warning: every client would share it).
 * Any other peer is returned as-is and its headers are ignored.
 * If the peer can not be read (getConnInfo throws outside @hono/node-server,
 * e.g. app.request() in tests) the answer is 'unknown'; headers are never
 * trusted as a fallback.
 *
 * CDN note (spec r5 :70): this trusts only the loopback nginx hop. If a CDN
 * is ever put in front, revisit this (trusted CDN ranges + CF-Connecting-IP,
 * or nginx real_ip_from), or every client shares the CDN's addresses.
 */
import { isIP } from 'node:net'
import type { Context } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'

export const UNKNOWN_IP = 'unknown'

/** Strip an IPv4-mapped IPv6 prefix and validate; null when not an IP. */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  let ip = raw.trim()
  if (!ip) return null
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (mapped?.[1]) ip = mapped[1]
  return isIP(ip) ? ip : null
}

export function isLoopback(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1'
}

function peerAddress(c: Context): string | null {
  try {
    return normalizeIp(getConnInfo(c).remote.address)
  } catch {
    return null
  }
}

let warnedNoForwardHeader = false

/** Test hook: re-arm the one-time "loopback peer without X-Real-IP" warning. */
export function resetClientIpWarningForTests(): void {
  warnedNoForwardHeader = false
}

export function clientIp(c: Context): string {
  const peer = peerAddress(c)
  if (!peer) return UNKNOWN_IP
  if (!isLoopback(peer)) return peer
  const real = normalizeIp(c.req.header('x-real-ip'))
  if (real) return real
  const xff = c.req.header('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',')
    const rightmost = normalizeIp(parts[parts.length - 1])
    if (rightmost) return rightmost
  }
  if (!real && !xff && !warnedNoForwardHeader) {
    warnedNoForwardHeader = true
    console.warn(
      '[clientIp] request from loopback with no X-Real-IP / X-Forwarded-For: nginx must send proxy_set_header X-Real-IP $remote_addr, or every client shares one rate-limit bucket',
    )
  }
  return peer
}

/** Same, with 'unknown' as null (for stored stamps). */
export function clientIpOrNull(c: Context): string | null {
  const ip = clientIp(c)
  return ip === UNKNOWN_IP ? null : ip
}
