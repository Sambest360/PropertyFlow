import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH, passwordMinLengthHint } from './passwordPolicy'

const src = readFileSync(new URL('./passwordPolicy.ts', import.meta.url), 'utf8')

describe('passwordMinLengthHint', () => {
  it('interpolates MIN_PASSWORD_LENGTH and is not a hardcoded 8 or 10', () => {
    expect(passwordMinLengthHint()).toBe(`At least ${MIN_PASSWORD_LENGTH} characters`)
    expect(src).toContain('export function passwordMinLengthHint')
    expect(src).toContain('`At least ${MIN_PASSWORD_LENGTH} characters`')
    expect(src).not.toContain('At least 8 characters')
    expect(src).not.toContain('At least 10 characters')
    expect(src).toContain('export const MIN_PASSWORD_LENGTH = 10')
  })
})
