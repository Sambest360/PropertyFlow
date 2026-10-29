/**
 * Pure helpers for Postgres pool configuration (unit-testable).
 * Used by server/db.ts when creating the pg Pool on the self-hosted server.
 */

/** A remote database that needs TLS (sslmode in the URL, or DATABASE_SSL=1). */
export function isRemoteDatabaseUrl(
  url: string,
  sslEnv: string | undefined = process.env.DATABASE_SSL,
): boolean {
  return /sslmode=/i.test(url) || sslEnv === '1'
}

/**
 * Newer `pg` treats sslmode=require as verify-full. Use libpq-compatible
 * require so a remote database with its own CA chain still connects.
 */
export function connectionStringForPool(url: string, remote: boolean): string {
  if (!remote) return url
  try {
    const u = new URL(url)
    u.searchParams.delete('sslmode')
    u.searchParams.set('sslmode', 'require')
    u.searchParams.set('uselibpqcompat', 'true')
    if (!u.searchParams.has('connect_timeout')) {
      u.searchParams.set('connect_timeout', '5')
    }
    return u.toString()
  } catch {
    return url
  }
}

/** Pool size for the API process (DB_POOL_MAX overrides). */
export function poolMaxFromEnv(raw: string | undefined = process.env.DB_POOL_MAX): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 10
}

export const CONNECTION_TIMEOUT_MS = 10_000

export function isLocalhostDatabaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === '127.0.0.1' || host === 'localhost' || host === '::1'
  } catch {
    return /127\.0\.0\.1|localhost/i.test(url)
  }
}

/** DATABASE_URL from the environment, else the local development database. */
export function resolveDatabaseUrl(opts: {
  envUrl?: string | undefined
  localFallback?: string
}): { url: string; configured: boolean; error?: string } {
  const trimmed = opts.envUrl?.trim() || ''
  if (trimmed) return { url: trimmed, configured: true }
  const url = opts.localFallback || 'postgresql://127.0.0.1:5432/propertyflow'
  return { url, configured: true }
}
