/**
 * Reset Supabase demo data — keeps super admin, seeds Seeff City Bowl agency.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   SEED_CONFIRM=1 npm run db:seed:supabase
 *
 * Or: npm run db:seed:supabase -- --confirm
 */
import { clearDatabase } from './seed/clearDatabase.js'
import { createAdminClient, createPgPool, loadSeedEnv } from './seed/helpers.js'
import { seedDemo } from './seed/seedDemo.js'
import { AGENTS } from './seed/data/users.js'

function confirmed(): boolean {
  if (process.env.SEED_CONFIRM === '1' || process.env.SEED_CONFIRM === 'true') return true
  return process.argv.includes('--confirm')
}

function printSummary(input: {
  superAdminEmail: string
  demoPassword: string
  agencyName: string
  propertyCount: number
  userCount: number
  credentials: Array<{ email: string; role: string; note?: string }>
}) {
  console.log('\n========== PropertyFlow demo seed complete ==========\n')
  console.log(`Agency: ${input.agencyName}`)
  console.log(`Properties: ${input.propertyCount}`)
  console.log(`Users (excl. super admin): ${input.userCount}`)
  console.log(`\nSuper admin: ${input.superAdminEmail} / ${input.demoPassword}`)
  console.log(`All other seeded users password: ${input.demoPassword}\n`)

  console.log('Agent property counts:')
  const counts = [1, 2, 4, 6, 3]
  AGENTS.forEach((a, i) => {
    console.log(`  ${a.firstName} ${a.lastName} (${a.email}): ${counts[i]} properties`)
  })

  console.log('\nLogin credentials:')
  console.log('  Role                 Email')
  console.log('  -------------------  ----------------------------------------')
  for (const c of input.credentials) {
    const role = c.note ? `${c.role} (${c.note})` : c.role
    console.log(`  ${role.padEnd(20)} ${c.email}`)
  }
  console.log('\n=====================================================\n')
}

async function main() {
  if (!confirmed()) {
    console.error(
      'Refusing to run: this wipes all data except the super admin.\n' +
        'Re-run with SEED_CONFIRM=1 or --confirm',
    )
    process.exit(1)
  }

  const env = loadSeedEnv()
  const pool = createPgPool(env.directUrl)
  const admin = createAdminClient(env)

  try {
    console.log('Phase 1: clearing database…')
    await clearDatabase(pool, admin, env)

    console.log('Phase 2: seeding demo agency…')
    const result = await seedDemo(pool, admin, env)

    printSummary({
      superAdminEmail: env.superAdminEmail,
      demoPassword: env.demoPassword,
      agencyName: result.agencyName,
      propertyCount: result.propertyCount,
      userCount: result.userCount,
      credentials: result.credentials,
    })
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
