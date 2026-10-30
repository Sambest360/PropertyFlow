/**
 * In-memory sliding-window rate limiting (SECURITY_FIXES.md backlog, H1).
 * No new dependencies; state lives per process and resets on pm2 restart
 * (accepted for one box, spec r5 :83).
 *
 * Auth layers:
 *  1. Per-IP request limit on register / login / change-password
 *     (default 30 / 15 min, spec r5 :61).
 *  2. Per (IP + email) failure limit on login (default 8 failed attempts per
 *     15 min, sliding), cleared on a successful login or set-password.
 *  3. forgot-password / set-password have their own per-IP bucket `pw:<ip>`
 *     (30 / 15 min) so an office that hit the login cap can still reset.
 *
 * Callers pass the IP from clientIp(c) (server/clientIp.ts). Never derive it
 * from forwarding headers here.
 *
 * Env knobs:
 *   AUTH_RATE_LIMIT_MAX          — per-IP auth requests per window (default 30)
 *   AUTH_RATE_LIMIT_WINDOW_MIN   — auth window length in minutes (default 15)
 *   AUTH_RATE_LIMIT_LOGIN_MAX    — failed logins per (ip + email) window (default 8)
 *   AUTH_RATE_LIMIT_PW_MAX       — forgot/set-password per IP per window (default 30)
 *
 * Jim C2: pruning drops hits older than the bucket's window, so every window
 * length gets its own Map (bucketsFor). A 15-minute prune never touches a
 * 1-hour bucket.
 */

type Window = { hits: number[] }

const windowMaps = new Map<number, Map<string, Window>>()
/** Failure (lockout) buckets: their own maps, keyed `${ip}:${email}`. */
const failureMaps = new Map<number, Map<string, Window>>()

/** One Map per window length (Jim C2). */
function mapFor(family: Map<number, Map<string, Window>>, windowMs: number): Map<string, Window> {
  let map = family.get(windowMs)
  if (!map) {
    map = new Map()
    family.set(windowMs, map)
  }
  return map
}
const bucketsFor = (windowMs: number) => mapFor(windowMaps, windowMs)
const failuresFor = (windowMs: number) => mapFor(failureMaps, windowMs)

const MIN15 = 15 * 60_000
const HOUR = 60 * 60_000

function pruneWindows(map: Map<string, Window>, now: number, windowMs: number) {
  if (map.size < 512) return
  for (const [key, win] of map) {
    win.hits = win.hits.filter((t) => now - t < windowMs)
    if (win.hits.length === 0) map.delete(key)
  }
}

type Gate = { ok: boolean; retryAfterSec: number }

function slidingWindowHit(map: Map<string, Window>, key: string, limit: number, windowMs: number): Gate {
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

function hit(key: string, limit: number, windowMs: number): Gate {
  return slidingWindowHit(bucketsFor(windowMs), key, limit, windowMs)
}

/** Test hook: clear every bucket. */
export function resetRateLimitsForTests(): void {
  windowMaps.clear()
  failureMaps.clear()
}

function numEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback
}

function windowMs(): number {
  return numEnv('AUTH_RATE_LIMIT_WINDOW_MIN', 15) * 60_000
}

/** Per-IP guard for register / login / change-password. Call before doing any work. */
export function authIpRateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
  return hit(ip, numEnv('AUTH_RATE_LIMIT_MAX', 30), windowMs())
}

/** Must be called on a failed login attempt only. */
export function recordAuthFailure(ip: string, email: string): { ok: boolean; retryAfterSec: number } {
  const key = `${ip}:${email.trim().toLowerCase()}`
  return slidingWindowHit(failuresFor(windowMs()), key, numEnv('AUTH_RATE_LIMIT_LOGIN_MAX', 8), windowMs())
}

/** Called after a successful login so legitimate users self-heal. */
export function clearAuthFailures(ip: string, email: string) {
  for (const map of failureMaps.values()) map.delete(`${ip}:${email.trim().toLowerCase()}`)
}

/**
 * H1 (spec r5 :63): a successful set-password (reset or account set-up link)
 * unlocks the account from every IP: deletes every failure key ending in
 * `:${email}`.
 */
export function clearAuthFailuresForEmail(email: string) {
  const suffix = `:${email.trim().toLowerCase()}`
  for (const map of failureMaps.values()) {
    for (const key of [...map.keys()]) if (key.endsWith(suffix)) map.delete(key)
  }
}

/** H1: forgot-password / set-password per-IP bucket `pw:<ip>`, separate from the login bucket. */
export function passwordFlowIpRateLimit(ip: string): Gate {
  return hit(`pw:${ip}`, numEnv('AUTH_RATE_LIMIT_PW_MAX', 30), windowMs())
}

