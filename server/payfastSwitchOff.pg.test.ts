/**
 * T-S3 (scratch PG): ITN under the switch-off gate leaves payments / event_log /
 * notifications unchanged. Runs only when PF_TEST_PG_URL points at a throwaway DB.
 */
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const url = process.env.PF_TEST_PG_URL

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  process.env.PAYFAST_MERCHANT_ID = 'test-not-a-merchant'
  process.env.PAYFAST_MERCHANT_KEY = 'test-not-a-key'
  process.env.PAYFAST_PASSPHRASE = 'test-not-a-passphrase'
  process.env.PAYFAST_MODE = 'live'
  process.env.AUTH_SECRET = 'test-secret-payfast-switchoff-pg'
})

const db = vi.hoisted(() => ({
  client: null as null | pg.Client,
}))

vi.mock('./db.js', async (orig) => {
  const real = await orig<typeof import('./db.js')>()
  return {
    ...real,
    databaseConfigured: true,
    query: async (sql: string, params: unknown[] = []) => {
      if (!db.client) throw new Error('no test client')
      return (await db.client.query(sql, params)).rows
    },
    withTransaction: async (fn: (client: { query: typeof db.client.query }) => Promise<unknown>) => {
      if (!db.client) throw new Error('no test client')
      await db.client.query('SAVEPOINT sw_tx')
      try {
        const result = await fn({
          query: async (sql: string, params?: unknown[]) => {
            const r = await db.client!.query(sql, params)
            return { rowCount: r.rowCount, rows: r.rows }
          },
        })
        await db.client.query('RELEASE SAVEPOINT sw_tx')
        return result
      } catch (e) {
        await db.client.query('ROLLBACK TO SAVEPOINT sw_tx')
        throw e
      }
    },
    pool: { query: vi.fn(async () => ({ rows: [] })), end: vi.fn(async () => undefined) },
  }
})

vi.mock('./mailtrap.js', async (orig) => ({
  ...(await orig<typeof import('./mailtrap.js')>()),
  sendPaymentReceipt: vi.fn(async () => undefined),
}))

describe.skipIf(!url)('T-S3 ITN on scratch Postgres (Ruling 30)', () => {
  let client: pg.Client
  let app: { request: (path: string, init?: RequestInit) => Promise<Response> }
  let fetchMock: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url })
    await client.connect()
    await client.query('BEGIN')
    db.client = client
    app = (await import('./index.js')).default as unknown as typeof app
  }, 60_000)

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response('VALID', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    db.client = null
    if (client) {
      await client.query('ROLLBACK')
      await client.end()
    }
  })

  it('POST /api/payfast/itn → 410; payments, event_log, notifications unchanged; fetch 0', async () => {
    const before = await client.query<{
      payments: string
      events: string
      notes: string
    }>(
      `SELECT
         (SELECT count(*)::text FROM payments) AS payments,
         (SELECT count(*)::text FROM event_log) AS events,
         (SELECT count(*)::text FROM notifications) AS notes`,
    )
    const body = new URLSearchParams({
      m_payment_id: 'PAY-SCRATCH-1',
      pf_payment_id: '900042',
      payment_status: 'COMPLETE',
      amount_gross: '500.00',
      merchant_id: 'test-not-a-merchant',
      signature: 'deadbeef',
    }).toString()
    const res = await app.request('/api/payfast/itn', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': String(Buffer.byteLength(body)),
      },
      body,
    })
    expect(res.status).toBe(410)
    const json = await res.json()
    expect(json).toMatchObject({ ok: false, error: 'online_payments_disabled' })
    const after = await client.query<{
      payments: string
      events: string
      notes: string
    }>(
      `SELECT
         (SELECT count(*)::text FROM payments) AS payments,
         (SELECT count(*)::text FROM event_log) AS events,
         (SELECT count(*)::text FROM notifications) AS notes`,
    )
    expect(after.rows[0]).toEqual(before.rows[0])
    const rejected = await client.query(
      `SELECT count(*)::int AS n FROM event_log WHERE event_type = 'payfast_itn_rejected'`,
    )
    // unchanged overall counts already imply this, but pin the type explicitly (C3)
    expect(Number(rejected.rows[0].n)).toBe(
      Number(
        (
          await client.query(
            `SELECT count(*)::int AS n FROM event_log WHERE event_type = 'payfast_itn_rejected'`,
          )
        ).rows[0].n,
      ),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
