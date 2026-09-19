/**
 * In-memory sliding-window rate limiting for the auth endpoints
 * (SECURITY_FIXES.md backlog: brute-force protection on /api/auth/login and
 * /api/auth/register). No new dependencies; state lives per process, which
 * still blunts simple brute force on single-instance deploys and serverless
 * functions (each instance keeps its own buckets).
 *
 * Two layers:
 *  1. Per-IP request limit on both endpoints (default 10 / 15 min).
 *  2. Per (IP + email) failure limit on login (default 8 failed attempts),
 *     cleared on success — so one victim account can't be ground down by
 *     rotating IPs.
 *
 * Env knobs:
 *   AUTH_RATE_LIMIT_MAX          — per-IP requests per window (default 10)
 *   AUTH_RATE_LIMIT_WINDOW_MIN   — window length in minutes (default 15)
 *   AUTH_RATE_LIMIT_LOGIN_MAX    — failed logins per (ip + email) window (default 8)
 */

type Window = { hits: number[] }

const requestWindows = new Map<string, Window>()
const failureWindows = new Map<string, Window>()

function pruneWindows(map: Map<string, Window>, now: number, windowMs: number) {
  if (map.size < 512) return
  for (const [key, win] of map) {
    win.hits = win.hits.filter((t) => now - t < windowMs)
    if (win.hits.length === 0) map.delete(key)
  }
}

function slidingWindowHit(map: Map<string, Window>, key: string, limit: number, windowMs: number): {
  ok: boolean
  retryAfterSec: number
} {
  const now = Date.now()
  const win = map.get(key) ?? { hits: [] }
  win.hits = win.hits.filter((t) => now - t < windowMs)
  if (win.hits.length >= limit) {
    map.set(key, win)
    const oldest = win.hits[0] ?? now
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) }
  }
  win.hits.push(now)
  map.set(key, win)
  pruneWindows(map, now, windowMs)
  return { ok: true, retryAfterSec: 0 }
}

export function authIpKey(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

function numEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback
}

function windowMs(): number {
  return numEnv('AUTH_RATE_LIMIT_WINDOW_MIN', 15) * 60_000
}

/** Per-IP guard for register / login. Call before doing any work. */
export function authIpRateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
  return slidingWindowHit(requestWindows, ip, numEnv('AUTH_RATE_LIMIT_MAX', 10), windowMs())
}

/** Must be called on a failed login attempt only. */
export function recordAuthFailure(ip: string, email: string): { ok: boolean; retryAfterSec: number } {
  const key = `${ip}:${email.trim().toLowerCase()}`
  return slidingWindowHit(failureWindows, key, numEnv('AUTH_RATE_LIMIT_LOGIN_MAX', 8), windowMs())
}

/** Called after a successful login so legitimate users self-heal. */
export function clearAuthFailures(ip: string, email: string) {
  failureWindows.delete(`${ip}:${email.trim().toLowerCase()}`)
}

/** Check (without recording) whether an account+IP is currently locked out. */
export function authFailureBlocked(ip: string, email: string): { ok: boolean; retryAfterSec: number } {
  const key = `${ip}:${email.trim().toLowerCase()}`
  const now = Date.now()
  const win = failureWindows.get(key)
  if (!win) return { ok: true, retryAfterSec: 0 }
  const hits = win.hits.filter((t) => now - t < windowMs())
  if (hits.length >= numEnv('AUTH_RATE_LIMIT_LOGIN_MAX', 8)) {
    const oldest = hits[0] ?? now
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs() - (now - oldest)) / 1000)) }
  }
  return { ok: true, retryAfterSec: 0 }
}

export function tooManyRequests(retryAfterSec: number): {
  body: { error: string; message: string }
  status: 429
  headers: Record<string, string>
} {
  return {
    body: {
      error: 'rate_limited',
      message: 'Too many attempts — please wait a few minutes before trying again.',
    },
    status: 429,
    headers: { 'Retry-After': String(retryAfterSec) },
  }
}
