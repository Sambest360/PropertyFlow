import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = readFileSync(new URL('./SetPasswordPage.tsx', import.meta.url), 'utf8')

describe('SetPasswordPage password hint and minLength', () => {
  it('passes MIN_PASSWORD_LENGTH to both fields and the helper as the new-password hint', () => {
    expect(src).toContain('passwordMinLengthHint()')
    expect(src).toContain('hint={passwordMinLengthHint()}')
    expect(src).toContain('minLength={MIN_PASSWORD_LENGTH}')
    expect(src.match(/minLength=\{MIN_PASSWORD_LENGTH\}/g)?.length).toBeGreaterThanOrEqual(2)
    expect(src).toContain('if (password.length < MIN_PASSWORD_LENGTH)')
    expect(src).not.toContain('minLength={8}')
    expect(src).not.toContain('At least 8 characters')
  })
})
