/**
 * Live checks of migration 027 against a real Postgres (Supabase roles anon /
 * authenticated, auth.uid() from request.jwt.claim.sub). Runs only with
 * OCCUPIED_RPC_DATABASE_URL pointing at a database that has schema.sql +
 * seed.sql + every migration applied. Each test runs in a transaction that is
 * rolled back. Assertions on payload text are boolean so a failure never
 * prints the payload (no hash or contact value ever reaches the log).
 */
import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { PUBLIC_UNIT_FORBIDDEN_KEYS, listTenantViewingRequests, type OccupiedDeps } from './occupiedListing.js'
import type { DemoActor } from './actor.js'
import { bookingWallClock } from './bootstrap.js'
import { slotStoredStart } from './slotInstant.js'
import { readFileSync } from 'node:fs'
import {
  PUBLIC_BUILDING_KEYS,
  PUBLIC_CLIENT_KEYS,
  PUBLIC_ID_MAP_KEYS,
  PUBLIC_ROOM_KEYS,
  PUBLIC_SLOT_KEYS,
  PUBLIC_UNIT_KEYS,
  PUBLIC_UNIT_LIMIT_KEYS,
} from './publicMarketplaceKeys.js'

const url = process.env.OCCUPIED_RPC_DATABASE_URL
const PROBES = JSON.parse(readFileSync(new URL('./listedByProbes.json', import.meta.url), 'utf8')) as {
  reject: Record<string, string>
  accept: Record<string, string>
  unicode_accept: Record<string, string>
}
const RPCS = ['get_public_marketplace_bootstrap', 'get_public_marketplace_bootstrap_lite'] as const
const sorted = (keys: readonly string[]) => [...keys].sort()
const SNAPSHOT_KEYS = sorted(PUBLIC_UNIT_LIMIT_KEYS)
const ALLOWED_KEYS = {
  clients: sorted(PUBLIC_CLIENT_KEYS),
  buildings: sorted(PUBLIC_BUILDING_KEYS),
  units: sorted(PUBLIC_UNIT_KEYS),
  rooms: sorted(PUBLIC_ROOM_KEYS),
  viewing_slots: sorted(PUBLIC_SLOT_KEYS),
  entity_id_map: sorted(PUBLIC_ID_MAP_KEYS),
}

/** Values seeded on the landlord / building that must never reach anon output. */
const SENTINEL = {
  email: 'landlord.sentinel-rpc@example.invalid',
  phone: '+27 00 000 7319',
  pw: 'SENTINEL-NOT-A-HASH-rpc',
  dataUrl: 'data:image/png;base64,U0VOVElORUxEQVRBVVJM',
  notes: 'SENTINEL-LANDLORD-NOTES',
  setting: 'SENTINEL-LANDLORD-SETTING',
  buildingNotes: 'SENTINEL-BUILDING-NOTES',
}

type Payload = Record<string, Record<string, unknown>[]>

async function withTx<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await client.query('BEGIN')
    return await fn(client)
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    await client.end()
  }
}

/** Run as a Supabase role; `sub` is the auth user id for authenticated. */
async function as(c: pg.Client, role: 'anon' | 'authenticated', sub: string | null = null) {
  await c.query('RESET ROLE')
  await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [sub ?? ''])
  await c.query(`SET LOCAL ROLE ${role}`)
}

/** Error code / message of a statement run under a savepoint, or null when it succeeds. */
async function attempt(c: pg.Client, sql: string, params: unknown[] = []): Promise<string | null> {
  await c.query('SAVEPOINT t')
  try {
    await c.query(sql, params)
    await c.query('RELEASE SAVEPOINT t')
    return null
  } catch (err) {
    await c.query('ROLLBACK TO SAVEPOINT t')
    const e = err as { code?: string; message?: string }
    return e.code === 'P0001' ? String(e.message) : String(e.code)
  }
}

async function payloads(c: pg.Client): Promise<Array<[string, Payload]>> {
  const out: Array<[string, Payload]> = []
  for (const fn of RPCS) {
    for (const lite of [true, false]) {
      const res = await c.query<{ payload: Payload }>(`SELECT ${fn}($1) AS payload`, [lite])
      out.push([`${fn}(${lite})`, res.rows[0].payload])
    }
  }
  return out
}

type Fixture = { landlord: string; staff: string; clientA: string; clientB: string; unitA: string; unitA2: string; unitB: string; leaseA: string; leaseB: string; staffSub: string; landlordSub: string; tenant: string; tenantSub: string }

/** Two agencies, a staff user in A, a landlord, a tenant and one ACTIVE lease per agency. */
async function fixture(c: pg.Client): Promise<Fixture> {
  const clients = await c.query<{ id: string }>(
    `SELECT c.id::text AS id FROM clients c
      WHERE (SELECT count(*) FROM units u WHERE u.client_id = c.id
               AND NOT EXISTS (SELECT 1 FROM leases l WHERE l.unit_id = u.id)) >= 2
      ORDER BY c.created_at, c.id LIMIT 2`,
  )
  expect(clients.rows.length).toBe(2)
  const [clientA, clientB] = clients.rows.map((r) => r.id)
  const free = async (client: string) =>
    (
      await c.query<{ id: string }>(
        `SELECT u.id::text AS id FROM units u
          WHERE u.client_id = $1::uuid AND NOT EXISTS (SELECT 1 FROM leases l WHERE l.unit_id = u.id)
          ORDER BY u.created_at, u.id`,
        [client],
      )
    ).rows.map((r) => r.id)
  const [unitA, unitA2] = await free(clientA)
  const [unitB] = await free(clientB)
  const ids = (await c.query<{ s: string; l: string; t: string }>(
    `SELECT gen_random_uuid()::text AS s, gen_random_uuid()::text AS l, gen_random_uuid()::text AS t`,
  )).rows[0]
  // Auth rows without the profile-sync trigger (rolled back with the test).
  await c.query('ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created')
  await c.query(`INSERT INTO auth.users (id) SELECT unnest($1::uuid[])`, [[ids.s, ids.l, ids.t]])
  const staff = (await c.query<{ id: string }>(
    `INSERT INTO users (client_id, email, first_name, last_name, role, auth_user_id)
     VALUES ($1::uuid, 'staff.rpc-test@example.invalid', 'Staff', 'Agent', 'AGENT_ADMIN', $2::uuid)
     RETURNING id::text AS id`,
    [clientA, ids.s],
  )).rows[0].id
  // Jim: a landlord carrying every kind of private data (verified, so the unit stays public).
  const landlord = (await c.query<{ id: string }>(
    `INSERT INTO users (client_id, email, password_hash, first_name, last_name, phone, role, auth_user_id, metadata)
     VALUES (NULL, $1, $2, 'Land', 'Lord', $3, 'LANDLORD', $4::uuid,
             jsonb_build_object(
               'verification', jsonb_build_object(
                 'status', 'approved',
                 'documents', jsonb_build_array(jsonb_build_object('name', 'id.png', 'dataUrl', $5::text))),
               'notes', $6::text,
               'settings', jsonb_build_object('sentinel', $7::text)))
     RETURNING id::text AS id`,
    [SENTINEL.email, SENTINEL.pw, SENTINEL.phone, ids.l, SENTINEL.dataUrl, SENTINEL.notes, SENTINEL.setting],
  )).rows[0].id
  await c.query(
    `UPDATE buildings SET landlord_id = $1::uuid, notes = $2
      WHERE id = (SELECT building_id FROM units WHERE id = $3::uuid)`,
    [landlord, SENTINEL.buildingNotes, unitA],
  )
  // unitA is listed by the staff agent ("Listed by Staff Agent").
  await c.query(`UPDATE units SET agent_id = $1::uuid WHERE id = $2::uuid`, [staff, unitA])
  const tenant = (await c.query<{ id: string }>(
    `INSERT INTO users (client_id, email, first_name, last_name, role, auth_user_id)
     VALUES ($1::uuid, 'tenant.rpc-test@example.invalid', 'Ten', 'Ant', 'END_USER', $2::uuid)
     RETURNING id::text AS id`,
    [clientA, ids.t],
  )).rows[0].id
  const lease = async (client: string, unit: string, ref: string, tenantId: string | null) =>
    (
      await c.query<{ id: string }>(
        `INSERT INTO leases (client_id, unit_id, tenant_id, lease_reference, status, start_date, rent_amount)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'ACTIVE', DATE '2026-01-01', 10000)
         RETURNING id::text AS id`,
        [client, unit, tenantId, ref],
      )
    ).rows[0].id
  const leaseA = await lease(clientA, unitA, 'RPC-TEST-A', tenant)
  const leaseB = await lease(clientB, unitB, 'RPC-TEST-B', null)
  return { landlord, staff, clientA, clientB, unitA, unitA2, unitB, leaseA, leaseB, staffSub: ids.s, landlordSub: ids.l, tenant, tenantSub: ids.t }
}

