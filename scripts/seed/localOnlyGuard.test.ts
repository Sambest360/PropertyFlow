import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertLocalDatabaseTargets,
  databaseHost,
  isLocalDatabaseHost,
  localDatabaseRefusal,
} from './localOnlyGuard.ts'

describe('local database guard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts localhost, loopback, and the Supabase CLI docker hosts', () => {
    const allowed = [
      'postgresql://postgres:postgres@localhost:54322/postgres',
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      'postgresql://postgres:postgres@[::1]:54322/postgres',
      'http://127.0.0.1:54321',
      'http://host.docker.internal:54321',
      'postgresql://postgres:postgres@db:5432/postgres',
      'postgresql://postgres:postgres@supabase_db_propertyflow:5432/postgres',
    ]
    for (const url of allowed) {
      expect(localDatabaseRefusal(url, 'database URL'), url).toBeNull()
      const host = databaseHost(url)
      expect(host).toBeTruthy()
      expect(isLocalDatabaseHost(host!)).toBe(true)
    }
  })

  it('refuses a hosted Supabase URL and exits non-zero', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`)
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const hosted = 'https://abcdefghijklmnop.supabase.co'
    expect(localDatabaseRefusal(hosted, 'Supabase URL')).toMatch(/not local/)
    expect(() =>
      assertLocalDatabaseTargets([{ label: 'Supabase URL', url: hosted }]),
    ).toThrow(/exit 1/)
    expect(exit).toHaveBeenCalledWith(1)
    expect(errorSpy.mock.calls[0]?.[0]).toMatch(/abcdefghijklmnop\.supabase\.co/)
  })

  it('refuses a hosted Postgres host even when it is not branded supabase', () => {
    const message = localDatabaseRefusal(
      'postgresql://postgres.abc:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
      'database URL',
    )
    expect(message).toMatch(/aws-0-eu-central-1\.pooler\.supabase\.com/)
    expect(message).toMatch(/Refusing to run/)
  })

  it('refuses a missing URL', () => {
    expect(localDatabaseRefusal(undefined, 'database URL')).toMatch(/is not set/)
    expect(localDatabaseRefusal('   ', 'database URL')).toMatch(/is not set/)
  })
})
