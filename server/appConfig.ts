/**
 * Deploy identity for /api/health. Set APP_COMMIT_SHA in the server .env (or
 * the environment) to report the running commit. Route handlers must call
 * runningCommitSha() and must not read the variable themselves.
 */

/** Git commit of the running build, or null when it was not provided. */
export function runningCommitSha(): string | null {
  const value = process.env.APP_COMMIT_SHA?.trim()
  return value ? value : null
}
