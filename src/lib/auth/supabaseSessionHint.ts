/** Project ref from `https://<ref>.supabase.co` (or legacy host shapes). */
export function parseSupabaseProjectRef(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname
    const sub = host.split('.')[0]
    return sub && sub !== 'localhost' ? sub : null
  } catch {
    return null
  }
}

/** True when document.cookie has a Supabase auth chunk for the current project ref. */
export function hasSupabaseSessionCookie(projectRef: string | null): boolean {
  if (!projectRef || typeof document === 'undefined') return false
  const prefix = `sb-${projectRef}-auth-token`
  return document.cookie.split(';').some((part) => part.trim().startsWith(`${prefix}=`))
}
