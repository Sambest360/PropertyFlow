/** Postgres/Hono API: opt-in locally; always on in production builds (Vercel). */
import { isSupabaseConfigured } from '../../utils/supabase/env'
import { clientAuthMode, logClientAuthModeOnce } from '../authMode'

/**
 * Supabase mode requires an explicit build-time VITE_AUTH_MODE=supabase AND a
 * configured Supabase URL/key. Env vars merely being present no longer flip it.
 */
export const isSupabaseMode = clientAuthMode === 'supabase' && isSupabaseConfigured()
logClientAuthModeOnce()

/** Postgres/Hono API: local dev fallback when Supabase is not configured. */
export const isApiEnabled =
  !isSupabaseMode &&
  (import.meta.env.VITE_ENABLE_API === '1' ||
    import.meta.env.VITE_ENABLE_API === 'true' ||
    (import.meta.env.PROD && import.meta.env.VITE_ENABLE_API !== '0'))
