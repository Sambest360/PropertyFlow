import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** Three base64url segments. The pattern is assembled so this file contains no token. */
const JWT = new RegExp(['ey', 'J[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+'].join(''), 'g')

export type JwtHit = { file: string }

export function findJwtHits(text: string): string[] {
  return text.match(JWT) ?? []
}

function isLockfile(path: string): boolean {
  const base = path.split('/').pop() ?? ''
  return (
    base === 'package-lock.json' ||
    base === 'npm-shrinkwrap.json' ||
    base === 'yarn.lock' ||
    base === 'pnpm-lock.yaml' ||
    base === 'bun.lock' ||
    base === 'bun.lockb' ||
    base.endsWith('.lock')
  )
}

export function trackedFiles(cwd = '.'): string[] {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' })
  return output.split('\0').filter(Boolean)
}

export function scanTrackedFilesForJwts(cwd = '.'): JwtHit[] {
  const hits: JwtHit[] = []
  for (const file of trackedFiles(cwd)) {
    if (isLockfile(file)) continue
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (findJwtHits(text).length > 0) hits.push({ file })
  }
  return hits
}
