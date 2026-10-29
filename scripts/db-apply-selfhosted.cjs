#!/usr/bin/env node
/**
 * Apply one database/postgres/selfhosted/*.sql update to DATABASE_URL.
 *
 *   node --env-file=.env scripts/db-apply-selfhosted.cjs <file.sql>           dry run
 *   node --env-file=.env scripts/db-apply-selfhosted.cjs <file.sql> --apply   commit
 *
 * The whole file runs in one transaction. A dry run executes it, checks the
 * result, then rolls back (Postgres undoes ALTER/CREATE inside a transaction),
 * so nothing changes. --apply commits. Take a backup before --apply.
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

async function checks(c) {
  const col = await c.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'maintenance_tickets' AND column_name = 'access_notes'`,
  )
  const fn = await c.query(
    `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'unit_listing_limit_snapshot'`,
  )
  const unit = (await c.query('SELECT id FROM units ORDER BY created_at DESC LIMIT 1')).rows[0]
  let sample = null
  if (fn.rowCount && unit) {
    sample = (await c.query('SELECT unit_listing_limit_snapshot($1::uuid) AS s', [unit.id])).rows[0].s
  }
  return { accessNotesColumn: col.rowCount > 0, limitsFunction: fn.rowCount > 0, sample }
}

async function main() {
  const file = process.argv[2]
  const apply = process.argv.includes('--apply')
  if (!file || !file.endsWith('.sql')) throw new Error('Usage: db-apply-selfhosted.cjs <file.sql> [--apply]')
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (run with --env-file=.env)')
  const sql = fs.readFileSync(path.resolve(file), 'utf8')

  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  try {
    console.log('Before:', await checks(c))
    await c.query('BEGIN')
    try {
      await c.query(sql)
      const after = await checks(c)
      console.log('After: ', after)
      if (!after.accessNotesColumn || !after.limitsFunction) throw new Error('update ran but the checks did not pass')
      if (apply) {
        await c.query('COMMIT')
        console.log('\nAPPLIED. Restart the API (pm2 restart propertyflow-api) so it picks up the column.')
      } else {
        await c.query('ROLLBACK')
        console.log('\nDry run only - rolled back, nothing changed. Add --apply to make this change.')
      }
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {})
      throw e
    }
  } finally {
    await c.end()
  }
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
