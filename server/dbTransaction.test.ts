import { describe, expect, it, vi } from 'vitest'

/** CR10 N3 (option a): server/db.ts threads one transaction through query(). Fake pg, no real database. */
const log = vi.hoisted(() => ({
  pool: [] as string[],
  client: [] as string[],
  listeners: [] as Array<{ event: string; fn: (err: Error) => void }>,
}))
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgres://pf:pf@127.0.0.1:5432/pf_test'
})
vi.mock('pg', () => {
  class Pool {
    on(event: string, fn: (err: Error) => void) {
      log.listeners.push({ event, fn })
      return this
    }
    async query(sql: string) {
      log.pool.push(sql)
      return { rows: [] }
    }
    async connect() {
      return {
        query: async (sql: string) => {
          log.client.push(sql)
          if (sql === 'FAIL') throw new Error('upsert failed')
          return { rows: [] }
        },
        release: () => undefined,
      }
    }
  }
  return { default: { Pool }, Pool }
})

describe('db.ts: one transaction, afterCommit after the outer COMMIT', () => {
  it('query() and nested withTransaction run on the outer client; hooks run after COMMIT', async () => {
    log.pool.length = 0
    log.client.length = 0
    const db = await import('./db.js')
    const hook = vi.fn()
    await db.withTransaction(async () => {
      await db.query('UPDATE leases')
      await db.withTransaction(async (c) => {
        await db.clientQuery(c, "INSERT INTO event_log 'lease_signed'")
        db.afterCommit(hook)
      })
      expect(hook).not.toHaveBeenCalled()
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(log.client).toEqual(['BEGIN', 'UPDATE leases', "INSERT INTO event_log 'lease_signed'", 'COMMIT'])
    expect(log.pool).toEqual([])
    expect(hook).toHaveBeenCalledTimes(1)
  })
  it('a failure rolls back everything; hooks never run; no DELETE issued', async () => {
    log.client.length = 0
    const db = await import('./db.js')
    const hook = vi.fn()
    await expect(
      db.withTransaction(async (c) => {
        await db.clientQuery(c, "INSERT INTO event_log 'lease_signed'")
        db.afterCommit(hook)
        await db.query('FAIL')
      }),
    ).rejects.toThrow('upsert failed')
    await new Promise((r) => setTimeout(r, 0))
    expect(log.client.at(-1)).toBe('ROLLBACK')
    expect(log.client).not.toContain('COMMIT')
    expect(log.client.some((q) => /DELETE/i.test(q))).toBe(false)
    expect(hook).not.toHaveBeenCalled()
  })
  it('after the transaction ends, query() goes back to the pool', async () => {
    log.pool.length = 0
    const db = await import('./db.js')
    await db.withTransaction(async () => undefined)
    await db.query('SELECT 1')
    expect(log.pool).toEqual(['SELECT 1'])
  })
  it("listens for the pool's 'error' event: a dropped idle connection must not end the process", async () => {
    await import('./db.js')
    const onError = log.listeners.find((l) => l.event === 'error')
    expect(onError).toBeDefined()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => onError!.fn(new Error('terminating connection due to administrator command'))).not.toThrow()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
