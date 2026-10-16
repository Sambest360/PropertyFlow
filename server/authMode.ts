/**
 * Server auth mode. Reads ONLY the non-VITE `AUTH_MODE` env var.
 * Exactly 'supabase' enables Supabase/GoTrue; anything else (or unset) = API mode.
 */
import { createHash } from 'node:crypto'

export type AuthMode = 'api' | 'supabase'

export function resolveServerAuthMode(env: Record<string, string | undefined> = process.env): AuthMode {
  return env.AUTH_MODE === 'supabase' ? 'supabase' : 'api'
}

let logged = false
export function serverAuthMode(): AuthMode {
  const mode = resolveServerAuthMode()
  if (!logged) {
    logged = true
    console.info(`[auth] resolved server auth mode: ${mode}`)
  }
  return mode
}

export function isServerSupabaseMode(): boolean {
  return serverAuthMode() === 'supabase'
}

/** First 8 hex chars of sha256(host). Never returns or logs the host itself. */
export function dbHostFingerprint(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null
  let host = ''
  try {
    host = new URL(databaseUrl).hostname
  } catch {
    return null
  }
  if (!host) return null
  return createHash('sha256').update(host.toLowerCase()).digest('hex').slice(0, 8)
}
