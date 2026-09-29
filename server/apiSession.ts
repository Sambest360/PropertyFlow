/**
 * Requires a verified app user on API routes.
 * A missing or invalid credential returns 401 before the handler runs, so the
 * handler cannot touch the database. Public routes stay open.
 */
import type { Context, Next } from 'hono'
import { resolveSessionUser } from './auth.js'

const PUBLIC_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: 'GET', path: '/api/health' },
  { method: 'GET', path: '/api/auth/bootstrap-needed' },
  { method: 'POST', path: '/api/auth/register' },
  { method: 'POST', path: '/api/auth/register-supabase' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/auth/logout' },
  { method: 'POST', path: '/api/public/listing-enquiry' },
  { method: 'GET', path: '/api/v1/units' },
  { method: 'POST', path: '/api/payfast/itn' },
]

export function isPublicApiRoute(method: string, path: string): boolean {
  return PUBLIC_ROUTES.some((route) => route.method === method && route.path === path)
}

export async function apiSessionMiddleware(c: Context, next: Next) {
  if (c.req.method === 'OPTIONS') {
    await next()
    return
  }
  const path = new URL(c.req.url).pathname
  if (isPublicApiRoute(c.req.method, path)) {
    await next()
    return
  }
  const user = await resolveSessionUser(c)
  if (!user) {
    return c.json({ error: 'unauthorized', message: 'Sign in required' }, 401)
  }
  await next()
}
