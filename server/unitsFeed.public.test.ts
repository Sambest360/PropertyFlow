import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/v1/units is signed-out: only publicly listed units, the same rule as
 * the 027 RPC's public_units. Merged from #112 (ef87c536, server/unitsFeed.public.test.ts)
 * and turned into behaviour tests (round 4, Jim P4): fetchUnitsPage runs against
 * a real Postgres (OCCUPIED_RPC_DATABASE_URL, schema + seed + migrations) inside
 * a rolled-back transaction, and the assertions are on the rows it returns.
 */
const url = process.env.OCCUPIED_RPC_DATABASE_URL
const db = vi.hoisted(() => ({ client: null as null | { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> } }))
vi.mock('./db.js', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    if (!db.client) throw new Error('no test client')
    return (await db.client.query(sql, params)).rows
  },
}))

import { fetchUnitsPage } from './unitsFeed.js'

type Case = { key: string; status: string; listing: string; advertise?: boolean; availableFrom?: string | null; landlord?: 'approved' | 'pending' | 'rejected' }

// Every unit of one throwaway agency, so the feed (filtered to that agency) is exactly these.
const CASES: Case[] = [
  { key: 'available', status: 'AVAILABLE', listing: 'RENT' },
  { key: 'published-sale', status: 'PUBLISHED', listing: 'SALE' },
  { key: 'draft', status: 'DRAFT', listing: 'RENT' },
  { key: 'deleted', status: 'DELETED', listing: 'RENT' },
  { key: 'deleted-advertised', status: 'DELETED', listing: 'RENT', advertise: true, availableFrom: '2027-02-01' },
  { key: 'not-listed', status: 'AVAILABLE', listing: 'NOT_LISTED' },
  { key: 'occupied-advert-rent', status: 'OCCUPIED', listing: 'RENT', advertise: true, availableFrom: '2027-02-01' },
  { key: 'occupied-advert-both', status: 'OCCUPIED', listing: 'BOTH', advertise: true, availableFrom: '2027-03-01' },
  { key: 'occupied-unadvertised', status: 'OCCUPIED', listing: 'RENT' },
  { key: 'occupied-advert-no-date', status: 'OCCUPIED', listing: 'RENT', advertise: true, availableFrom: null },
  { key: 'occupied-advert-sale', status: 'OCCUPIED', listing: 'SALE', advertise: true, availableFrom: '2027-02-01' },
  { key: 'pending-landlord', status: 'AVAILABLE', listing: 'RENT', landlord: 'pending' },
  { key: 'rejected-landlord', status: 'AVAILABLE', listing: 'RENT', landlord: 'rejected' },
]
const PUBLIC = ['available', 'published-sale', 'occupied-advert-rent', 'occupied-advert-both']

