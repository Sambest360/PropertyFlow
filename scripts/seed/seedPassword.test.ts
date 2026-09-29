import { afterEach, describe, expect, it, vi } from 'vitest'

describe('resolveSeedPassword', () => {
  const previous = process.env.SEED_USER_PASSWORD

  afterEach(() => {
    vi.resetModules()
    if (previous === undefined) delete process.env.SEED_USER_PASSWORD
    else process.env.SEED_USER_PASSWORD = previous
  })

  it('uses SEED_USER_PASSWORD when it is set', async () => {
    vi.resetModules()
    process.env.SEED_USER_PASSWORD = 'local-only-password-1'
    const { resolveSeedPassword } = await import('./seedPassword.ts')
    expect(resolveSeedPassword()).toBe('local-only-password-1')
    expect(resolveSeedPassword()).toBe('local-only-password-1')
  })

  it('rejects a short seed password', async () => {
    vi.resetModules()
    process.env.SEED_USER_PASSWORD = 'short'
    const { resolveSeedPassword } = await import('./seedPassword.ts')
    expect(() => resolveSeedPassword()).toThrow(/at least 12/)
  })

  it('generates one strong password and reuses it when the env var is unset', async () => {
    vi.resetModules()
    delete process.env.SEED_USER_PASSWORD
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { resolveSeedPassword } = await import('./seedPassword.ts')
    const first = resolveSeedPassword()
    const second = resolveSeedPassword()
    expect(first).toBe(second)
    expect(first.length).toBeGreaterThanOrEqual(24)
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]?.[0])).toContain(first)
  })
})