async function advertise(c: pg.Client, unit: string) {
  await c.query(
    `UPDATE units SET status_config_key = 'OCCUPIED', listing_type = 'RENT',
            advertise_while_occupied = true, available_from = DATE '2027-02-01'
      WHERE id = $1::uuid`,
    [unit],
  )
}

/** A slot on unitA identified by an entity_id_map frontend id. */
async function slot(c: pg.Client, f: Fixture, fe: string, dateSql: string, time: string): Promise<string> {
  const id = (await c.query<{ id: string }>(
    `INSERT INTO viewing_slots (client_id, unit_id, slot_date, slot_time) VALUES ($1::uuid, $2::uuid, ${dateSql}, $3)
     RETURNING id::text AS id`,
    [f.clientA, f.unitA, time],
  )).rows[0].id
  await c.query(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('viewing_slot', $1, $2::uuid)`, [fe, id])
  return id
}

/** A slot whose SAST wall-clock date/time is now() + `ahead` (minute precision, rounded up). */
async function insertSlotAt(c: pg.Client, f: Fixture, fe: string, ahead: string): Promise<string> {
  const at = (await c.query<{ d: string; t: string }>(
    `SELECT to_char(x, 'YYYY-MM-DD') AS d, to_char(x, 'HH24:MI') AS t
       FROM (SELECT date_trunc('minute', (now() + $1::interval + interval '1 minute') AT TIME ZONE 'Africa/Johannesburg') AS x) s`,
    [ahead],
  )).rows[0]
  return slot(c, f, fe, `DATE '${at.d}'`, at.t)
}

/** Open the sitting tenant's window for the whole day of each slot (lease A). */
async function openWindows(c: pg.Client, f: Fixture, slotIds: string[]) {
  for (const id of slotIds) {
    await c.query(
      `INSERT INTO tenant_viewing_windows (client_id, unit_id, lease_id, window_date, start_time, end_time)
       SELECT $1::uuid, $2::uuid, $3::uuid, slot_date, '00:00', '24:00' FROM viewing_slots WHERE id = $4::uuid
       ON CONFLICT DO NOTHING`,
      [f.clientA, f.unitA, f.leaseA, id],
    )
  }
}

function book(c: pg.Client, fe: string, email: string) {
  return attempt(
    c,
    `SELECT submit_public_listing_enquiry('PR-RPC-SLOT', 'viewing', 'Sam', 'Viewer', $1, NULL, NULL, $2)`,
    [email, fe],
  )
}

describe.skipIf(!url)('027 on a live database', () => {
  it('an occupied advert is public with available_from, limit snapshot, and no tenant PII', async () => {
    await withTx(async (c) => {
      const f = await fixture(c)
      await advertise(c, f.unitA)
      await as(c, 'anon')
      for (const [fn, payload] of await payloads(c)) {
        const unit = payload.units.find((u) => u.id === f.unitA)
        expect(unit, fn).toBeDefined()
        expect(unit!.available_from).toBe('2027-02-01')
        expect(unit).toHaveProperty('fully_booked')
        const keys = Object.keys(unit!)
        for (const bad of PUBLIC_UNIT_FORBIDDEN_KEYS) expect(keys.includes(bad), `${fn} unit ${bad}`).toBe(false)
        const text = JSON.stringify(payload)
        expect(text.includes('lease_reference'), fn).toBe(false)
        expect(text.includes('notice_given_by'), fn).toBe(false)
      }
    })
  })

  it('outputs exactly the allowed keys per object (all four RPC variants, as anon)', async () => {
    await withTx(async (c) => {
      const f = await fixture(c)
      await advertise(c, f.unitA)
      const slot = (await c.query<{ id: string }>(
        `INSERT INTO viewing_slots (client_id, unit_id, slot_date, slot_time, title, notes)
         VALUES ($1::uuid, $2::uuid, CURRENT_DATE + 10, '10:00', 'Open day', 'internal note')
         RETURNING id::text AS id`,
        [f.clientA, f.unitA],
      )).rows[0].id
      expect(slot).toBeTruthy()
      await as(c, 'anon')
      for (const [fn, payload] of await payloads(c)) {
        // The lite RPC has never sent rooms (same as 024).
        const top = ['buildings', 'clients', 'entity_id_map', 'rooms', 'units', 'users', 'viewing_slots']
        expect(Object.keys(payload).sort(), fn).toEqual(fn.includes('_lite') ? top.filter((k) => k !== 'rooms') : top)
        expect(payload.users, fn).toEqual([])
        expect(payload.clients.length, fn).toBeGreaterThan(0)
        for (const o of payload.clients) expect(Object.keys(o).sort(), `${fn} client`).toEqual(ALLOWED_KEYS.clients)
        for (const o of payload.buildings) expect(Object.keys(o).sort(), `${fn} building`).toEqual(ALLOWED_KEYS.buildings)
        for (const o of payload.units) {
          expect(Object.keys(o).sort(), `${fn} unit`).toEqual([...ALLOWED_KEYS.units, ...SNAPSHOT_KEYS].sort())
        }
        for (const o of payload.rooms ?? []) expect(Object.keys(o).sort(), `${fn} room`).toEqual(ALLOWED_KEYS.rooms)
        expect(payload.viewing_slots.some((s) => s.id === slot), fn).toBe(true)
        for (const o of payload.viewing_slots) {
          expect(Object.keys(o).sort(), `${fn} slot`).toEqual(ALLOWED_KEYS.viewing_slots)
        }
        for (const o of payload.entity_id_map) {
          expect(Object.keys(o).sort(), `${fn} map`).toEqual(ALLOWED_KEYS.entity_id_map)
          expect(o.entity_type === 'user', `${fn} map user row`).toBe(false)
        }
      }
    })
  })

  it("Jim's 10 post-checks", async () => {
    await withTx(async (c) => {
      const expected = (await c.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM units u
           JOIN buildings b ON b.id = u.building_id
           LEFT JOIN users ll ON ll.id = b.landlord_id
          WHERE ((u.status_config_key IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE')
                  AND lower(coalesce(u.listing_type, 'rent')) <> 'not_listed')
              OR (u.advertise_while_occupied = true AND u.available_from IS NOT NULL
                  AND upper(u.status_config_key) = 'OCCUPIED'
                  AND lower(coalesce(u.listing_type, 'rent')) IN ('rent', 'both')))
            AND coalesce(ll.metadata->'verification'->>'status', 'approved') NOT IN ('pending', 'rejected')`,
      )).rows[0].n
      await as(c, 'anon')
      for (const [fn, payload] of await payloads(c)) {
        const text = JSON.stringify(payload)
        const has = (re: RegExp) => re.test(text)
        expect(has(/password_hash/), `1 ${fn}`).toBe(false)
        expect(has(/auth_user_id/), `2 ${fn}`).toBe(false)
        expect(has(/"email"|@[a-z0-9-]+\.[a-z]/i), `3 ${fn}`).toBe(false)
        expect(has(/"phone"/), `4 ${fn}`).toBe(false)
        expect(has(/encrypted_password|"metadata"|"settings"|"notes"|id_number/), `5 ${fn}`).toBe(false)
        expect(has(/\$2[aby]\$/), `6 ${fn}`).toBe(false)
        expect(payload.users, `7 ${fn}`).toEqual([])
        for (const o of payload.clients) expect(Object.keys(o).sort(), `8 ${fn}`).toEqual(ALLOWED_KEYS.clients)
        expect(payload.units.length, `9 ${fn}`).toBe(Math.min(expected, 60))
        for (const u of payload.units) expect('fully_booked' in u, `9 ${fn}`).toBe(true)
      }
      await c.query('RESET ROLE')
      const defs = await c.query<{ name: string; args: string; secdef: boolean; config: string[] | null; src: string }>(
        `SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args,
                p.prosecdef AS secdef, p.proconfig AS config, p.prosrc AS src
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname IN ('get_public_marketplace_bootstrap', 'get_public_marketplace_bootstrap_lite', 'public_listing_unit_json')`,
      )
      const byName = new Map(defs.rows.map((r) => [r.name, r]))
      expect(defs.rows).toHaveLength(3)
      for (const fn of RPCS) {
        const d = byName.get(fn)!
        expect(d.args, `10 ${fn}`).toBe('p_lite boolean')
        expect(d.secdef, `10 ${fn}`).toBe(true)
        expect(d.config, `10 ${fn}`).toEqual(['search_path=public'])
        expect(/password_hash|\$2[aby]\$/.test(d.src), `6 ${fn} source`).toBe(false)
      }
      const unitFn = byName.get('public_listing_unit_json')!
      expect(unitFn.args).toBe('p_unit_id uuid')
      expect(unitFn.secdef).toBe(false)
      expect(unitFn.config).toEqual(['search_path=public'])
    })
  })

  it('anon and authenticated cannot EXECUTE public_listing_unit_json; both can run the RPCs', async () => {
    await withTx(async (c) => {
      const privs = await c.query<{ role: string; unit_fn: boolean; full: boolean; lite: boolean; public_unit: boolean }>(
        `SELECT r AS role,
                has_function_privilege(r, 'public_listing_unit_json(uuid)', 'EXECUTE') AS unit_fn,
                has_function_privilege(r, 'get_public_marketplace_bootstrap(boolean)', 'EXECUTE') AS full,
                has_function_privilege(r, 'get_public_marketplace_bootstrap_lite(boolean)', 'EXECUTE') AS lite,
                EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                         WHERE p.proname = 'public_listing_unit_json' AND a.grantee = 0) AS public_unit
           FROM unnest(ARRAY['anon', 'authenticated']) AS r`,
      )
      for (const p of privs.rows) {
        expect(p.unit_fn, p.role).toBe(false)
        expect(p.public_unit, 'PUBLIC').toBe(false)
        expect(p.full, p.role).toBe(true)
        expect(p.lite, p.role).toBe(true)
      }
      const unit = (await c.query<{ id: string }>(`SELECT id::text AS id FROM units LIMIT 1`)).rows[0].id
      await as(c, 'anon')
      expect(await attempt(c, `SELECT public_listing_unit_json($1::uuid)`, [unit])).toBe('42501')
    })
  })

  it('enquiry RPC: occupied + advertised accepted; not advertised or unlisted rejected', async () => {
    await withTx(async (c) => {
      const f = await fixture(c)
      await advertise(c, f.unitA)
      await c.query(
        `INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('property', 'PR-RPC-TEST', $1::uuid)`,
        [f.unitA],
      )
      const enquire = (email: string) =>
        c.query<{ r: Record<string, unknown> }>(
          `SELECT submit_public_listing_enquiry('PR-RPC-TEST', 'lead', 'Naledi', 'Dlamini', $1) AS r`,
          [email],
        )
      await as(c, 'anon')
      const ok = (await enquire('one.rpc-test@example.invalid')).rows[0].r
      expect(Object.keys(ok).sort()).toEqual(['available_from', 'booking_id', 'lead_id', 'ok', 'stage'])
      expect(ok.available_from).toBe('2027-02-01')
      expect(ok.ok).toBe(true)
      expect(ok.stage).toBe('New Lead')
      await c.query('RESET ROLE')
      const note = (await c.query<{ notes: string }>(`SELECT notes FROM leads WHERE id = $1::uuid`, [ok.lead_id])).rows[0].notes
      expect(note.split('\n')[0]).toBe('Interested, available from 1 Feb 2027')

      await c.query(`UPDATE units SET advertise_while_occupied = false WHERE id = $1::uuid`, [f.unitA])
      await as(c, 'anon')
      expect(
        await attempt(c, `SELECT submit_public_listing_enquiry('PR-RPC-TEST', 'lead', 'A', 'B', 'two.rpc-test@example.invalid')`),
      ).toBe('property_not_public')

      await c.query('RESET ROLE')
      await c.query(`UPDATE units SET advertise_while_occupied = true, listing_type = 'NOT_LISTED' WHERE id = $1::uuid`, [f.unitA])
      await as(c, 'anon')
      expect(
        await attempt(c, `SELECT submit_public_listing_enquiry('PR-RPC-TEST', 'lead', 'A', 'B', 'three.rpc-test@example.invalid')`),
      ).toBe('property_not_public')
    })
  })

  it('enquiry RPC on an occupied advert keeps the notice floor and tenant windows', async () => {
    await withTx(async (c) => {
      const f = await fixture(c)
      await advertise(c, f.unitA)
      await c.query(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('property', 'PR-RPC-SLOT', $1::uuid)`, [f.unitA])
      const soonId = await insertSlotAt(c, f, 'VS-RPC-SOON', '2 hours')
      const laterId = await slot(c, f, 'VS-RPC-LATER', "(now() AT TIME ZONE 'Africa/Johannesburg')::date + 10", '10:00')
      expect(soonId).toBeTruthy()
      await as(c, 'anon')
      expect(await book(c, 'VS-RPC-SOON', 'soon.rpc-test@example.invalid')).toBe('notice_too_short')
      expect(await book(c, 'VS-RPC-LATER', 'later.rpc-test@example.invalid')).toBe('outside_viewing_window')
      await c.query('RESET ROLE')
      await c.query(
        `INSERT INTO tenant_viewing_windows (client_id, unit_id, lease_id, weekday, start_time, end_time)
         VALUES ($1::uuid, $2::uuid, $3::uuid,
                 extract(dow FROM (now() AT TIME ZONE 'Africa/Johannesburg')::date + 10)::int, '09:00', '12:00')`,
        [f.clientA, f.unitA, f.leaseA],
      )
      await as(c, 'anon')
      expect(await book(c, 'VS-RPC-LATER', 'inside.rpc-test@example.invalid')).toBeNull()
      await c.query('RESET ROLE')
      const booking = (await c.query<{ consent: string; notified: boolean }>(
        `SELECT tenant_consent_status AS consent, tenant_notified_at IS NOT NULL AS notified
           FROM bookings WHERE slot_id = $1::uuid`,
        [laterId],
      )).rows
      expect(booking).toEqual([{ consent: 'PENDING', notified: true }])
      const tenantNote = await c.query(`SELECT 1 FROM notifications WHERE user_id = $1::uuid AND title = 'Viewing requested'`, [f.tenant])
      expect(tenantNote.rowCount).toBe(1)
    })
  })

  it('24h notice boundary on the SAST clock: 23h59 refused, 24h01 allowed (session TimeZone UTC, like Supabase)', async () => {
    await withTx(async (c) => {
      await c.query(`SET LOCAL TimeZone = 'UTC'`)
      const f = await fixture(c)
      await advertise(c, f.unitA)
      await c.query(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('property', 'PR-RPC-SLOT', $1::uuid)`, [f.unitA])
      // insertSlotAt rounds up to the next minute: '23 hours 58 minutes' lands at most 23h59 ahead.
      const nearId = await insertSlotAt(c, f, 'VS-RPC-23H59', '23 hours 58 minutes')
      const farId = await insertSlotAt(c, f, 'VS-RPC-24H01', '24 hours 1 minute')
      await openWindows(c, f, [nearId, farId])
      await as(c, 'anon')
      expect(await book(c, 'VS-RPC-23H59', 'near.rpc-test@example.invalid')).toBe('notice_too_short')
      expect(await book(c, 'VS-RPC-24H01', 'far.rpc-test@example.invalid')).toBeNull()
      await c.query('RESET ROLE')
      // Stored as the slot wall time labelled Z (Jim F1: rpc.test asserts to_char(... AT TIME ZONE 'UTC') = slot_time).
      const stored = (await c.query<{ same: boolean }>(
        `SELECT to_char(b.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') = vs.slot_date::text || ' ' || left(vs.slot_time::text, 5) AS same
           FROM bookings b JOIN viewing_slots vs ON vs.id = b.slot_id WHERE b.slot_id = $1::uuid`,
        [farId],
      )).rows
      expect(stored).toEqual([{ same: true }])
    })
  })

  for (const tz of ['UTC', 'Africa/Johannesburg']) {
    it(`a guest booking reads back with the slot date and time (10:00, 00:45, 14:00) and matches a staff save (TimeZone ${tz})`, async () => {
      await withTx(async (c) => {
        await c.query(`SELECT set_config('TimeZone', $1, true)`, [tz])
        const f = await fixture(c)
        await advertise(c, f.unitA)
        await c.query(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('property', 'PR-RPC-SLOT', $1::uuid)`, [f.unitA])
        const times = ['10:00', '00:45', '14:00']
        const ids: string[] = []
        for (const t of times) {
          ids.push(await slot(c, f, `VS-RPC-RB-${t}`, "(now() AT TIME ZONE 'Africa/Johannesburg')::date + 10", t))
        }
        await openWindows(c, f, ids)
        await as(c, 'anon')
        for (const t of times) {
          expect(await book(c, `VS-RPC-RB-${t}`, `rb${t.replace(':', '')}.rpc-test@example.invalid`), t).toBeNull()
        }
        await c.query('RESET ROLE')
        for (const [i, t] of times.entries()) {
          const row = (await c.query<{ starts_at: Date; slot_date: string; slot_time: string }>(
            `SELECT b.starts_at, vs.slot_date::text AS slot_date, left(vs.slot_time::text, 5) AS slot_time
               FROM bookings b JOIN viewing_slots vs ON vs.id = b.slot_id WHERE b.slot_id = $1::uuid`,
            [ids[i]],
          )).rows[0]
          expect(row.slot_time).toBe(t)
          // The bootstrap viewings mapping (server/bootstrap.ts) shows the slot's own date and time.
          expect(bookingWallClock(row.starts_at), t).toEqual({ date: row.slot_date, time: t })
          // A staff save of the same slot (writes.ts upsertViewing) stores the identical value.
          expect(row.starts_at.toISOString(), t).toBe(slotStoredStart(row.slot_date, t).toISOString())
        }
      })
    })
  }

  it('tvw_mutate: staff cannot write a window on another agency lease or another unit', async () => {
    await withTx(async (c) => {
      const f = await fixture(c)
      const insert = (unit: string, lease: string) =>
        attempt(
          c,
          `INSERT INTO tenant_viewing_windows (client_id, unit_id, lease_id, weekday, start_time, end_time)
           VALUES ($1::uuid, $2::uuid, $3::uuid, 2, '09:00', '11:00')`,
          [f.clientA, unit, lease],
        )
      await as(c, 'authenticated', f.staffSub)
      expect(await insert(f.unitA, f.leaseB), 'cross-agency lease').toBe('42501')
      expect(await insert(f.unitA2, f.leaseA), 'lease of another unit').toBe('42501')
      expect(await insert(f.unitA, f.leaseA), 'own lease, same unit').toBeNull()
      expect(
        await attempt(
          c,
          `UPDATE tenant_viewing_windows SET lease_id = $1::uuid WHERE unit_id = $2::uuid`,
          [f.leaseB, f.unitA],
        ),
        'repoint to cross-agency lease',
      ).toBe('42501')
    })
  })

  it('viewing_waitlist: own-agency staff read it, a landlord reads nothing', async () => {
    await withTx(async (c) => {
      const f = await fixture(c)
      await c.query(
        `INSERT INTO viewing_waitlist (client_id, unit_id, name, email) VALUES ($1::uuid, $2::uuid, 'Wait Lister', 'wait.rpc-test@example.invalid')`,
        [f.clientA, f.unitA],
      )
      await as(c, 'authenticated', f.staffSub)
      expect((await c.query(`SELECT 1 FROM viewing_waitlist WHERE unit_id = $1::uuid`, [f.unitA])).rowCount).toBe(1)
      await as(c, 'authenticated', f.landlordSub)
      expect((await c.query(`SELECT 1 FROM viewing_waitlist`)).rowCount).toBe(0)
      expect(
        await attempt(
          c,
          `INSERT INTO viewing_waitlist (client_id, unit_id, name, email) VALUES ($1::uuid, $2::uuid, 'X', 'x.rpc-test@example.invalid')`,
          [f.clientA, f.unitA],
        ),
      ).toBe('42501')
    })
  })

  it('step-3 bar (Michael final): tvw and viewing_waitlist have no cross-agency read for any role, no applicant contact for landlords', async () => {
    await withTx(async (c) => {
      const f = await fixture(c)
      // Own landlord inside agency A (Oscar: landlord branch requires the agency).
      await c.query(`UPDATE users SET client_id = $1::uuid WHERE id = $2::uuid`, [f.clientA, f.landlord])
      const subs = (await c.query<{ a: string; b: string; d: string; e: string }>(
        `SELECT gen_random_uuid()::text AS a, gen_random_uuid()::text AS b, gen_random_uuid()::text AS d, gen_random_uuid()::text AS e`,
      )).rows[0]
      await c.query(`INSERT INTO auth.users (id) SELECT unnest($1::uuid[])`, [[subs.a, subs.b, subs.d, subs.e]])
      const user = (client: string, role: string, sub: string, tag: string) =>
        c.query(
          `INSERT INTO users (client_id, email, first_name, last_name, role, auth_user_id)
           VALUES ($1::uuid, $2, 'Probe', 'User', $3, $4::uuid)`,
          [client, `${tag}.rpc-test@example.invalid`, role, sub],
        )
      await user(f.clientB, 'AGENCY_ADMIN', subs.a, 'staff-b') // other-agency staff
      await user(f.clientA, 'CONTRACTOR', subs.b, 'contractor-a') // same-agency contractor
      await user(f.clientA, 'END_USER', subs.d, 'other-tenant-a') // tenant of no lease
      await user(f.clientB, 'LANDLORD', subs.e, 'landlord-b') // landlord of another agency
      // A second building in agency B also names our landlord: must not open B's rows to them.
      await c.query(
        `UPDATE buildings SET landlord_id = $1::uuid WHERE id = (SELECT building_id FROM units WHERE id = $2::uuid)`,
        [f.landlord, f.unitB],
      )
      // Lease B (agency B) is also our tenant's.
      await c.query(`UPDATE leases SET tenant_id = $1::uuid WHERE id = $2::uuid`, [f.tenant, f.leaseB])
      const lease2 = f.leaseB
      await c.query(
        `INSERT INTO tenant_viewing_windows (client_id, unit_id, lease_id, weekday, start_time, end_time)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 2, '09:00', '11:00'), ($4::uuid, $5::uuid, $6::uuid, 3, '09:00', '11:00')`,
        [f.clientA, f.unitA, f.leaseA, f.clientB, f.unitB, lease2],
      )
      await c.query(
        `INSERT INTO viewing_waitlist (client_id, unit_id, name, email, phone)
         VALUES ($1::uuid, $2::uuid, 'Wait A', 'wait-a.rpc-test@example.invalid', '0820000001'),
                ($3::uuid, $4::uuid, 'Wait B', 'wait-b.rpc-test@example.invalid', '0820000002')`,
        [f.clientA, f.unitA, f.clientB, f.unitB],
      )
      const seen = async (sub: string) => {
        await as(c, 'authenticated', sub)
        const tvw = (await c.query<{ client_id: string }>(`SELECT client_id::text AS client_id FROM tenant_viewing_windows`)).rows.map((r) => r.client_id === f.clientA ? 'A' : 'B').sort()
        const vw = (await c.query<{ client_id: string }>(`SELECT client_id::text AS client_id FROM viewing_waitlist`)).rows.map((r) => r.client_id === f.clientA ? 'A' : 'B').sort()
        await c.query('RESET ROLE')
        return { tvw, vw }
      }
      expect(await seen(f.staffSub), 'own-agency staff').toEqual({ tvw: ['A'], vw: ['A'] })
      expect(await seen(subs.a), 'other-agency staff').toEqual({ tvw: ['B'], vw: ['B'] })
      expect(await seen(subs.b), 'contractor').toEqual({ tvw: [], vw: [] })
      expect(await seen(subs.d), 'END_USER without a lease').toEqual({ tvw: [], vw: [] })
      // The tenant reads their own lease windows only; the B2 row is theirs but in agency B and is still readable
      // because row, lease, unit and agency agree (own data, not another agency\'s); no waitlist (contacts) at all.
      expect(await seen(f.tenantSub), 'tenant').toEqual({ tvw: ['A', 'B'], vw: [] })
      expect(await seen(f.landlordSub), 'own landlord (agency A only, no applicant contacts)').toEqual({ tvw: ['A'], vw: [] })
      expect(await seen(subs.e), 'landlord of another agency').toEqual({ tvw: [], vw: [] })
    })
  })

  it("Jim's nit: a landlord with documents, email, phone, notes and settings leaks nothing to anon", async () => {
    await withTx(async (c) => {
      const f = await fixture(c)
      await advertise(c, f.unitA)
      await as(c, 'anon')
      for (const [fn, payload] of await payloads(c)) {
        expect(payload.units.some((u) => u.id === f.unitA), `${fn} unit public`).toBe(true)
        expect(payload.users, `${fn} users`).toEqual([])
        const text = JSON.stringify(payload)
        // Key names and the seeded values: boolean checks only, nothing is printed.
        for (const word of ['password_hash', 'auth_user_id', 'email', 'phone', 'metadata', 'documents', 'dataUrl', 'notes']) {
          expect(text.includes(word), `${fn} mentions ${word}`).toBe(false)
        }
        for (const [k, v] of Object.entries(SENTINEL)) expect(text.includes(v), `${fn} sentinel ${k}`).toBe(false)
        expect(text.includes(f.landlord), `${fn} landlord id`).toBe(false)
        expect(text.includes(f.staff), `${fn} agent id`).toBe(false)
        expect(text.includes('verification'), `${fn} verification`).toBe(false)
      }
    })
  })

  it('listed_by allowlist (Angela r4, Jim v3): every probe is NULL or kept as listed', async () => {
    await withTx(async (c) => {
      const name = async (v: string) =>
        (await c.query<{ n: string | null }>(`SELECT public_listing_display_name($1) AS n`, [v])).rows[0].n
      for (const [label, v] of Object.entries(PROBES.reject)) expect(await name(v), label).toBeNull()
      for (const [label, v] of Object.entries(PROBES.accept)) expect(await name(v), label).toBe(v)
      const unicode = (await c.query<{ ok: boolean }>(`SELECT 'ë' ~ '^[[:alpha:]]$' AS ok`)).rows[0].ok
      for (const [label, v] of Object.entries(PROBES.unicode_accept)) {
        // Unicode-letter ctype (kivrl: ICU en_US) keeps them; a C ctype fails closed (NULL).
        expect(await name(v), label).toBe(unicode ? v : null)
      }
      // Not callable from the API roles.
      await as(c, 'anon')
      expect(await attempt(c, `SELECT public_listing_display_name('x')`)).toBe('42501')
      await as(c, 'authenticated')
      expect(await attempt(c, `SELECT public_listing_display_name('x')`)).toBe('42501')
    })
  })

  it('listed_by: a runtime rename by the agent into a contact string is NULL to anon at once', async () => {
    await withTx(async (c) => {
      const f = await fixture(c)
      await advertise(c, f.unitA)
      const rejects = Object.entries(PROBES.reject)
      for (const [label, v] of rejects) {
        await c.query('RESET ROLE')
        await c.query(`UPDATE users SET first_name = $1, last_name = '' WHERE id = $2::uuid`, [v, f.staff])
        await as(c, 'anon')
        for (const [fn, payload] of await payloads(c)) {
          expect(payload.units.find((u) => u.id === f.unitA)!.listed_by === null, `${fn} ${label}`).toBe(true)
        }
      }
      // Split across first and last name too.
      await c.query('RESET ROLE')
      await c.query(`UPDATE users SET first_name = 'anya', last_name = 'at x dot com' WHERE id = $1::uuid`, [f.staff])
      await as(c, 'anon')
      expect((await payloads(c)).every(([, p]) => p.units.find((u) => u.id === f.unitA)!.listed_by === null)).toBe(true)
      // And back to a plain name: shown again.
      await c.query('RESET ROLE')
      await c.query(`UPDATE users SET first_name = 'Staff', last_name = 'Agent' WHERE id = $1::uuid`, [f.staff])
      await as(c, 'anon')
      expect((await payloads(c)).every(([, p]) => p.units.find((u) => u.id === f.unitA)!.listed_by === 'Staff Agent')).toBe(true)
    })
  })

  it('listed_by is the agent display name only (Michael b)', async () => {
    await withTx(async (c) => {
      const f = await fixture(c)
      await advertise(c, f.unitA)
      await as(c, 'anon')
      for (const [fn, payload] of await payloads(c)) {
        const unit = payload.units.find((u) => u.id === f.unitA)!
        expect(unit.listed_by, fn).toBe('Staff Agent')
        expect('agent_id' in unit, fn).toBe(false)
        for (const u of payload.units) {
          expect(u.listed_by === null || typeof u.listed_by === 'string', fn).toBe(true)
          expect(String(u.listed_by ?? '').includes('@'), fn).toBe(false)
        }
      }
      await c.query('RESET ROLE')
      await c.query(`UPDATE units SET agent_id = NULL WHERE id = $1::uuid`, [f.unitA])
      await as(c, 'anon')
      const [, payload] = (await payloads(c))[0]
      expect(payload.units.find((u) => u.id === f.unitA)!.listed_by).toBeNull()
    })
  })

  it('024 DEFINER helpers: anon cannot run either; authenticated keeps only the snapshot (Michael c)', async () => {
    await withTx(async (c) => {
      const gate = 'listing_capacity_gate(uuid, text, boolean, text, text, text)'
      const snap = 'unit_listing_limit_snapshot(uuid)'
      const privs = await c.query<{ role: string; gate: boolean; snap: boolean; agent_name: boolean; landlord_ok: boolean }>(
        `SELECT r AS role,
                has_function_privilege(r, '${gate}', 'EXECUTE') AS gate,
                has_function_privilege(r, '${snap}', 'EXECUTE') AS snap,
                has_function_privilege(r, 'public_listing_agent_name(uuid)', 'EXECUTE') AS agent_name,
                has_function_privilege(r, 'public_listing_landlord_ok(uuid)', 'EXECUTE') AS landlord_ok
           FROM unnest(ARRAY['anon', 'authenticated']) AS r ORDER BY r`,
      )
      expect(privs.rows).toEqual([
        { role: 'anon', gate: false, snap: false, agent_name: false, landlord_ok: false },
        { role: 'authenticated', gate: false, snap: true, agent_name: false, landlord_ok: false },
      ])
      const publicGrants = await c.query(
        `SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
          WHERE p.proname IN ('listing_capacity_gate', 'unit_listing_limit_snapshot', 'public_listing_agent_name')
            AND a.grantee = 0`,
      )
      expect(publicGrants.rowCount, 'PUBLIC EXECUTE').toBe(0)
      const f = await fixture(c)
      await as(c, 'anon')
      expect(await attempt(c, `SELECT unit_listing_limit_snapshot($1::uuid)`, [f.unitA])).toBe('42501')
      expect(
        await attempt(c, `SELECT listing_capacity_gate($1::uuid, 'lead', false, 'A', 'a.rpc-test@example.invalid', NULL)`, [f.unitA]),
      ).toBe('42501')
      expect(await attempt(c, `SELECT public_listing_agent_name($1::uuid)`, [f.staff])).toBe('42501')
      await as(c, 'authenticated', f.staffSub)
      expect(await attempt(c, `SELECT unit_listing_limit_snapshot($1::uuid)`, [f.unitA])).toBeNull()
      expect(
        await attempt(c, `SELECT listing_capacity_gate($1::uuid, 'lead', false, 'A', 'a.rpc-test@example.invalid', NULL)`, [f.unitA]),
      ).toBe('42501')
      // The anon RPCs still work (they call both helpers as owner).
      await as(c, 'anon')
      expect(await attempt(c, `SELECT get_public_marketplace_bootstrap(true)`)).toBeNull()
    })
  })
  it('snapshot guard (Michael ruling 1, Jim P1/P2, Oscar): only staff, the own landlord, SA, public units or the server pool see counts', async () => {
    await withTx(async (c) => {
      const f = await fixture(c)
      const auth = (await c.query<{ sa: string; l2: string; co: string; np: string; missing: string }>(
        `SELECT gen_random_uuid()::text AS sa, gen_random_uuid()::text AS l2, gen_random_uuid()::text AS co,
                gen_random_uuid()::text AS np, gen_random_uuid()::text AS missing`,
      )).rows[0]
      // np: a sign-up with an auth user and no profile row.
      await c.query(`INSERT INTO auth.users (id) SELECT unnest($1::uuid[])`, [[auth.sa, auth.l2, auth.co, auth.np]])
      await c.query(
        `INSERT INTO users (client_id, email, first_name, last_name, role, auth_user_id)
         VALUES (NULL, 'sa.rpc-test@example.invalid', 'Super', 'Admin', 'SUPER_ADMIN', $1::uuid),
                ($2::uuid, 'landlord2.rpc-test@example.invalid', 'Other', 'Landlord', 'LANDLORD', $3::uuid),
                ($2::uuid, 'contractor.rpc-test@example.invalid', 'Con', 'Tractor', 'CONTRACTOR', $4::uuid)`,
        [auth.sa, f.clientA, auth.l2, auth.co],
      )
      // Oscar: the landlord belongs to agency A; units at another agency get nothing.
      await c.query(`UPDATE users SET client_id = $1::uuid WHERE id = $2::uuid`, [f.clientA, f.landlord])
      // unitA (landlord's building, agency A) and unitB (agency B, also the landlord's building) are drafts.
      await c.query(`UPDATE units SET status_config_key = 'DRAFT' WHERE id = ANY($1::uuid[])`, [[f.unitA, f.unitB]])
      await c.query(
        `UPDATE buildings SET landlord_id = $1::uuid WHERE id = (SELECT building_id FROM units WHERE id = $2::uuid)`,
        [f.landlord, f.unitB],
      )
      const snap = async (unit: string) =>
        (await c.query<{ s: Record<string, unknown> | null }>(`SELECT unit_listing_limit_snapshot($1::uuid) AS s`, [unit])).rows[0].s
      const keys = (v: Record<string, unknown> | null) => (v === null ? null : Object.keys(v).sort())

      // Server API pool (no anon / authenticated role): data; a missing unit is {} (never NULL).
      await c.query('RESET ROLE')
      expect(keys(await snap(f.unitB))).toEqual(SNAPSHOT_KEYS)
      expect(await snap(auth.missing)).toEqual({})

      // No unit-exists oracle and no data for END_USER, CONTRACTOR or a no-profile sign-up:
      // an existing non-public unit (own agency or another) and a missing unit all give {}.
      for (const sub of [f.tenantSub, auth.co, auth.np]) {
        await as(c, 'authenticated', sub)
        for (const unit of [f.unitA, f.unitB, auth.missing]) expect(await snap(unit)).toEqual({})
      }

      // A tenant (END_USER, agency A) on another agency's draft, and on its own agency's draft: {} (never NULL).
      await as(c, 'authenticated', f.tenantSub)
      expect(await snap(f.unitB)).toEqual({})
      expect(await snap(f.unitA)).toEqual({})
      // Cross-agency staff: {}. Own-agency staff: data, counts and limits only.
      await as(c, 'authenticated', f.staffSub)
      expect(await snap(f.unitB)).toEqual({})
      expect(await snap(auth.missing)).toEqual({})
      const own = await snap(f.unitA)
      expect(keys(own)).toEqual(SNAPSHOT_KEYS)
      expect(SNAPSHOT_KEYS.filter((k) => /name|email|phone|contact|address|id_number|notes/i.test(k))).toEqual([])
      // Super admin: data on any unit.
      await as(c, 'authenticated', auth.sa)
      expect(keys(await snap(f.unitB))).toEqual(SNAPSHOT_KEYS)
      expect(await snap(auth.missing)).toEqual({})
      // The unit's own landlord (agency A): data, read-only. Same landlord, agency B unit: {}.
      await as(c, 'authenticated', f.landlordSub)
      expect(keys(await snap(f.unitA))).toEqual(SNAPSHOT_KEYS)
      expect(await snap(f.unitB)).toEqual({})
      // A different landlord in the same agency: {}.
      await as(c, 'authenticated', auth.l2)
      expect(await snap(f.unitA)).toEqual({})
      // A public unit: data for any signed-in caller (the marketplace already shows it).
      await c.query('RESET ROLE')
      await c.query(`UPDATE units SET status_config_key = 'AVAILABLE', listing_type = 'RENT' WHERE id = $1::uuid`, [f.unitA2])
      await as(c, 'authenticated', auth.l2)
      expect(keys(await snap(f.unitA2))).toEqual(SNAPSHOT_KEYS)
      // anon cannot call it at all.
      await as(c, 'anon')
      expect(await attempt(c, `SELECT unit_listing_limit_snapshot($1::uuid)`, [f.unitA])).toBe('42501')
      // Bootstrap as anon: public units keep their snapshot; the drafts are not in the payload at all.
      for (const [fn, payload] of await payloads(c)) {
        const pub = payload.units.find((u) => u.id === f.unitA2)
        expect(pub, fn).toBeDefined()
        expect(sorted(Object.keys(pub!)).filter((k) => SNAPSHOT_KEYS.includes(k)), fn).toEqual(SNAPSHOT_KEYS)
        expect(payload.units.some((u) => u.id === f.unitA || u.id === f.unitB), fn).toBe(false)
      }
    })
  })

  it('snapshot guard S5 (Angela r5): a not_listed unit is never public, so a caller with no other branch gets {}', async () => {
    await withTx(async (c) => {
      const f = await fixture(c)
      const l2 = (await c.query<{ id: string }>(`SELECT gen_random_uuid()::text AS id`)).rows[0].id
      await c.query(`INSERT INTO auth.users (id) VALUES ($1::uuid)`, [l2])
      await c.query(
        `INSERT INTO users (client_id, email, first_name, last_name, role, auth_user_id)
         VALUES ($1::uuid, 'landlord-s5.rpc-test@example.invalid', 'Other', 'Landlord', 'LANDLORD', $2::uuid)`,
        [f.clientA, l2],
      )
      const snap = async (unit: string) =>
        (await c.query<{ s: Record<string, unknown> | null }>(`SELECT unit_listing_limit_snapshot($1::uuid) AS s`, [unit])).rows[0].s
      // Control: the same unit while it IS public gives data to these callers (so {} below is the not_listed rule).
      await c.query('RESET ROLE')
      await c.query(`UPDATE units SET status_config_key = 'AVAILABLE', listing_type = 'RENT', advertise_while_occupied = false WHERE id = $1::uuid`, [f.unitA2])
      for (const sub of [l2, f.tenantSub]) {
        await as(c, 'authenticated', sub)
        expect(Object.keys((await snap(f.unitA2)) ?? {}).sort(), 'public control').toEqual(SNAPSHOT_KEYS)
      }
      // A published status with listing_type NOT_LISTED (the only spelling units_listing_type_check allows; the guard
      // lower()s it): {} for a non-staff, non-owner caller.
      for (const lt of ['NOT_LISTED']) {
        for (const status of ['PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE']) {
          await c.query('RESET ROLE')
          await c.query(`UPDATE units SET status_config_key = $2, listing_type = $3 WHERE id = $1::uuid`, [f.unitA2, status, lt])
          for (const sub of [l2, f.tenantSub]) {
            await as(c, 'authenticated', sub)
            expect(await snap(f.unitA2), `${status}/${lt}`).toEqual({})
          }
        }
      }
      // An occupied advert that is not_listed is not public either.
      await c.query('RESET ROLE')
      await c.query(
        `UPDATE units SET status_config_key = 'OCCUPIED', listing_type = 'NOT_LISTED', advertise_while_occupied = true,
                available_from = DATE '2027-02-01' WHERE id = $1::uuid`,
        [f.unitA2],
      )
      await as(c, 'authenticated', l2)
      expect(await snap(f.unitA2)).toEqual({})
    })
  })

  it('snapshot own-landlord branch (Michael r5): stored building landlord_id AND the unit agency = the caller agency', async () => {
    await withTx(async (c) => {
      const f = await fixture(c)
      const ids = (await c.query<{ lb: string; co: string }>(`SELECT gen_random_uuid()::text AS lb, gen_random_uuid()::text AS co`)).rows[0]
      await c.query(`INSERT INTO auth.users (id) SELECT unnest($1::uuid[])`, [[ids.lb, ids.co]])
      // LB: a landlord of agency B. CO: a non-landlord (contractor) of agency A.
      const lb = (await c.query<{ id: string }>(
        `INSERT INTO users (client_id, email, first_name, last_name, role, auth_user_id)
         VALUES ($1::uuid, 'landlord-b.rpc-test@example.invalid', 'Bee', 'Landlord', 'LANDLORD', $2::uuid) RETURNING id::text AS id`,
        [f.clientB, ids.lb],
      )).rows[0].id
      await c.query(
        `INSERT INTO users (client_id, email, first_name, last_name, role, auth_user_id)
         VALUES ($1::uuid, 'contractor-r5.rpc-test@example.invalid', 'Con', 'Tractor', 'CONTRACTOR', $2::uuid)`,
        [f.clientA, ids.co],
      )
      await c.query(`UPDATE users SET client_id = $1::uuid WHERE id = $2::uuid`, [f.clientA, f.landlord])
      // Drafts, so the public branch never applies.
      await c.query(`UPDATE units SET status_config_key = 'DRAFT', advertise_while_occupied = false WHERE id = ANY($1::uuid[])`, [[f.unitA, f.unitB]])
      const setLandlord = async (unit: string, landlord: string) => {
        await c.query('RESET ROLE')
        await c.query(`UPDATE buildings SET landlord_id = $1::uuid WHERE id = (SELECT building_id FROM units WHERE id = $2::uuid)`, [landlord, unit])
      }
      const snap = async (unit: string) =>
        (await c.query<{ s: Record<string, unknown> | null }>(`SELECT unit_listing_limit_snapshot($1::uuid) AS s`, [unit])).rows[0].s
      const keys = (v: Record<string, unknown> | null) => (v === null ? null : Object.keys(v).sort())

      // Positive: the building's own landlord, same agency as the unit, gets the snapshot.
      await setLandlord(f.unitA, f.landlord)
      await as(c, 'authenticated', f.landlordSub)
      expect(keys(await snap(f.unitA)), 'own landlord, same agency').toEqual(SNAPSHOT_KEYS)
      // Negative 1: a landlord of another agency's building (LB owns unitB's building, agency B) asks for unitA: {}.
      await setLandlord(f.unitB, lb)
      await as(c, 'authenticated', ids.lb)
      expect(await snap(f.unitA), 'landlord of another agency building').toEqual({})
      // ...and LB on its own building in its own agency does get data (the rule is per building, not per role).
      expect(keys(await snap(f.unitB)), 'LB own building, own agency').toEqual(SNAPSHOT_KEYS)
      // Negative 2: mismatched client. The stored building landlord_id is the caller, but the unit is agency B
      // and the caller's stored client is agency A: {}.
      await setLandlord(f.unitB, f.landlord)
      await as(c, 'authenticated', f.landlordSub)
      expect(await snap(f.unitB), 'stored landlord, other agency unit').toEqual({})
      // Same, the other way round: LB's stored client moves to A while its building stays in B: {}.
      await setLandlord(f.unitB, lb)
      await c.query(`UPDATE users SET client_id = $1::uuid WHERE id = $2::uuid`, [f.clientA, lb])
      await as(c, 'authenticated', ids.lb)
      expect(await snap(f.unitB), 'landlord client moved away from the building agency').toEqual({})
      // Negative 3: non-landlords of the same agency (contractor, END_USER tenant): {}.
      for (const sub of [ids.co, f.tenantSub]) {
        await as(c, 'authenticated', sub)
        expect(await snap(f.unitA), 'non-landlord').toEqual({})
      }
      // A landlord whose building no longer lists them (landlord_id cleared): {}.
      await c.query('RESET ROLE')
      await c.query(`UPDATE buildings SET landlord_id = NULL WHERE id = (SELECT building_id FROM units WHERE id = $1::uuid)`, [f.unitA])
      await as(c, 'authenticated', f.landlordSub)
      expect(await snap(f.unitA), 'landlord_id cleared').toEqual({})
    })
  })

  it('T9 (Angela r5, occupiedListing.ts:594): tenant viewing requests are future-only on the SAST wall clock stored as Z', async () => {
    await withTx(async (c) => {
      const f = await fixture(c)
      // Wall-as-Z: the SAST wall clock now, labelled UTC (app convention), +/- 30 minutes and +/- 3 hours.
      const at = async (offset: string) =>
        (await c.query<{ t: string }>(
          `SELECT to_char(((now() AT TIME ZONE 'Africa/Johannesburg') + $1::interval), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS t`,
          [offset],
        )).rows[0].t
      const insert = async (startsAt: string, consent = 'PENDING', status = 'SCHEDULED') =>
        (await c.query<{ id: string }>(
          `INSERT INTO bookings (client_id, unit_id, visitor_name, starts_at, status, tenant_consent_status)
           VALUES ($1::uuid, $2::uuid, 'Visitor', $3::timestamptz, $4, $5) RETURNING id::text AS id`,
          [f.clientA, f.unitA, startsAt, status, consent],
        )).rows[0].id
      const past3h = await insert(await at('-3 hours'))
      const past30 = await insert(await at('-30 minutes'))
      // Between real UTC now and SAST wall now: a real instant in the future, but already past on the SAST clock.
      const past90 = await insert(await at('-90 minutes'))
      const next30 = await insert(await at('30 minutes'))
      const next3h = await insert(await at('3 hours'))
      await insert(await at('2 hours'), 'ACCEPTED')
      await insert(await at('2 hours'), 'PENDING', 'CANCELLED')
      const actor = { role: 'tenant', userId: 'U-rpc-tenant', agencyId: null } as DemoActor
      const deps: OccupiedDeps = {
        query: async (sql, params = []) => (await c.query(sql, params as unknown[])).rows,
        resolveUuid: async (type, id) => (type === 'tenancy' && id === 'L-rpc' ? f.leaseA : type === 'user' && id === actor.userId ? f.tenant : null),
        assertUnitManageable: async () => ({ clientId: f.clientA }),
        canPublish: async () => false,
        now: () => new Date(),
      }
      for (const tz of ['UTC', 'Africa/Johannesburg', 'America/New_York']) {
        await c.query(`SELECT set_config('TimeZone', $1, true)`, [tz])
        const rows = await listTenantViewingRequests(actor, 'L-rpc', deps)
        expect(rows.map((r) => r.id), tz).toEqual([next30, next3h])
        expect(rows.some((r) => [past3h, past30, past90].includes(r.id)), tz).toBe(false)
        for (const r of rows) expect(r.tenantConsentStatus).toBe('PENDING')
      }
      // startsAt is returned as stored (wall time labelled Z), not shifted by the session zone.
      const rows = await listTenantViewingRequests(actor, 'L-rpc', deps)
      const stored = (await c.query<{ t: string }>(
        `SELECT to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS t FROM bookings WHERE id = $1::uuid`,
        [next30],
      )).rows[0].t
      expect(rows[0].startsAt.slice(0, 19)).toBe(stored)
    })
  })

  it('promote_viewing_waitlist still sees the cap through the guarded snapshot (own-agency staff)', async () => {
    await withTx(async (c) => {
      const f = await fixture(c)
      await c.query(`UPDATE units SET status_config_key = 'DRAFT', listing_type = 'RENT', max_viewings = 1, limits_round_started_at = now() WHERE id = $1::uuid`, [f.unitA2])
      const wl = async (email: string) =>
        (await c.query<{ id: string }>(
          `INSERT INTO viewing_waitlist (client_id, unit_id, name, email) VALUES ($1::uuid, $2::uuid, 'Wait', $3) RETURNING id::text AS id`,
          [f.clientA, f.unitA2, email],
        )).rows[0].id
      const first = await wl('wl1.rpc-test@example.invalid')
      const second = await wl('wl2.rpc-test@example.invalid')
      // 024's promote logs actor_user_id = auth.uid() into event_log (FK users.id), so this
      // staff profile shares its id with its auth user. Pre-existing, outside 027; reported.
      const sub = (await c.query<{ id: string }>(`INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id::text AS id`)).rows[0].id
      await c.query(
        `INSERT INTO users (id, client_id, email, first_name, last_name, role, auth_user_id)
         VALUES ($1::uuid, $2::uuid, 'staff2.rpc-test@example.invalid', 'Staff', 'Two', 'AGENT_ADMIN', $1::uuid)`,
        [sub, f.clientA],
      )
      await as(c, 'authenticated', sub)
      const promote = async (id: string) =>
        (await c.query<{ r: Record<string, unknown> }>(`SELECT promote_viewing_waitlist($1::uuid) AS r`, [id])).rows[0].r
      expect(await promote(first)).toMatchObject({ ok: true })
      // The first promotion filled the single viewing: the snapshot reports viewings_full to promote.
      expect(await promote(second)).toEqual({ ok: false, code: 'LISTING_FULL', waitlist: true })
    })
  })
})
