import { parseSupabaseProjectRef } from './supabaseSessionHint'

export { parseSupabaseProjectRef }

/** Extract project ref embedded in `sb-<ref>-auth-token` (and related chunk keys). */
export function supabaseAuthKeyProjectRef(key: string): string | null {
  if (!key.startsWith('sb-') || !key.includes('auth')) return null
  const withoutPrefix = key.slice(3)
  const authIdx = withoutPrefix.indexOf('-auth')
  if (authIdx <= 0) return null
  return withoutPrefix.slice(0, authIdx)
}

/**
 * Remove Supabase auth storage keys from other projects (cookie bloat / wrong ref).
 * Keeps keys for `currentRef` only.
 */
export function purgeStaleSupabaseAuthCookies(currentRef: string | null): void {
  if (!currentRef || typeof localStorage === 'undefined') return
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) keys.push(k)
    }
    for (const k of keys) {
      const ref = supabaseAuthKeyProjectRef(k)
      if (ref && ref !== currentRef) {
        localStorage.removeItem(k)
      }
    }
  } catch {
    /* ignore quota / private mode */
  }
}

/** Run once at app boot when Supabase URL is configured. */
export function purgeStaleSupabaseAuthCookiesFromEnv(): void {
  const url = import.meta.env.VITE_SUPABASE_URL
  if (!url?.trim()) return
  purgeStaleSupabaseAuthCookies(parseSupabaseProjectRef(url))
}
