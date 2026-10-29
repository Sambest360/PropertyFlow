import { logClientAuthModeOnce } from '../authMode'

logClientAuthModeOnce()

/** Postgres/Hono API: on in production builds; opt-in locally with VITE_ENABLE_API=1. */
export const isApiEnabled =
  import.meta.env.VITE_ENABLE_API === '1' ||
  import.meta.env.VITE_ENABLE_API === 'true' ||
  (import.meta.env.PROD && import.meta.env.VITE_ENABLE_API !== '0')
