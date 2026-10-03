/**
 * Pure helpers for Postgres pool configuration (unit-testable).
 * Used by server/db.ts when creating the pg Pool.
 */

/**
 * True for every host except localhost, 127.0.0.1, and ::1.
 * Those three may connect without TLS. Every other host must verify.
 * A query flag or DATABASE_SSL cannot turn that off.
 */
export function isRemoteDatabaseUrl(url: string): boolean {
  return !isLocalhostDatabaseUrl(url)
}

const WEAK_SSL_FLAGS = new Set(['0', 'false', 'no-verify'])

function deleteSearchParamIgnoreCase(url: URL, name: string): void {
  const target = name.toLowerCase()
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase() === target) url.searchParams.delete(key)
  }
}

function searchParamIgnoreCase(url: URL, name: string): string | null {
  const target = name.toLowerCase()
  for (const [key, value] of url.searchParams.entries()) {
    if (key.toLowerCase() === target) return value
  }
  return null
}

/**
 * Remote URLs are rewritten to `sslmode=verify-full` with `uselibpqcompat` removed.
 *
 * `pg` 8.22 (`pg-connection-string` 2.14) merges with
 * `Object.assign({}, config, parse(connectionString))`, so the URL replaces an
 * explicit Pool `ssl` object. With `uselibpqcompat=true`, `sslmode=require`
 * sets `rejectUnauthorized: false` (encrypt, do not verify). Without that flag,
 * `verify-full` leaves `ssl` as `{}` (or `{ ca }` when `sslrootcert` is set):
 * Node verifies the certificate against its built-in CA store and checks the
 * hostname. `prefer`, `require`, and `verify-ca` are currently aliases of
 * `verify-full`, but they warn and will weaken in pg 9, so they are not used.
 */
export function connectionStringForPool(
  url: string,
  remote: boolean,
  caPath?: string,
): string {
  if (!remote) return url
  try {
    const u = new URL(url)
    deleteSearchParamIgnoreCase(u, 'uselibpqcompat')
    deleteSearchParamIgnoreCase(u, 'sslmode')
    u.searchParams.set('sslmode', 'verify-full')
    const sslFlag = searchParamIgnoreCase(u, 'ssl')
    if (sslFlag && WEAK_SSL_FLAGS.has(sslFlag.toLowerCase())) {
      deleteSearchParamIgnoreCase(u, 'ssl')
    }
    if (caPath && !u.searchParams.has('sslrootcert')) {
      u.searchParams.set('sslrootcert', caPath)
    }
    if (!u.searchParams.has('connect_timeout')) {
      u.searchParams.set('connect_timeout', '5')
    }
    // Port 6543 is PgBouncer transaction mode — tell drivers not to prepare statements.
    if (u.port === '6543' && !u.searchParams.has('pgbouncer')) {
      u.searchParams.set('pgbouncer', 'true')
    }
    return u.toString()
  } catch {
    return url
  }
}

export type DatabasePoolSsl = {
  rejectUnauthorized: true
}

/** Options that decide TLS. Remote pools verify; localhost omits `ssl`. */
export function poolConfigForDatabaseUrl(
  url: string,
  opts?: { caPath?: string },
): { connectionString: string; ssl?: DatabasePoolSsl } {
  const remote = isRemoteDatabaseUrl(url)
  const caPath = opts?.caPath?.trim() || undefined
  return {
    connectionString: connectionStringForPool(url, remote, caPath),
    ...(remote ? { ssl: { rejectUnauthorized: true as const } } : {}),
  }
}

/** Port 5432 is session/direct. Serverless should use a pooled URL on 6543. */
export function databaseUrlRuntimeWarning(url: string): string | undefined {
  try {
    const port = new URL(url).port
    if (port === '5432') {
      return 'DATABASE_URL uses port 5432 (session/direct). Use a pooled Postgres URL on port 6543.'
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
 * Local dev gets 10s: a pooled Postgres URL routinely shows 5–7s connect
 * spikes, and a 3s local timeout wedges the whole dev API whenever the
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
    // `postgresql:` is not a special scheme, so the hostname is not lowercased.
    // Node also keeps IPv6 brackets (`[::1]`).
    const host = new URL(url).hostname.toLowerCase()
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]'
  } catch {
    return /127\.0\.0\.1|localhost|\[::1\]|::1/i.test(url)
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
          'DATABASE_URL points at localhost on a serverless host. Use a pooled Postgres URL.',
      }
    }
    return { url: trimmed, configured: true }
  }
  if (opts.vercel || opts.lambda) {
    return {
      url: '',
      configured: false,
      error:
        'DATABASE_URL is not set. Add a pooled Postgres URL in the environment, then redeploy.',
    }
  }
  const url = opts.localFallback || 'postgresql://127.0.0.1:5432/propertyflow'
  return { url, configured: true }
}
