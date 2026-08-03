import { createServerClient } from '@supabase/ssr'
import type { Context } from 'hono'
import { setCookie } from 'hono/cookie'
import { getSupabasePublishableKey, getSupabaseUrl } from './env.js'

function parseCookieHeader(header: string | undefined): Array<{ name: string; value: string }> {
  if (!header) return []
  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf('=')
      if (eq === -1) return { name: part, value: '' }
      return {
        name: part.slice(0, eq).trim(),
        value: decodeURIComponent(part.slice(eq + 1).trim()),
      }
    })
}

/** Cookie-aware Supabase client for Hono API routes (SSR session refresh). */
export function createClient(c: Context) {
  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return parseCookieHeader(c.req.header('cookie'))
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          setCookie(c, name, value, {
            path: options?.path ?? '/',
            maxAge: options?.maxAge,
            domain: options?.domain,
            sameSite: options?.sameSite as 'Lax' | 'Strict' | 'None' | undefined,
            secure: options?.secure,
            httpOnly: options?.httpOnly,
          })
        })
      },
    },
  })
}
