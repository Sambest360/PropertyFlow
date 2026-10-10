import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import pg from 'pg'

/**
 * Jim #98: Vercel runs the pool with max 1. The access_notes column check
 * must not run from a second connection inside upsertTicket's transaction
 * (it would wait the full connect timeout and the notes would be dropped).
 * Real Postgres, real pg.Pool({ max: 1 }), cold cache. Runs when
 * PF_TEST_PG_URL points at a disposable database (skipped otherwise).
 */
const URL = process.env.PF_TEST_PG_URL
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CA = id(1)
const UN1 = id(10)
const TK = id(50)
const SCHEMA = `pf_pool1_${process.pid}`

const h = vi.hoisted(() => ({ pool: null as null | import('pg').Pool }))

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  get pool() {
    return h.pool
  },
  query: async (sql: string, params?: unknown[]) => (await h.pool!.query(sql, params as unknown[])).rows,
  clientQuery: async (c: import('pg').PoolClient, sql: string, params?: unknown[]) =>
    (await c.query(sql, params as unknown[])).rows,
  withTransaction: async <T>(fn: (c: import('pg').PoolClient) => Promise<T>) => {
    const c = await h.pool!.connect()
    try {
      await c.query('BEGIN')
      const out = await fn(c)
      await c.query('COMMIT')
      return out
    } catch (e) {
      await c.query('ROLLBACK').catch(() => undefined)
      throw e
    } finally {
      c.release()
    }
  },
}))
vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: vi.fn(async () => undefined),
  resolveUuid: vi.fn(async (_t: string, fe: string) => (fe === 'p-1' ? UN1 : fe === 'TK-1' ? TK : null)),
  ensureUuid: vi.fn(async () => TK),
  forgetId: vi.fn(),
  isUuid: (v: string) => /^[0-9a-f-]{36}$/i.test(v),
}))
vi.mock('./supabase/registerUser.js', () => ({ linkStaffAuthUser: vi.fn() }))

describe.skipIf(!URL)('access notes on a real pool-1 Postgres (cold cache)', () => {
  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL })
    await admin.connect()
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}`)
    await admin.query(`SET search_path = ${SCHEMA};
      CREATE TABLE units (id uuid PRIMARY KEY, client_id uuid, agent_id uuid);
      CREATE TABLE event_log (id bigserial, client_id uuid, event_type text, subject_type text, subject_id uuid,
        actor_user_id uuid, payload jsonb, created_at timestamptz);
      CREATE TABLE maintenance_tickets (
        id uuid PRIMARY KEY, client_id uuid, unit_id uuid, asset_id uuid, reported_by uuid, assigned_to uuid,
        contractor_id uuid, category_key text, title text, description text, priority text, status text,
        warranty_covered boolean, escalated_at timestamptz, cost_estimate numeric, cost_actual numeric,
        photos jsonb DEFAULT '[]', completed_at timestamptz, lease_id uuid, updated_at timestamptz,
        created_at timestamptz DEFAULT now());
      ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS access_notes text;
      INSERT INTO units VALUES ('${UN1}', '${CA}', NULL);`)
    await admin.end()
    h.pool = new pg.Pool({
      connectionString: URL,
      max: 1,
      connectionTimeoutMillis: 5_000,
      options: `-c search_path=${SCHEMA}`,
    })
  })

  afterAll(async () => {
    await h.pool?.end()
    if (!URL) return
    const admin = new pg.Client({ connectionString: URL })
    await admin.connect()
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await admin.end()
  })

  it('stores the notes in the transaction, quickly, with the column check cold', async () => {
    const { resetTicketAccessNotesCache, cachedTicketAccessNotesColumn } = await import('./ticketAccessNotes.js')
    resetTicketAccessNotesCache()
    expect(cachedTicketAccessNotesColumn()).toBeUndefined()
    const { handlePersist } = await import('./writes.js')
    const t0 = Date.now()
    await handlePersist(
      {
        resource: 'ticket',
        action: 'upsert',
        id: 'TK-1',
        data: { propertyId: 'p-1', title: 'Geyser', photoUrls: ['https://cdn.example/1.jpg'], accessNotes: 'Gate 4411' },
      } as never,
      null,
    )
    const ms = Date.now() - t0
    expect(ms).toBeLessThan(2_000)
    const rows = (await h.pool!.query(`SELECT access_notes FROM maintenance_tickets WHERE id = $1`, [TK])).rows
    expect(rows[0]?.access_notes).toBe('Gate 4411')
    expect(cachedTicketAccessNotesColumn()).toBe(true)
  }, 15_000)
})