/**
 * Per-email guard for registration — blunts single-mailbox abuse (bot loops
 * hitting one address) independently of the per-IP guard. Keyed on the email
 * alone so IP rotation doesn't help the attacker; the window is short enough
 * that a legitimate user retrying after a typo isn't punished.
 * Env knob: AUTH_RATE_LIMIT_EMAIL_MAX (default 4 per window).
 */
export function authEmailRateLimit(email: string): { ok: boolean; retryAfterSec: number } {
  const key = `reg:${email.trim().toLowerCase()}`
  return hit(key, numEnv('AUTH_RATE_LIMIT_EMAIL_MAX', 4), windowMs())
}

/**
 * Per-email guard for notification-style endpoints (e.g. application-received
 * email) — separate bucket from the register guard so independent limits.
 * Env knob: AUTH_RATE_LIMIT_NOTIFY_MAX (default 6 per window).
 */
export function notifyEmailRateLimit(email: string): { ok: boolean; retryAfterSec: number } {
  const key = `notify:${email.trim().toLowerCase()}`
  return hit(key, numEnv('AUTH_RATE_LIMIT_NOTIFY_MAX', 6), windowMs())
}

/** Check (without recording) whether an account+IP is currently locked out. */
export function authFailureBlocked(ip: string, email: string): { ok: boolean; retryAfterSec: number } {
  const key = `${ip}:${email.trim().toLowerCase()}`
  const now = Date.now()
  const win = failuresFor(windowMs()).get(key)
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

/** Login 429 (spec r5 :62): "Try again in N min or reset your password". */
export function loginTooManyRequests(retryAfterSec: number): ReturnType<typeof tooManyRequests> {
  const min = Math.max(1, Math.ceil(retryAfterSec / 60))
  return {
    body: { error: 'rate_limited', message: `Too many attempts. Try again in ${min} min or reset your password.` },
    status: 429,
    headers: { 'Retry-After': String(retryAfterSec) },
  }
}

/** H1 new limits (spec r5 :65-67): fixed numbers, each in its window's own map. */
export function listingEnquiryIpRateLimit(ip: string): Gate {
  return hit(`enq-ip:${ip}`, 20, MIN15)
}

/** 3 per (email + listing) per hour. The listing is the id the form sent, lower-cased. */
export function listingEnquiryContactRateLimit(email: string, propertyId: string): Gate {
  return hit(`enq:${email.trim().toLowerCase()}:${propertyId.trim().toLowerCase()}`, 3, HOUR)
}

export function verifyEmailIpRateLimit(ip: string): Gate {
  return hit(`verify-ip:${ip}`, 10, MIN15)
}

/** Reviews: 20 per IP per hour, then 5 per actor per hour. */
export function reviewRateLimit(actorKey: string, ip: string): Gate {
  const byIp = hit(`review-ip:${ip}`, 20, HOUR)
  if (!byIp.ok) return byIp
  return hit(`review-actor:${actorKey}`, 5, HOUR)
}

const resetActorWindows = new Map<string, Window>()
const resetTargetWindows = new Map<string, Window>()

/**
 * D3 staff password reset: per actor (default 10 / window) and per target
 * (default 3 / window). Knobs: RESET_RATE_LIMIT_ACTOR_MAX, RESET_RATE_LIMIT_TARGET_MAX.
 */
export function passwordResetRateLimit(actorKey: string, targetKey: string): { ok: boolean; retryAfterSec: number } {
  const byActor = slidingWindowHit(resetActorWindows, actorKey, numEnv('RESET_RATE_LIMIT_ACTOR_MAX', 10), windowMs())
  if (!byActor.ok) return byActor
  return slidingWindowHit(resetTargetWindows, targetKey, numEnv('RESET_RATE_LIMIT_TARGET_MAX', 3), windowMs())
}

/** Test hook: clear the reset buckets. */
export function resetPasswordResetRateLimitsForTests(): void {
  resetActorWindows.clear()
  resetTargetWindows.clear()
}

/** Per-actor guard for notifications sent from the app (default 200 per 10 minutes). */
export function notificationDispatchRateLimit(actorKey: string, count: number): { ok: boolean; retryAfterSec: number } {
  let last = { ok: true, retryAfterSec: 0 }
  for (let i = 0; i < Math.max(1, count); i++) {
    last = hit(`notif:${actorKey}`, numEnv('NOTIFICATION_DISPATCH_MAX', 200), 10 * 60_000)
    if (!last.ok) return last
  }
  return last
}
