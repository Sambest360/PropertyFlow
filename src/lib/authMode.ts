/**
 * Client auth mode — build-time `VITE_AUTH_MODE`. Exactly 'supabase' enables
 * Supabase mode; any other value or missing = API mode. Supabase URL/key being
 * present is NOT enough on its own.
 */
export type AuthMode = 'api' | 'supabase'

export function resolveClientAuthMode(raw: string | undefined): AuthMode {
  return raw === 'supabase' ? 'supabase' : 'api'
}

export const clientAuthMode: AuthMode = resolveClientAuthMode(
  import.meta.env.VITE_AUTH_MODE as string | undefined,
)

let logged = false
export function logClientAuthModeOnce(): void {
  if (logged) return
  logged = true
  console.info(`[auth] resolved client auth mode: ${clientAuthMode}`)
}
