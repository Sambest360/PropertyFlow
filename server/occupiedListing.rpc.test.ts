/**
 * Live check of the public marketplace RPC output keys (migration 027).
 * Runs only with OCCUPIED_RPC_DATABASE_URL pointing at a database that has
 * schema.sql + seed.sql + every migration applied. Everything happens inside a
 * transaction that is rolled back.
 */
import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { PUBLIC_UNIT_FORBIDDEN_KEYS } from './occupiedListing.js'
import {
  PUBLIC_BUILDING_KEYS,
  PUBLIC_CLIENT_KEYS,
  PUBLIC_ID_MAP_KEYS,
  PUBLIC_ROOM_KEYS,
  PUBLIC_SLOT_KEYS,
  PUBLIC_UNIT_KEYS,
  PUBLIC_UNIT_LIMIT_KEYS,
} from './publicMarketplaceKeys.js'

const sorted = (keys: readonly string[]) => [...keys].sort()

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
        expect(sorted(keys), `${fn} unit keys`).toEqual(sorted([...PUBLIC_UNIT_KEYS, ...PUBLIC_UNIT_LIMIT_KEYS]))
        expect(payload.users, `${fn} users`).toEqual([])
        const p = payload as unknown as Record<string, Record<string, unknown>[] | undefined>
        const exact: Array<[string, readonly string[]]> = [
          ['clients', PUBLIC_CLIENT_KEYS],
          ['buildings', PUBLIC_BUILDING_KEYS],
          ['rooms', PUBLIC_ROOM_KEYS],
          ['viewing_slots', PUBLIC_SLOT_KEYS],
          ['entity_id_map', PUBLIC_ID_MAP_KEYS],
        ]
        for (const [section, allowed] of exact) {
          for (const row of p[section] ?? []) {
            expect(sorted(Object.keys(row)), `${fn} ${section}`).toEqual(sorted(allowed))
          }
        }
        expect((p.entity_id_map ?? []).some((m) => m.entity_type === 'user'), `${fn} user ids`).toBe(false)
        // No lease row (tenant, reference, notice) is serialised anywhere.
        const text = JSON.stringify(payload)
        expect(text).not.toContain('lease_reference')
        expect(text).not.toContain('notice_given_by')
      }
      await client.query('RESET ROLE')
      for (const role of ['anon', 'authenticated']) {
        const priv = await client.query<{ unit_json: boolean; boot: boolean; lite: boolean }>(
          `SELECT has_function_privilege($1, 'public_listing_unit_json(uuid)', 'EXECUTE') AS unit_json,
                  has_function_privilege($1, 'get_public_marketplace_bootstrap(boolean)', 'EXECUTE') AS boot,
                  has_function_privilege($1, 'get_public_marketplace_bootstrap_lite(boolean)', 'EXECUTE') AS lite`,
          [role],
        )
        expect(priv.rows[0], role).toEqual({ unit_json: false, boot: true, lite: true })
      }
    } finally {
      await client.query('ROLLBACK').catch(() => undefined)
      await client.end()
    }
  })
})
