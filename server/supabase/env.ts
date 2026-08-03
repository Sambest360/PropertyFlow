/** Server-only Supabase env (never use VITE_ or NEXT_PUBLIC_ for secrets). */
export function getSupabaseUrl(): string {
    const url =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!url) {
      throw new Error('Missing SUPABASE_URL — set it in .env.local or Vercel env vars')
    }
    return url
  }
  
  export function getSupabasePublishableKey(): string {
    const key =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!key) {
      throw new Error('Missing SUPABASE_PUBLISHABLE_KEY')
    }
    return key
  }
  
  export function getSupabaseSecretKey(): string | undefined {
    return (
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      undefined
    )
  }
  