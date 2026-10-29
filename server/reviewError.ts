import type { Context } from 'hono'
import { errStatus } from './errStatus.js'

/**
 * Reviews errors: 4xx keep their message ("Listing not found", "Sign in to
 * leave a review"); a 5xx is a database or server fault, so the visitor gets
 * a generic message and the detail goes to the log (and Sentry via errStatus).
 * GET /api/reviews is public, so raw driver text must never reach the browser.
 */
export function reviewError(c: Context, code: string, err: unknown) {
  const status = errStatus(err)
  const message = err instanceof Error ? err.message : String(err)
  if (status < 500) return c.json({ error: code, message }, status)
  console.error(`[api/reviews] ${code}:`, message)
  return c.json({ error: code, message: 'Reviews are unavailable right now. Try again shortly.' }, status)
}
