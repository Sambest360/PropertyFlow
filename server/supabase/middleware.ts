import type { Context, Next } from 'hono'
import { createClient } from './server.js'

const AUTH_PATH_PREFIXES = ['/api/auth', '/api/health']

export function shouldSkipSupabaseRefresh(path: string, method = 'GET'): boolean {
  if (AUTH_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return true
  }
  if (method === 'GET' && path.startsWith('/api/public/')) {
    return true
  }
  return false
}

/**
 * Refreshes the Supabase auth session on each API request (mirrors Next.js middleware).
 * Mount early in the Hono app so Set-Cookie headers propagate on the response.
 * Skipped on auth/health routes so login is not blocked by optional Supabase calls.
 */
export async function supabaseSessionMiddleware(c: Context, next: Next) {
  const path = new URL(c.req.url).pathname
  if (shouldSkipSupabaseRefresh(path, c.req.method)) {
    await next()
    return
  }
  const configured =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!configured) {
    await next()
    return
  }
  try {
    const supabase = createClient(c)
    await Promise.race([
      supabase.auth.getUser(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('supabase session refresh timeout')), 2000),
      ),
    ])
  } catch {
    /* optional until Supabase auth is fully wired */
  }
  await next()
}
