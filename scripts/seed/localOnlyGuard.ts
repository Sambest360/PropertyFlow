/**
 * Seed and destructive scripts must not run against a hosted project.
 * The check is the URL host, which is what a developer (or a leaked env file)
 * actually points the script at.
 */

const EXACT_LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  // Supabase CLI docker network: Postgres service name, and the host gateway
  // containers use to reach published ports.
  'db',
  'host.docker.internal',
])

export type LocalTarget = {
  label: string
  url: string | undefined
}

export function databaseHost(rawUrl: string): string | null {
  const trimmed = rawUrl.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return host || null
  } catch {
    return null
  }
}

export function isLocalDatabaseHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (EXACT_LOCAL_HOSTS.has(host)) return true
  // Container name from `supabase start`: supabase_db_<project_id>
  return host.startsWith('supabase_db_')
}

/** Null when the URL is allowed. Otherwise a message suitable for stderr. */
export function localDatabaseRefusal(rawUrl: string | undefined, label: string): string | null {
  if (!rawUrl || !rawUrl.trim()) {
    return (
      `Refusing to run: ${label} is not set. ` +
      'Seed and destructive scripts only run against the local Supabase stack ' +
      '(localhost, 127.0.0.1, ::1, host.docker.internal, db, or supabase_db_*).'
    )
  }
  const host = databaseHost(rawUrl)
  if (!host || !isLocalDatabaseHost(host)) {
    return (
      `Refusing to run: ${label} host "${host ?? rawUrl.trim()}" is not local. ` +
      'Seed and destructive scripts only allow localhost, 127.0.0.1, ::1, ' +
      'host.docker.internal, db, or supabase_db_* (the Supabase CLI docker network).'
    )
  }
  return null
}

/**
 * Exit 1 unless every provided URL is local. Empty URLs are refused so a
 * missing env var cannot fall through to a hosted default.
 */
export function assertLocalDatabaseTargets(targets: LocalTarget[]): void {
  const problems = targets
    .map((target) => localDatabaseRefusal(target.url, target.label))
    .filter((message): message is string => Boolean(message))
  if (problems.length === 0) return
  console.error(problems.join('\n'))
  process.exit(1)
}

/** Database URL plus the Supabase API URL, when the script uses both. */
export function assertLocalSeedTarget(input: {
  databaseUrl?: string
  supabaseUrl?: string
}): void {
  const targets: LocalTarget[] = [
    { label: 'database URL (DIRECT_URL or DATABASE_URL)', url: input.databaseUrl },
  ]
  if (input.supabaseUrl !== undefined) {
    targets.push({ label: 'Supabase URL', url: input.supabaseUrl })
  }
  assertLocalDatabaseTargets(targets)
}
