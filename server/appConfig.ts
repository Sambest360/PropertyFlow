/**
 * Deploy identity for /api/health.
 * APP_COMMIT_SHA is the portable name. VERCEL_GIT_COMMIT_SHA is only a fallback
 * when the host injects it. Route handlers must call runningCommitSha() and
 * must not read these variables themselves.
 */

function trimmedEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

/** Git commit of the running build, or null when the host did not provide one. */
export function runningCommitSha(): string | null {
  return trimmedEnv('APP_COMMIT_SHA') ?? trimmedEnv('VERCEL_GIT_COMMIT_SHA')
}
