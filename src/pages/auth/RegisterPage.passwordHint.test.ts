import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = readFileSync(new URL('./RegisterPage.tsx', import.meta.url), 'utf8')

describe('RegisterPage password hint uses the shared helper', () => {
  it('wires hint and both minLength values to MIN_PASSWORD_LENGTH / passwordMinLengthHint', () => {
    expect(src).toContain('passwordMinLengthHint()')
    expect(src).toContain('hint={passwordMinLengthHint()}')
    expect(src).toContain('minLength={MIN_PASSWORD_LENGTH}')
    expect(src.match(/minLength=\{MIN_PASSWORD_LENGTH\}/g)?.length).toBeGreaterThanOrEqual(2)
    expect(src).not.toContain('At least 8 characters')
    expect(src).not.toContain('minLength={8}')
    expect(src).not.toContain('`At least ${MIN_PASSWORD_LENGTH} characters`')
  })
})
