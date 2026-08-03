/** Postgres/Hono API is opt-in locally — keeps `npm run dev` fast (Vite only). */
export const isApiEnabled =
  import.meta.env.VITE_ENABLE_API === '1' || import.meta.env.VITE_ENABLE_API === 'true'