describe.skipIf(!url)('GET /api/v1/units (no auth): behaviour on a live database', () => {
  let client: pg.Client
  let clientId = ''
  const ids = new Map<string, string>()

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url })
    await client.connect()
    await client.query('BEGIN')
    db.client = client
    clientId = (await client.query<{ id: string }>(
      `INSERT INTO clients (subdomain, company_name) VALUES ('feed-test-' || substr(md5(random()::text), 1, 8), 'Feed Test')
       RETURNING id::text AS id`,
    )).rows[0].id
    const landlord = async (status: string) =>
      (await client.query<{ id: string }>(
        `INSERT INTO users (client_id, email, first_name, last_name, role, metadata)
         VALUES ($1::uuid, $2, 'Land', 'Lord', 'LANDLORD', jsonb_build_object('verification', jsonb_build_object('status', $3::text)))
         RETURNING id::text AS id`,
        [clientId, `feed-${status}@example.invalid`, status],
      )).rows[0].id
    const landlords = { approved: await landlord('approved'), pending: await landlord('pending'), rejected: await landlord('rejected') }
    const building = async (landlordId: string) =>
      (await client.query<{ id: string }>(
        `INSERT INTO buildings (client_id, name, address, city, province, landlord_id)
         VALUES ($1::uuid, 'Feed Test', '1 Test St', 'Cape Town', 'WC', $2::uuid) RETURNING id::text AS id`,
        [clientId, landlordId],
      )).rows[0].id
    const buildings = { approved: await building(landlords.approved), pending: await building(landlords.pending), rejected: await building(landlords.rejected) }
    for (const [i, c] of CASES.entries()) {
      const id = (await client.query<{ id: string }>(
        `INSERT INTO units (client_id, building_id, unit_number, status_config_key, listing_type, advertise_while_occupied, available_from, created_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::date, now() - make_interval(mins => $8::int)) RETURNING id::text AS id`,
        [clientId, buildings[c.landlord ?? 'approved'], c.key, c.status, c.listing, c.advertise ?? false, c.availableFrom ?? null, i],
      )).rows[0].id
      ids.set(c.key, id)
    }
  })

  afterAll(async () => {
    db.client = null
    if (client) {
      await client.query('ROLLBACK').catch(() => undefined)
      await client.end()
    }
  })

  beforeEach(() => {
    expect(db.client).not.toBeNull()
  })

  const keysOf = (rows: Array<{ id: string }>) => {
    const byId = new Map([...ids].map(([k, v]) => [v, k]))
    return rows.map((r) => byId.get(r.id) ?? 'OTHER').sort()
  }

  it('returns exactly the publicly listed units: drafts, deleted, not_listed and unverified landlords are excluded', async () => {
    const page = await fetchUnitsPage({ clientId, limit: 100 })
    expect(keysOf(page.items)).toEqual([...PUBLIC].sort())
    expect(page.hasMore).toBe(false)
    expect(page.nextCursor).toBeNull()
  })

  it('keeps an advertised occupied unit (advertise_while_occupied, available_from, rent or both); drops an unadvertised one', async () => {
    const keys = keysOf((await fetchUnitsPage({ clientId, limit: 100 })).items)
    expect(keys).toContain('occupied-advert-rent')
    expect(keys).toContain('occupied-advert-both')
    expect(keys).not.toContain('occupied-unadvertised')
    expect(keys).not.toContain('occupied-advert-no-date')
    expect(keys).not.toContain('occupied-advert-sale')
  })

  it('returns card columns only (no owner, contact or metadata columns)', async () => {
    const [row] = (await fetchUnitsPage({ clientId, limit: 1 })).items
    expect(Object.keys(row).filter((k) => /email|phone|metadata|landlord|agent|notes/.test(k))).toEqual([])
  })

  it('cursor pagination: passes the returned cursor and still lists only public units, each once', async () => {
    const first = await fetchUnitsPage({ clientId, limit: 2 })
    expect(first.items).toHaveLength(2)
    expect(first.hasMore).toBe(true)
    expect(first.nextCursor).toBeTruthy()
    const second = await fetchUnitsPage({ clientId, limit: 2, cursor: first.nextCursor })
    const all = [...keysOf(first.items), ...keysOf(second.items)].sort()
    expect(all).toEqual([...PUBLIC].sort())
    expect(second.hasMore).toBe(false)
    expect(second.nextCursor).toBeNull()
  })
})

// Always-on guard (no database needed): the SQL fetchUnitsPage sends, with and
// without an agency filter and a real cursor (from #112, cursor actually passed).
describe('fetchUnitsPage SQL (mocked pool)', () => {
  it('filters public statuses / occupied adverts / not_listed / unverified landlords, with agency and cursor params', async () => {
    const sent: Array<{ sql: string; params: unknown[] }> = []
    db.client = { query: async (sql: string, params: unknown[] = []) => (sent.push({ sql, params }), { rows: [] }) }
    try {
      const cursor = Buffer.from('2027-01-01T00:00:00.000Z|00000000-0000-4000-8000-000000000009').toString('base64url')
      await fetchUnitsPage({})
      await fetchUnitsPage({ clientId: '00000000-0000-0000-0000-000000000001', limit: 5, cursor })
      for (const { sql } of sent) {
        expect(sql).toContain("u.status_config_key IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE')")
        expect(sql).toContain("lower(coalesce(u.listing_type, 'rent')) <> 'not_listed'")
        expect(sql).toMatch(/u\.advertise_while_occupied = true\s+AND u\.available_from IS NOT NULL\s+AND upper\(u\.status_config_key\) = 'OCCUPIED'/)
        expect(sql).toContain("coalesce(ll.metadata->'verification'->>'status', 'approved') NOT IN ('pending', 'rejected')")
        expect(sql).not.toContain('WHERE 1=1')
        expect(sql.slice(0, sql.indexOf('FROM units'))).not.toMatch(/email|phone|metadata|landlord|agent_id|ll\./)
      }
      expect(sent[1].params).toEqual([
        '00000000-0000-0000-0000-000000000001',
        '2027-01-01T00:00:00.000Z',
        '00000000-0000-4000-8000-000000000009',
        6,
      ])
      expect(sent[1].sql).toMatch(/AND u\.client_id = \$1::uuid AND \(u\.created_at, u\.id\) < \(\$2::timestamptz, \$3::uuid\)/)
      expect(sent[1].sql).toMatch(/LIMIT \$4/)
    } finally {
      db.client = null
    }
  })
})
