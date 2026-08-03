/** Public Supabase project URL + publishable key (safe for the browser bundle). */
export function getSupabaseUrl(): string {
    const url = import.meta.env.VITE_SUPABASE_URL
    if (!url) {
      throw new Error('Missing VITE_SUPABASE_URL — add it to .env.local')
    }
    return url
  }
  
  export function getSupabasePublishableKey(): string {
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    if (!key) {
      throw new Error('Missing VITE_SUPABASE_PUBLISHABLE_KEY — add it to .env.local')
    }
    return key
  }
  
  export function isSupabaseConfigured(): boolean {
    return Boolean(
      import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    )
  }
  