import type { Context, Next } from 'hono'
import { createClient } from './server.js'

/**
 * Refreshes the Supabase auth session on each API request (mirrors Next.js middleware).
 * Mount early in the Hono app so Set-Cookie headers propagate on the response.
 */
export async function supabaseSessionMiddleware(c: Context, next: Next) {
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
    await supabase.auth.getUser()
  } catch {
    /* optional until Supabase auth is fully wired */
  }
  await next()
}
