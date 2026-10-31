import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Nearest-first guest marketplace: nearestPublicUnitIds runs its SQL against a
 * real Postgres (OCCUPIED_RPC_DATABASE_URL: schema + seed + migrations, as in
 * unitsFeed.public.pg.test.ts) inside a rolled-back transaction. Test units sit
 * around a point in the South Atlantic, far from any seed listing.
 */
const url = process.env.OCCUPIED_RPC_DATABASE_URL
const db = vi.hoisted(() => ({ client: null as null | { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> } }))
vi.mock('./db.js', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    if (!db.client) throw new Error('no test client')
    return (await db.client.query(sql, params)).rows
  },
}))

import { nearestPublicUnitIds } from './marketplaceNear.js'

const ORIGIN = { lat: -50, lng: 0 }
// ~0.0090° of latitude per km.
const KM = 1 / 111.32

type Case = {
  key: string
  km: number | null
  /** Coordinates on the building only (unit lat/lng null). */
  viaBuilding?: boolean
  status?: string
  listing?: string
}

const CASES: Case[] = [
  { key: 'far', km: 50 },
  { key: 'near', km: 1 },
  { key: 'mid', km: 5 },
  { key: 'via-building', km: 3, viaBuilding: true },
  { key: 'sale-only', km: 2, listing: 'SALE' },
  { key: 'draft', km: 0.5, status: 'DRAFT' },
  { key: 'not-listed', km: 0.5, listing: 'NOT_LISTED' },
  { key: 'unmapped', km: null },
]

describe.skipIf(!url)('nearestPublicUnitIds on a live database', () => {
  let client: pg.Client
  const ids = new Map<string, string>()

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url })
    await client.connect()
    await client.query('BEGIN')
    db.client = client
    const clientId = (await client.query<{ id: string }>(
      `INSERT INTO clients (subdomain, company_name) VALUES ('near-test-' || substr(md5(random()::text), 1, 8), 'Near Test')
       RETURNING id::text AS id`,
    )).rows[0].id
    for (const [i, c] of CASES.entries()) {
      const lat = c.km == null ? null : ORIGIN.lat + c.km * KM
      const lng = c.km == null ? null : ORIGIN.lng
      const buildingId = (await client.query<{ id: string }>(
        `INSERT INTO buildings (client_id, name, address, city, province, lat, lng)
         VALUES ($1::uuid, 'Near Test', '1 Test St', 'Nowhere', 'WC', $2, $3) RETURNING id::text AS id`,
        [clientId, c.viaBuilding ? lat : null, c.viaBuilding ? lng : null],
      )).rows[0].id
      const id = (await client.query<{ id: string }>(
        `INSERT INTO units (client_id, building_id, unit_number, status_config_key, listing_type, lat, lng, created_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, now() - make_interval(mins => $8::int)) RETURNING id::text AS id`,
        [clientId, buildingId, c.key, c.status ?? 'AVAILABLE', c.listing ?? 'RENT', c.viaBuilding ? null : lat, c.viaBuilding ? null : lng, i],
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

  const ours = (list: string[]) => {
    const byId = new Map([...ids].map(([k, v]) => [v, k]))
    return list.map((id) => byId.get(id)).filter(Boolean)
  }

  it('rent: public units closest first (building coordinates count), unmapped after every mapped unit', async () => {
    const list = await nearestPublicUnitIds({ ...ORIGIN, mode: 'rent' }, { limit: 5000 })
    expect(ours(list)).toEqual(['near', 'via-building', 'mid', 'far', 'unmapped'])
  })

  it('no mode: sale listings are included', async () => {
    const list = await nearestPublicUnitIds({ ...ORIGIN, mode: null }, { limit: 5000 })
    expect(ours(list)).toEqual(['near', 'sale-only', 'via-building', 'mid', 'far', 'unmapped'])
  })

  it('a small limit is answered from the first box: the nearest only', async () => {
    const list = await nearestPublicUnitIds({ ...ORIGIN, mode: 'rent' }, { limit: 2 })
    expect(ours(list)).toEqual(['near', 'via-building'])
    expect(list).toHaveLength(2)
  })
})
