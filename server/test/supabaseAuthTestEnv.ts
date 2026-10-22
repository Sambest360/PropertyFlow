/**
 * Isolate server write tests from ambient VITE_SUPABASE_* in the developer shell.
 * API-mode / bcrypt suites should mock `./supabase/env.js` with
 * `supabaseAuthConfigured: () => false` (hoisted vi.mock).
 */

export const SUPABASE_AUTH_ENV_KEYS = [
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
] as const

export function snapshotSupabaseAuthEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {}
  for (const key of SUPABASE_AUTH_ENV_KEYS) saved[key] = process.env[key]
  return saved
}

export function clearSupabaseAuthEnv(): void {
  for (const key of SUPABASE_AUTH_ENV_KEYS) delete process.env[key]
}

export function restoreSupabaseAuthEnv(saved: Record<string, string | undefined>): void {
  for (const key of SUPABASE_AUTH_ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
}

/** JWT-shaped anon key — passes isUsableSupabaseApiKey in server/supabase/env.ts */
export const TEST_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS10ZXN0In0.test'

export const TEST_SUPABASE_URL = 'https://example.supabase.co'
