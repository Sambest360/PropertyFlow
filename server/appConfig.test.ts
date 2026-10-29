import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runningCommitSha } from './appConfig'

const KEYS = ['APP_COMMIT_SHA'] as const

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
    expect(runningCommitSha()).toBe('abc123')
  })

  it('returns null when it is unset or blank', () => {
    setEnv('APP_COMMIT_SHA', '   ')
    expect(runningCommitSha()).toBeNull()
    setEnv('APP_COMMIT_SHA', undefined)
    expect(runningCommitSha()).toBeNull()
  })
})

describe('health routes', () => {
  it('report commit only through runningCommitSha', () => {
    for (const file of ['server/index.ts']) {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(src, file).not.toMatch(/APP_COMMIT_SHA/)
      expect(src, file).toContain('runningCommitSha()')
    }
  })
})
