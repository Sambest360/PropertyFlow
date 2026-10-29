/**
 * Server auth: the API's own sessions (bcrypt passwords, signed token cookie).
 */
import { createHash } from 'node:crypto'

export type AuthMode = 'api'

export function serverAuthMode(): AuthMode {
  return 'api'
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
