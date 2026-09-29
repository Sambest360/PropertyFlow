/**
 * Pure helpers for Postgres pool configuration (unit-testable).
 * Used by server/db.ts when creating the pg Pool.
 */

export function isRemoteDatabaseUrl(
  url: string,
  sslEnv: string | undefined = process.env.DATABASE_SSL,
): boolean {
  return (
    /supabase\.(co|com)/i.test(url) ||
    /pooler\.supabase\.com/i.test(url) ||
    /sslmode=/i.test(url) ||
    sslEnv === '1'
  )
}

/**
 * Strip query flags that would turn TLS verification off. The Pool sets
 * `ssl: { rejectUnauthorized: true }` itself for remote connections.
 */
export function connectionStringForPool(url: string, remote: boolean): string {
  if (!remote) return url
  try {
    const u = new URL(url)
    u.searchParams.delete('sslmode')
    u.searchParams.delete('uselibpqcompat')
    u.searchParams.delete('ssl')
    if (!u.searchParams.has('connect_timeout')) {
      u.searchParams.set('connect_timeout', '5')
    }
    // Transaction pooler (6543) — required for serverless; tells drivers not to use prepared statements.
    if (u.port === '6543' && !u.searchParams.has('pgbouncer')) {
      u.searchParams.set('pgbouncer', 'true')
    }
    return u.toString()
  } catch {
    return url
  }
}

/** Remote / pooler connections verify the server certificate. Local Postgres does not use TLS. */
export function sslOptionsForConnection(remote: boolean): { rejectUnauthorized: true } | undefined {
  if (!remote) return undefined
  return { rejectUnauthorized: true }
}

const DATABASE_OWNER_ROLES = new Set([
  'postgres',
  'supabase_admin',
  'supabase_auth_admin',
  'supabase_storage_admin',
])

export function isSupabaseDatabaseUrl(url: string): boolean {
  return /supabase\.(co|com)/i.test(url) || /pooler\.supabase\.com/i.test(url)
}

/** Supavisor usernames are `role.projectref`. The role is the segment before the dot. */
export function databaseLoginRole(url: string): string | null {
  try {
    const username = decodeURIComponent(new URL(url).username || '')
    if (!username) return null
    const role = username.split('.')[0]?.trim().toLowerCase()
    return role || null
  } catch {
    return null
  }
}

export function supabaseDatabaseUsesOwnerRole(url: string): boolean {
  if (!isSupabaseDatabaseUrl(url)) return false
  const role = databaseLoginRole(url)
  return role != null && DATABASE_OWNER_ROLES.has(role)
}

/** Transaction pooler (6543) is required for Vercel/serverless runtime. */
export function databaseUrlRuntimeWarning(url: string): string | undefined {
  try {
    const port = new URL(url).port
    if (port === '5432') {
      return 'DATABASE_URL uses port 5432 (session/direct). On Vercel use the Transaction pooler on port 6543.'
    }
  } catch {
    /* ignore */
  }
  return undefined
}

/** Serverless (Vercel / Lambda) should use a tiny pool; local Node can use more. */
export function poolMaxForRuntime(opts: {
  vercel?: string | undefined
  lambda?: string | undefined
}): number {
  return opts.vercel || opts.lambda ? 1 : 8
}

/**
 * Fail fast on cold starts — never wait the full function budget for a dead host.
 * Local dev gets 10s: the Supabase transaction pooler routinely shows 5–7s
 * connect spikes, and a 3s local timeout wedges the whole dev API whenever the
 * pooler hiccups (observed 2026-09-19). Serverless budgets stay tight.
 */
export function connectionTimeoutMsForRuntime(opts: {
  vercel?: string | undefined
  lambda?: string | undefined
}): number {
  return opts.vercel || opts.lambda ? 5_000 : 10_000
}

export function isLocalhostDatabaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === '127.0.0.1' || host === 'localhost' || host === '::1'
  } catch {
    return /127\.0\.0\.1|localhost/i.test(url)
  }
}

/**
 * Resolve the connection string for this process.
 * On Vercel/Lambda, never fall back to a developer machine localhost URL —
 * that hangs until the function times out (504).
 */
export function resolveDatabaseUrl(opts: {
  envUrl?: string | undefined
  vercel?: string | undefined
  lambda?: string | undefined
  localFallback?: string
}): { url: string; configured: boolean; error?: string } {
  const trimmed = opts.envUrl?.trim() || ''
  if (trimmed) {
    if ((opts.vercel || opts.lambda) && isLocalhostDatabaseUrl(trimmed)) {
      return {
        url: trimmed,
        configured: false,
        error:
          'DATABASE_URL points at localhost on a serverless host. Use the Supabase Transaction pooler URI.',
      }
    }
    if (supabaseDatabaseUsesOwnerRole(trimmed)) {
      return {
        url: trimmed,
        configured: false,
        error:
          'DATABASE_URL uses an owner role (postgres). Connect through the Supabase pooler as a non-owner role such as propertyflow_api.',
      }
    }
    return { url: trimmed, configured: true }
  }
  if (opts.vercel || opts.lambda) {
    return {
      url: '',
      configured: false,
      error:
        'DATABASE_URL is not set. Add the Supabase Transaction pooler URI in Vercel → Settings → Environment Variables, then redeploy.',
    }
  }
  const url = opts.localFallback || 'postgresql://127.0.0.1:5432/propertyflow'
  return { url, configured: true }
}
