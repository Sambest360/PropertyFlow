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

/** Vercel "Config" env vars are often encrypted blobs — not valid GoTrue apikeys. */
function isUsableSupabaseApiKey(value: string | undefined): boolean {
  if (!value?.trim() || isPlaceholderSupabaseValue(value)) return false
  const v = value.trim()
  return v.startsWith('eyJ') || v.startsWith('sb_publishable_')
}

function isUsableSupabaseUrl(value: string | undefined): boolean {
  if (!value?.trim() || isPlaceholderSupabaseValue(value)) return false
  return /supabase\.co/i.test(value.trim())
}

/** Server-side GoTrue calls — prefer SUPABASE_* over VITE_* (Vercel config blobs). */
export function resolveSupabaseUrlForGoTrue(): string {
  for (const candidate of [
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
  ]) {
    if (isUsableSupabaseUrl(candidate)) return candidate!.trim().replace(/\/$/, '')
  }
  return ''
}

export function resolveSupabasePublishableKeyForGoTrue(): string {
  for (const candidate of [
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  ]) {
    if (isUsableSupabaseApiKey(candidate)) return candidate!.trim()
  }
  return ''
}

/**
 * GoTrue is usable only when both a project URL and a publishable/anon key
 * are set. API-mode Neon has neither; staff mint must not require auth.users.
 * Same URL/key pair as goTruePasswordSignIn in registerUser.ts.
 */
export function supabaseAuthConfigured(): boolean {
  return Boolean(resolveSupabaseUrlForGoTrue() && resolveSupabasePublishableKeyForGoTrue())
}
