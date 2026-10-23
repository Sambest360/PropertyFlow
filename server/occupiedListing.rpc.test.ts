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

const url = process.env.OCCUPIED_RPC_DATABASE_URL
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

type Fixture = { landlord: string; staff: string; clientA: string; clientB: string; unitA: string; unitA2: string; unitB: string; leaseA: string; leaseB: string; staffSub: string; landlordSub: string; tenant: string }

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
  return { landlord, staff, clientA, clientB, unitA, unitA2, unitB, leaseA, leaseB, staffSub: ids.s, landlordSub: ids.l, tenant }
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

  it('24h notice uses the real SAST instant across the 2h UTC boundary (session TimeZone UTC, like Supabase)', async () => {
    await withTx(async (c) => {
      await c.query(`SET LOCAL TimeZone = 'UTC'`)
      const f = await fixture(c)
      await advertise(c, f.unitA)
      await c.query(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('property', 'PR-RPC-SLOT', $1::uuid)`, [f.unitA])
      // SAST wall clock 23h ahead: really 23h away. The old ::timestamptz cast read it as
      // UTC (25h away) and let it through.
      const nearId = await insertSlotAt(c, f, 'VS-RPC-23H', '23 hours')
      // 25h ahead in SAST wall clock: clears the 24h floor.
      const farId = await insertSlotAt(c, f, 'VS-RPC-25H', '25 hours')
      for (const id of [nearId, farId]) {
        await c.query(
          `INSERT INTO tenant_viewing_windows (client_id, unit_id, lease_id, window_date, start_time, end_time)
           SELECT $1::uuid, $2::uuid, $3::uuid, slot_date, '00:00', '24:00' FROM viewing_slots WHERE id = $4::uuid
           ON CONFLICT DO NOTHING`,
          [f.clientA, f.unitA, f.leaseA, id],
        )
      }
      const naive = (await c.query<{ h: number }>(
        `SELECT extract(epoch FROM ((slot_date::text || 'T' || slot_time || ':00')::timestamptz - now())) / 3600 AS h
           FROM viewing_slots WHERE id = $1::uuid`,
        [nearId],
      )).rows[0].h
      expect(Number(naive)).toBeGreaterThan(24) // what the old code saw
      await as(c, 'anon')
      expect(await book(c, 'VS-RPC-23H', 'near.rpc-test@example.invalid')).toBe('notice_too_short')
      expect(await book(c, 'VS-RPC-25H', 'far.rpc-test@example.invalid')).toBeNull()
      await c.query('RESET ROLE')
      const stored = (await c.query<{ h: number }>(
        `SELECT extract(epoch FROM (starts_at - now())) / 3600 AS h FROM bookings WHERE slot_id = $1::uuid`,
        [farId],
      )).rows[0].h
      expect(Number(stored)).toBeGreaterThan(24.5)
      expect(Number(stored)).toBeLessThan(25.1)
    })
  })

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
})
