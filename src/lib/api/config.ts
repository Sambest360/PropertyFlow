/** Postgres/Hono API: opt-in locally; always on in production builds (Vercel). */
export const isApiEnabled =
  import.meta.env.VITE_ENABLE_API === '1' ||
  import.meta.env.VITE_ENABLE_API === 'true' ||
  (import.meta.env.PROD && import.meta.env.VITE_ENABLE_API !== '0')
