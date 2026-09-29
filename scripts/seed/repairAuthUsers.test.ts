import { afterEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DirectAdminClient } from './directAdmin.ts'

describe('repairAuthUsers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('refuses a non-local database and does not reset passwords', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`)
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const query = vi.fn()
    const pool = {
      options: {
        connectionString: 'postgresql://postgres.abc:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
      },
      query,
    } as unknown as pg.Pool
    const admin = new DirectAdminClient(pool, 'unused-seed-password')
    await expect(admin.repairAuthUsers()).rejects.toThrow(/exit 1/)
    expect(exit).toHaveBeenCalledWith(1)
    expect(query).not.toHaveBeenCalled()
  })
})