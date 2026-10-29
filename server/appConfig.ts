/**
 * Deploy identity for /api/health.
 * APP_COMMIT_SHA wins when set; otherwise (a server deployed with `git pull`)
 * the commit is read from the checkout's .git folder. Route handlers must
 * call runningCommitSha() and must not read the variable themselves.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

function trimmedEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

const SHA_RE = /^[0-9a-f]{40}$/

/** HEAD commit of a git checkout (loose or packed ref), or null. Never throws. */
export function gitHeadSha(gitDir: string): string | null {
  try {
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim()
    if (SHA_RE.test(head)) return head
    const ref = /^ref: (.+)$/.exec(head)?.[1]
    if (!ref) return null
    try {
      const sha = readFileSync(join(gitDir, ref), 'utf8').trim()
      if (SHA_RE.test(sha)) return sha
    } catch {
      /* not a loose ref — try packed-refs */
    }
    for (const line of readFileSync(join(gitDir, 'packed-refs'), 'utf8').split('\n')) {
      const [sha, name] = line.trim().split(' ')
      if (name === ref && sha && SHA_RE.test(sha)) return sha
    }
    return null
  } catch {
    return null
  }
}

// Read once: the commit this process loaded, even if `git pull` runs before
// the next `pm2 restart`.
let checkoutSha: string | null | undefined

/** Git commit of the running build, or null when it cannot be told. */
export function runningCommitSha(opts?: { gitDir?: string }): string | null {
  const fromEnv = trimmedEnv('APP_COMMIT_SHA')
  if (fromEnv) return fromEnv
  if (opts?.gitDir) return gitHeadSha(opts.gitDir)
  if (checkoutSha === undefined) checkoutSha = gitHeadSha(resolve(process.cwd(), '.git'))
  return checkoutSha
}
