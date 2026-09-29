import { describe, expect, it, vi } from 'vitest'
import { resolveLocalServiceRoleKey, serviceRoleFromStatusEnv } from './localServiceRole.ts'

function fakeKey(label: string): string {
  return ['ey' + 'J' + label, 'ey' + 'Jbody', 'sig'].join('.')
}

describe('local service role key', () => {
  it('parses SERVICE_ROLE_KEY and SECRET_KEY from status env text', () => {
    const service = fakeKey('service')
    const secret = fakeKey('secret')
    expect(serviceRoleFromStatusEnv(`SERVICE_ROLE_KEY="${service}"\nSECRET_KEY=${secret}\n`)).toBe(service)
    expect(serviceRoleFromStatusEnv(`export SECRET_KEY='${secret}'\n`)).toBe(secret)
    expect(serviceRoleFromStatusEnv('ANON_KEY=\n')).toBeUndefined()
  })

  it('uses SUPABASE_SECRET_KEY, then SUPABASE_SERVICE_ROLE_KEY, and does not call status', () => {
    const readStatus = vi.fn(() => 'SERVICE_ROLE_KEY=from-status')
    const secret = fakeKey('env-secret')
    const service = fakeKey('env-service')
    expect(
      resolveLocalServiceRoleKey({
        allowStatusLookup: true,
        env: { SUPABASE_SECRET_KEY: secret, SUPABASE_SERVICE_ROLE_KEY: service },
        readStatus,
      }),
    ).toBe(secret)
    expect(
      resolveLocalServiceRoleKey({
        allowStatusLookup: true,
        env: { SUPABASE_SERVICE_ROLE_KEY: service },
        readStatus,
      }),
    ).toBe(service)
    expect(readStatus).not.toHaveBeenCalled()
  })

  it('reads status only after the caller allows it, and refuses when that fails', () => {
    const fromStatus = fakeKey('status')
    const readStatus = vi.fn(() => `SERVICE_ROLE_KEY=${fromStatus}`)
    expect(
      resolveLocalServiceRoleKey({
        allowStatusLookup: true,
        env: {},
        readStatus,
      }),
    ).toBe(fromStatus)
    expect(readStatus).toHaveBeenCalledOnce()
    expect(() =>
      resolveLocalServiceRoleKey({
        allowStatusLookup: false,
        env: {},
        readStatus,
      }),
    ).toThrow(/supabase status -o env/)
    expect(readStatus).toHaveBeenCalledOnce()
  })
})
