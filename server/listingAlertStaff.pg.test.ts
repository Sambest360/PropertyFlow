import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The public listing-enquiry agent alert lookup (loadListingAlertStaff, the
 * exact SQL POST /api/public/listing-enquiry sends) against a REAL scratch
 * Postgres built from database/postgres/schema.sql (never live). Runs only when
 * PF_TEST_PG_URL points at a throwaway local database; everything it inserts is
 * rolled back. Jim #121 review item 4 / proof 20: `units` has no landlord_id
 * column in schema.sql (it is on buildings), so the old join on
 * un.landlord_id failed and no agent alert was ever sent.
 */
const url = process.env.PF_TEST_PG_URL
const db = vi.hoisted(() => ({ client: null as null | { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> } }))
vi.mock('./db.js', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    if (!db.client) throw new Error('no test client')
    return (await db.client.query(sql, params)).rows
  },
}))

import { loadListingAlertStaff } from './listingAlertStaff.js'

describe.skipIf(!url)('listing-enquiry agent alert lookup on a schema.sql Postgres', () => {
  let client: pg.Client
  const ids = { withLandlord: '', noLandlord: '', noAgent: '' }
  let tag = ''

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url })
    await client.connect()
    await client.query('BEGIN')
    db.client = client
    tag = (await client.query<{ t: string }>(`SELECT substr(md5(random()::text), 1, 8) AS t`)).rows[0].t
    const clientId = (await client.query<{ id: string }>(
      `INSERT INTO clients (subdomain, company_name) VALUES ('alert-' || $1, 'Alert Test') RETURNING id::text AS id`,
      [tag],
    )).rows[0].id
    const user = async (role: string, email: string, first: string) =>
      (await client.query<{ id: string }>(
        `INSERT INTO users (client_id, email, password_hash, first_name, last_name, role)
         VALUES ($1::uuid, $2, 'x', $3, 'Test', $4) RETURNING id::text AS id`,
        [clientId, `${tag}-${email}`, first, role],
      )).rows[0].id
    const agentId = await user('GROUND_AGENT', 'agent@example.invalid', 'Agnes')
    const landlordId = await user('LANDLORD', 'landlord@example.invalid', 'Lars')
    const building = async (landlord: string | null) =>
      (await client.query<{ id: string }>(
        `INSERT INTO buildings (client_id, name, address, city, province, landlord_id)
         VALUES ($1::uuid, 'Alert Test', '1 Test St', 'Cape Town', 'WC', $2::uuid) RETURNING id::text AS id`,
        [clientId, landlord],
      )).rows[0].id
    const unit = async (buildingId: string, agent: string | null, title: string) =>
      (await client.query<{ id: string }>(
        `INSERT INTO units (client_id, building_id, unit_number, title, agent_id)
         VALUES ($1::uuid, $2::uuid, $3, $3, $4::uuid) RETURNING id::text AS id`,
        [clientId, buildingId, title, agent],
      )).rows[0].id
    const owned = await building(landlordId)
    ids.withLandlord = await unit(owned, agentId, 'Unit with landlord')
    ids.noAgent = await unit(owned, null, 'Unit without agent')
    ids.noLandlord = await unit(await building(null), agentId, 'Unit without landlord')
    // Seed an enquiry against the unit, as the route does before alerting.
    await client.query(
      `INSERT INTO leads (client_id, unit_id, name, email) VALUES ($1::uuid, $2::uuid, 'Lee Enquirer', $3)`,
      [clientId, ids.withLandlord, `${tag}-lead@example.invalid`],
    )
  })

  // Each test in its own savepoint, so one failing query cannot abort the others.
  beforeEach(async () => {
    await client.query('SAVEPOINT each_test')
  })
  afterEach(async () => {
    await client.query('ROLLBACK TO SAVEPOINT each_test')
  })

  afterAll(async () => {
    db.client = null
    if (client) {
      await client.query('ROLLBACK').catch(() => undefined)
      await client.end()
    }
  })

  it('schema premise: units has no landlord_id column (it lives on buildings)', async () => {
    const cols = (await client.query(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'landlord_id' AND table_name IN ('units', 'buildings')`,
    )).rows.map((r) => (r as { table_name: string }).table_name)
    expect(cols).toEqual(['buildings'])
  })

  it('runs without error and returns the agent, the building landlord and the unit title', async () => {
    await expect(loadListingAlertStaff(ids.withLandlord)).resolves.toEqual({
      agent_email: `${tag}-agent@example.invalid`,
      agent_first: 'Agnes',
      landlord_email: `${tag}-landlord@example.invalid`,
      unit_title: 'Unit with landlord',
    })
  })

  it('a building with no landlord still returns the agent (landlord null)', async () => {
    await expect(loadListingAlertStaff(ids.noLandlord)).resolves.toEqual({
      agent_email: `${tag}-agent@example.invalid`,
      agent_first: 'Agnes',
      landlord_email: null,
      unit_title: 'Unit without landlord',
    })
  })

  it('a unit with no agent returns a row with agent_email null (so the route sends nothing)', async () => {
    const s = await loadListingAlertStaff(ids.noAgent)
    expect(s?.agent_email).toBeNull()
    expect(s?.landlord_email).toBe(`${tag}-landlord@example.invalid`)
  })

  it('an unknown or missing unit id returns no row', async () => {
    await expect(loadListingAlertStaff('00000000-0000-4000-8000-000000000000')).resolves.toBeUndefined()
    await expect(loadListingAlertStaff(null)).resolves.toBeUndefined()
  })
})
