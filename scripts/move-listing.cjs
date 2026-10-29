#!/usr/bin/env node
/**
 * Move a listing created on the wrong agency (e.g. the super admin's own) to the
 * right agency and agent.
 *
 *   node --env-file=.env scripts/move-listing.cjs --list
 *       Read-only: recent listings with agency/agent, every agency and its agents.
 *
 *   node --env-file=.env scripts/move-listing.cjs --unit <unit uuid> --agency <agency name or uuid> [--agent <email>]
 *       Dry run: prints exactly what would change, writes nothing.
 *
 *   ... same command ... --apply
 *       Applies it in one transaction (all or nothing). Take a backup first.
 *
 * Moves the unit, its rooms, inventory, photos and documents, and its building
 * when no other listing shares it. Refuses a listing that already has activity
 * (enquiries, viewings, applications, leases, payments, deposits, tickets):
 * moving that history between agencies needs a person, not a script.
 */
const { Client } = require('pg')

const ACTIVITY_TABLES = [
  'leads',
  'bookings',
  'viewing_slots',
  'viewing_waitlist',
  'applications',
  'leases',
  'payments',
  'deposit_holdings',
  'payout_instructions',
  'maintenance_tickets',
  'message_threads',
  'inspections',
]
/** Rows that belong to the listing itself and follow it to the new agency. */
const LISTING_TABLES = ['rooms', 'internal_assets', 'media_assets', 'documents', 'apply_overrides', 'maintenance_rule_sets', 'tenant_viewing_windows']

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const has = (name) => process.argv.includes(`--${name}`)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function tableExists(c, table) {
  const r = await c.query('SELECT to_regclass($1) AS t', [`public.${table}`])
  return Boolean(r.rows[0].t)
}

async function list(c) {
  const units = await c.query(`
    SELECT u.id, coalesce(u.title, u.unit_number) AS title, u.status_config_key AS status,
           c.company_name AS agency, trim(a.first_name || ' ' || a.last_name) AS agent,
           to_char(u.created_at, 'YYYY-MM-DD HH24:MI') AS created
      FROM units u
      JOIN clients c ON c.id = u.client_id
      LEFT JOIN users a ON a.id = u.agent_id
     ORDER BY u.created_at DESC
     LIMIT 15`)
  console.log('\nRecent listings (newest first):')
  console.table(units.rows)

  const admins = await c.query(`
    SELECT u.email, coalesce(c.company_name, '(no agency)') AS agency
      FROM users u LEFT JOIN clients c ON c.id = u.client_id
     WHERE u.role = 'SUPER_ADMIN'`)
  console.log('Super admin accounts and their agency:')
  console.table(admins.rows)

  const agents = await c.query(`
    SELECT c.company_name AS agency, c.id AS agency_id,
           coalesce(string_agg(trim(u.first_name || ' ' || u.last_name) || ' <' || u.email || '>', ', '
             ORDER BY u.first_name) FILTER (WHERE u.id IS NOT NULL), '(no agents)') AS agents
      FROM clients c
      LEFT JOIN users u ON u.client_id = c.id AND u.role IN ('GROUND_AGENT', 'AGENT_ADMIN', 'AGENT') AND u.active
     GROUP BY c.id, c.company_name
     ORDER BY c.company_name`)
  console.log('Agencies and their agents:')
  for (const r of agents.rows) console.log(`  ${r.agency} (${r.agency_id})\n      ${r.agents}`)
}

async function move(c, apply) {
  const unitId = arg('unit')
  const agencyArg = arg('agency')
  const agentEmail = arg('agent')
  if (!unitId || !UUID_RE.test(unitId)) throw new Error('--unit <unit uuid> is required (copy it from --list)')
  if (!agencyArg) throw new Error('--agency <agency name or uuid> is required')

  const unit = (
    await c.query(
      `SELECT u.id, u.building_id, u.client_id, coalesce(u.title, u.unit_number) AS title, c.company_name AS agency
         FROM units u JOIN clients c ON c.id = u.client_id WHERE u.id = $1::uuid`,
      [unitId],
    )
  ).rows[0]
  if (!unit) throw new Error(`No listing with id ${unitId}`)

  const agencies = (
    await c.query(
      UUID_RE.test(agencyArg)
        ? 'SELECT id, company_name FROM clients WHERE id = $1::uuid'
        : 'SELECT id, company_name FROM clients WHERE lower(company_name) = lower($1)',
      [agencyArg],
    )
  ).rows
  if (agencies.length !== 1) throw new Error(`Agency "${agencyArg}" matched ${agencies.length} agencies; use its id from --list`)
  const agency = agencies[0]

  let agent = null
  if (agentEmail) {
    agent = (
      await c.query(
        `SELECT id, client_id, trim(first_name || ' ' || last_name) AS name, role FROM users WHERE lower(email) = lower($1)`,
        [agentEmail],
      )
    ).rows[0]
    if (!agent) throw new Error(`No user with email ${agentEmail}`)
    if (!['GROUND_AGENT', 'AGENT_ADMIN', 'AGENT'].includes(agent.role)) throw new Error(`${agentEmail} is ${agent.role}, not an agent`)
    if (agent.client_id !== agency.id) throw new Error(`${agent.name} does not work for ${agency.company_name}`)
  }

  const activity = []
  for (const t of ACTIVITY_TABLES) {
    if (!(await tableExists(c, t))) continue
    const n = (await c.query(`SELECT count(*)::int AS n FROM ${t} WHERE unit_id = $1::uuid`, [unitId])).rows[0].n
    if (n) activity.push(`${t}: ${n}`)
  }
  if (activity.length) {
    throw new Error(`Refusing: this listing already has activity (${activity.join(', ')}). Move it by hand with a person who knows the history.`)
  }

  const sharedBuilding =
    (await c.query('SELECT count(*)::int AS n FROM units WHERE building_id = $1::uuid AND id <> $2::uuid', [unit.building_id, unitId]))
      .rows[0].n > 0

  console.log(`\nListing:  ${unit.title} (${unit.id})`)
  console.log(`Agency:   ${unit.agency}  ->  ${agency.company_name}`)
  console.log(`Agent:    ${agent ? agent.name : 'unassigned'}`)
  console.log(`Building: ${sharedBuilding ? 'shared with other listings - left where it is' : 'moves with the listing'}`)

  await c.query('BEGIN')
  try {
    const counts = []
    const run = async (label, sql, params) => {
      const r = await c.query(sql, params)
      counts.push(`${label}: ${r.rowCount}`)
    }
    await run('units', 'UPDATE units SET client_id = $2::uuid, agent_id = $3::uuid, updated_at = NOW() WHERE id = $1::uuid', [unitId, agency.id, agent?.id ?? null])
    if (!sharedBuilding) await run('buildings', 'UPDATE buildings SET client_id = $2::uuid WHERE id = $1::uuid', [unit.building_id, agency.id])
    for (const t of LISTING_TABLES) {
      if (!(await tableExists(c, t))) continue
      await run(t, `UPDATE ${t} SET client_id = $2::uuid WHERE unit_id = $1::uuid`, [unitId, agency.id])
    }
    console.log(`Rows:     ${counts.join(', ')}`)
    if (apply) {
      await c.query('COMMIT')
      console.log('\nAPPLIED. Reload the app to see the listing under its agency.')
    } else {
      await c.query('ROLLBACK')
      console.log('\nDry run only - nothing was changed. Add --apply to make this change.')
    }
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (run with --env-file=.env)')
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  try {
    if (has('list') || !has('unit')) await list(c)
    else await move(c, has('apply'))
  } finally {
    await c.end()
  }
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
