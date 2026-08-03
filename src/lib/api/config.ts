/** Postgres/Hono API: opt-in locally; always on in production builds (Vercel). */import { isSupabaseConfigured } from '../../utils/supabase/env'

/** When Supabase env is set, auth + data use the browser client (no Vercel /api). */
export const isSupabaseMode = isSupabaseConfigured()

/** Postgres/Hono API: local dev fallback when Supabase is not configured. */
export const isApiEnabled =
  !isSupabaseMode &&
  (import.meta.env.VITE_ENABLE_API === '1' ||
    import.meta.env.VITE_ENABLE_API === 'true' ||
    (import.meta.env.PROD && import.meta.env.VITE_ENABLE_API !== '0'))
