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
  
function isPlaceholderSupabaseValue(value: string | undefined): boolean {
  if (!value?.trim()) return true
  const v = value.trim()
  return (
    v.includes('YOUR_PROJECT_REF') ||
    v.includes('YOUR_KEY') ||
    v.includes('sb_publishable_YOUR_KEY') ||
    v.includes('your-project-ref')
  )
}

  export function isSupabaseConfigured(): boolean {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    if (import.meta.env.VITE_AUTH_MODE !== 'supabase') return false
    return !isPlaceholderSupabaseValue(url) && !isPlaceholderSupabaseValue(key)
  }
  