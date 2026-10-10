import { describe, expect, it, vi } from 'vitest'

/**
 * CR10 nit 4, real Postgres: STORED_ESIGN_SQL_MERGE run in a real
 * ON CONFLICT upsert. Runs only when PF_TEST_PG_URL points at a throwaway
 * local Postgres (Jim used 17; this box: initdb + pg_ctl on a unix socket).
 * Never DATABASE_URL, never a shared database. Without it, the SQL-text test
 * in writes.leasePartyLock.test.ts still pins the expression.
 */
const url = process.env.PF_TEST_PG_URL
vi.mock('./db.js', () => ({ databaseConfigured: true, query: vi.fn(async () => []), withTransaction: vi.fn(), clientQuery: vi.fn(), afterCommit: vi.fn() }))

describe.skipIf(!url)('STORED_ESIGN_SQL_MERGE on real Postgres', () => {
  it('same envelope: stored party blocks / status win over the payload; other fields from the payload', async () => {
    const pg = (await import('pg')).default
    const { STORED_ESIGN_SQL_MERGE } = await import('./writes.js')
    const client = new pg.Client({ connectionString: url })
    await client.connect()
    try {
      await client.query('CREATE TEMP TABLE leases (id uuid PRIMARY KEY, metadata jsonb)')
      const id = '11111111-1111-4111-8111-111111111111'
      const stored = { envelopeId: 'ENV-1', status: 'partially_signed', tenant: { status: 'signed', method: 'drawn' }, landlord: { status: 'pending' }, note: 'old' }
      await client.query('INSERT INTO leases VALUES ($1, $2::jsonb)', [id, JSON.stringify({ eSign: stored, keep: 1 })])
      const upsert = (meta: unknown) =>
        client.query(
          `INSERT INTO leases (id, metadata) VALUES ($1, $2::jsonb)
           ON CONFLICT (id) DO UPDATE SET metadata = leases.metadata || EXCLUDED.metadata || ${STORED_ESIGN_SQL_MERGE}`,
          [id, JSON.stringify(meta)],
        )
      const read = async () => (await client.query('SELECT metadata FROM leases WHERE id = $1', [id])).rows[0].metadata
      // Gate-time snapshot with a stale tenant block and status.
      await upsert({ eSign: { envelopeId: 'ENV-1', status: 'sent', tenant: { status: 'pending' }, landlord: { status: 'pending' }, note: 'new' } })
      let m = await read()
      expect(m.eSign).toMatchObject({ status: 'partially_signed', tenant: { status: 'signed', method: 'drawn' }, note: 'new' })
      expect(m.keep).toBe(1)
      // A different envelope (allowed replacement) takes the payload.
      await upsert({ eSign: { envelopeId: 'ENV-2', status: 'sent', tenant: { status: 'pending' }, landlord: { status: 'pending' } } })
      m = await read()
      expect(m.eSign).toMatchObject({ envelopeId: 'ENV-2', status: 'sent', tenant: { status: 'pending' } })
      // A payload with no eSign object leaves the stored one.
      await upsert({ other: true })
      m = await read()
      expect(m.eSign.envelopeId).toBe('ENV-2')
    } finally {
      await client.end()
    }
  })
})
