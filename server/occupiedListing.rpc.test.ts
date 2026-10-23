/**
 * Live check of the public marketplace RPC output keys (migration 027).
 * Runs only with OCCUPIED_RPC_DATABASE_URL pointing at a database that has
 * schema.sql + seed.sql + every migration applied. Everything happens inside a
 * transaction that is rolled back.
 */
import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { PUBLIC_UNIT_FORBIDDEN_KEYS } from './occupiedListing.js'

const url = process.env.OCCUPIED_RPC_DATABASE_URL

describe.skipIf(!url)('get_public_marketplace_bootstrap* on a live database', () => {
  it('an occupied advert is public with available_from, limit snapshot, and no tenant PII', async () => {
    const client = new pg.Client({ connectionString: url })
    await client.connect()
    try {
      await client.query('BEGIN')
      const units = await client.query<{ id: string }>(
        `SELECT u.id::text AS id FROM units u
           JOIN buildings b ON b.id = u.building_id
           LEFT JOIN users ll ON ll.id = b.landlord_id
          WHERE coalesce(ll.metadata->'verification'->>'status', 'approved') NOT IN ('pending', 'rejected')
          ORDER BY u.created_at LIMIT 1`,
      )
      const unitId = units.rows[0]?.id
      expect(unitId).toBeTruthy()
      await client.query(
        `UPDATE units SET status_config_key = 'OCCUPIED', listing_type = 'RENT',
                advertise_while_occupied = true, available_from = DATE '2027-02-01', featured = true
          WHERE id = $1::uuid`,
        [unitId],
      )
      await client.query('SET LOCAL ROLE anon')
      for (const fn of ['get_public_marketplace_bootstrap', 'get_public_marketplace_bootstrap_lite']) {
        const res = await client.query<{ payload: { units: Record<string, unknown>[]; users: Record<string, unknown>[] } }>(
          `SELECT ${fn}(true) AS payload`,
        )
        const payload = res.rows[0].payload
        const unit = payload.units.find((u) => u.id === unitId)
        expect(unit, fn).toBeDefined()
        expect(unit!.available_from).toBe('2027-02-01')
        expect(unit).toHaveProperty('fully_booked')
        expect(unit).toHaveProperty('remaining')
        const keys = Object.keys(unit!)
        for (const bad of PUBLIC_UNIT_FORBIDDEN_KEYS) expect(keys, `${fn} unit`).not.toContain(bad)
        for (const user of payload.users) {
          expect(Object.keys(user), `${fn} user`).not.toContain('password_hash')
          expect(Object.keys(user), `${fn} user`).not.toContain('auth_user_id')
        }
        // No lease row (tenant, reference, notice) is serialised anywhere.
        const text = JSON.stringify(payload)
        expect(text).not.toContain('lease_reference')
        expect(text).not.toContain('notice_given_by')
      }
    } finally {
      await client.query('ROLLBACK').catch(() => undefined)
      await client.end()
    }
  })
})
