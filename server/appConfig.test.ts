import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { gitHeadSha, runningCommitSha } from './appConfig'

const KEYS = ['APP_COMMIT_SHA', 'VERCEL_GIT_COMMIT_SHA'] as const

const saved: Record<string, string | undefined> = {}

function setEnv(name: (typeof KEYS)[number], value: string | undefined) {
  if (!(name in saved)) saved[name] = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

afterEach(() => {
  for (const name of KEYS) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
})

describe('runningCommitSha', () => {
  it('returns APP_COMMIT_SHA when it is set', () => {
    setEnv('APP_COMMIT_SHA', 'abc123')
    setEnv('VERCEL_GIT_COMMIT_SHA', 'from-host')
    expect(runningCommitSha()).toBe('abc123')
  })

  it('falls back to VERCEL_GIT_COMMIT_SHA when APP_COMMIT_SHA is unset', () => {
    setEnv('APP_COMMIT_SHA', '   ')
    setEnv('VERCEL_GIT_COMMIT_SHA', 'from-host')
    expect(runningCommitSha()).toBe('from-host')
  })

  it('returns null when neither commit variable is set and there is no checkout', () => {
    setEnv('APP_COMMIT_SHA', undefined)
    setEnv('VERCEL_GIT_COMMIT_SHA', undefined)
    expect(runningCommitSha({ gitDir: join(tmpdir(), 'pf-no-such-git-dir') })).toBeNull()
  })

  it('self-hosted: reads the checkout HEAD when no commit variable is set', () => {
    setEnv('APP_COMMIT_SHA', undefined)
    setEnv('VERCEL_GIT_COMMIT_SHA', undefined)
    const sha = 'a'.repeat(40)
    const dir = mkdtempSync(join(tmpdir(), 'pf-git-'))
    mkdirSync(join(dir, 'refs/heads'), { recursive: true })
    writeFileSync(join(dir, 'HEAD'), 'ref: refs/heads/main\n')
    writeFileSync(join(dir, 'refs/heads/main'), `${sha}\n`)
    expect(runningCommitSha({ gitDir: dir })).toBe(sha)
  })
})

describe('gitHeadSha', () => {
  it('reads detached, loose and packed refs', () => {
    const sha = 'b'.repeat(40)
    const detached = mkdtempSync(join(tmpdir(), 'pf-git-'))
    writeFileSync(join(detached, 'HEAD'), `${sha}\n`)
    expect(gitHeadSha(detached)).toBe(sha)

    const packed = mkdtempSync(join(tmpdir(), 'pf-git-'))
    writeFileSync(join(packed, 'HEAD'), 'ref: refs/heads/main\n')
    writeFileSync(join(packed, 'packed-refs'), `# pack-refs with: peeled\n${sha} refs/heads/main\n`)
    expect(gitHeadSha(packed)).toBe(sha)

    expect(gitHeadSha(join(tmpdir(), 'pf-no-such-git-dir'))).toBeNull()
  })
})

describe('health routes', () => {
  it('report commit only through runningCommitSha', () => {
    for (const file of ['api/index.ts', 'server/index.ts']) {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(src, file).not.toMatch(/APP_COMMIT_SHA|VERCEL_GIT_COMMIT_SHA/)
      expect(src, file).toContain('runningCommitSha()')
    }
  })
})
