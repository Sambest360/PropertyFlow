import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

/**
 * Migration 029 RLS on real Postgres: another agency can't see or change
 * rule sets / items; platform templates are readable by every agency.
 * Runs when PF_TEST_PG_URL points at a disposable database (skipped
 * otherwise). Everything lives in a throwaway schema with stub auth helpers.
 */
const PG_URL = process.env.PF_TEST_PG_URL
const SCHEMA = `pf_rules_rls_${process.pid}`
const AG_A = '00000000-0000-4000-8000-0000000000a1'
const AG_B = '00000000-0000-4000-8000-0000000000a2'

describe.skipIf(!PG_URL)('maintenance rule sets RLS (migration 029, real Postgres)', () => {
  let db: pg.Client

  async function as(client: string, role: string, sql: string, params: unknown[] = []) {
    await db.query('BEGIN')
    try {
      await db.query(`SET LOCAL search_path = ${SCHEMA}, public`)
      await db.query('SET LOCAL ROLE authenticated')
      await db.query(`SELECT set_config('app.client', $1, true), set_config('app.role', $2, true)`, [client, role])
      return (await db.query(sql, params)).rows
    } finally {
      await db.query('ROLLBACK')
    }
  }

  beforeAll(async () => {
    db = new pg.Client({ connectionString: PG_URL })
    await db.connect()
    const migration = readFileSync(new URL('../database/postgres/migrations/029_maintenance_rule_sets.sql', import.meta.url), 'utf8')
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}`)
    await db.query(`DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$`)
    await db.query(`SET search_path = ${SCHEMA}, public;
      CREATE TABLE clients (id uuid PRIMARY KEY, company_name text, phone text, settings jsonb);
      CREATE TABLE users (id uuid PRIMARY KEY, client_id uuid);
      CREATE TABLE units (id uuid PRIMARY KEY, client_id uuid, agent_id uuid, property_type text);
      CREATE TABLE documents (id uuid PRIMARY KEY, client_id uuid);
      CREATE TABLE maintenance_tickets (id uuid PRIMARY KEY, client_id uuid, unit_id uuid);
      CREATE FUNCTION is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
      CREATE FUNCTION current_app_client_id() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT nullif(current_setting('app.client', true), '')::uuid $$;
      CREATE FUNCTION current_app_user_role() RETURNS text LANGUAGE sql STABLE
        AS $$ SELECT current_setting('app.role', true) $$;
      INSERT INTO clients (id, company_name) VALUES ('${AG_A}', 'E2E TEST Agency A'), ('${AG_B}', 'E2E TEST Agency B');`)
    await db.query(migration)
    await db.query(`GRANT USAGE ON SCHEMA ${SCHEMA} TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${SCHEMA} TO authenticated;
      INSERT INTO maintenance_rule_sets (id, client_id, property_type, name)
        VALUES ('00000000-0000-4000-8000-0000000001a1', '${AG_A}', 'apartment', 'E2E TEST A apartments');
      INSERT INTO maintenance_rule_items (rule_set_id, category_key, label, responsible_party)
        VALUES ('00000000-0000-4000-8000-0000000001a1', 'LIFT', 'Lift', 'BODY_CORPORATE');`)
  })

  afterAll(async () => {
    if (!db) return
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => undefined)
    await db.end()
  })

  it('agency B sees the platform templates but not agency A’s set or items', async () => {
    const sets = await as(AG_B, 'AGENT', `SELECT client_id::text AS client_id, property_type FROM maintenance_rule_sets`)
    expect(sets.filter((s) => s.client_id)).toEqual([])
    expect(sets.map((s) => s.property_type).sort()).toEqual(['apartment', 'house', 'room', 'townhouse'])
    const items = await as(AG_B, 'AGENT', `SELECT category_key FROM maintenance_rule_items WHERE rule_set_id = '00000000-0000-4000-8000-0000000001a1'`)
    expect(items).toEqual([])
    const own = await as(AG_A, 'AGENT', `SELECT name FROM maintenance_rule_sets WHERE client_id IS NOT NULL`)
    expect(own).toEqual([{ name: 'E2E TEST A apartments' }])
  })

  it('agency B cannot change or add to agency A’s rules, nor touch templates', async () => {
    const upd = await as(AG_B, 'AGENCY_ADMIN', `UPDATE maintenance_rule_sets SET name = 'x' WHERE client_id = '${AG_A}' RETURNING id`)
    expect(upd).toEqual([])
    const tpl = await as(AG_B, 'AGENCY_ADMIN', `UPDATE maintenance_rule_sets SET name = 'x' WHERE client_id IS NULL RETURNING id`)
    expect(tpl).toEqual([])
    await expect(
      as(AG_B, 'AGENCY_ADMIN', `INSERT INTO maintenance_rule_sets (client_id, property_type, name) VALUES ('${AG_A}', 'house', 'x')`),
    ).rejects.toThrow(/row-level security/)
    await expect(
      as(
        AG_B,
        'AGENCY_ADMIN',
        `INSERT INTO maintenance_rule_items (rule_set_id, category_key, label, responsible_party)
         VALUES ('00000000-0000-4000-8000-0000000001a1', 'POOL', 'Pool', 'BODY_CORPORATE')`,
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('tenants (END_USER) of an agency can read but never write its rules', async () => {
    const read = await as(AG_A, 'END_USER', `SELECT name FROM maintenance_rule_sets WHERE client_id IS NOT NULL`)
    expect(read).toHaveLength(1)
    await expect(
      as(AG_A, 'END_USER', `INSERT INTO maintenance_rule_sets (client_id, property_type, name) VALUES ('${AG_A}', 'house', 'x')`),
    ).rejects.toThrow(/row-level security/)
  })

  it('the migration is re-runnable', async () => {
    const migration = readFileSync(new URL('../database/postgres/migrations/029_maintenance_rule_sets.sql', import.meta.url), 'utf8')
    await db.query(`SET search_path = ${SCHEMA}, public`)
    await expect(db.query(migration)).resolves.toBeDefined()
    const n = await db.query(`SELECT COUNT(*)::int AS n FROM maintenance_rule_sets WHERE client_id IS NULL`)
    expect(n.rows[0].n).toBe(4)
  })
})
