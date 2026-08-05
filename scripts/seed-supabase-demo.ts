/**
 * Reset Supabase demo data — keeps super admin + global configuration, seeds one agency.
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
import { AGENTS, AGENT_PROPERTY_COUNTS } from './seed/data/users.js'

function confirmed(): boolean {
  if (process.env.SEED_CONFIRM === '1' || process.env.SEED_CONFIRM === 'true') return true
  return process.argv.includes('--confirm')
}

async function ensureSuperAdmin(env: ReturnType<typeof loadSeedEnv>) {
  const { execSync } = await import('node:child_process')
  console.log(`Ensuring super admin exists: ${env.superAdminEmail}`)
  execSync('npx tsx scripts/create-super-admin.ts', {
    stdio: 'inherit',
    env: {
      ...process.env,
      SUPER_ADMIN_EMAIL: env.superAdminEmail,
      SUPER_ADMIN_PASSWORD: env.demoPassword,
    },
  })
}

function printSummary(input: {
  superAdminEmail: string
  demoPassword: string
  agencyName: string
  propertyCount: number
  applicantCount: number
  applicationCount: number
  userCount: number
  credentials: Array<{ email: string; role: string; note?: string }>
}) {
  console.log('\n========== PropertyFlow demo seed complete ==========\n')
  console.log(`Agency: ${input.agencyName}`)
  console.log(`Properties: ${input.propertyCount}`)
  console.log(`Applicants: ${input.applicantCount}`)
  console.log(`Applications: ${input.applicationCount}`)
  console.log(`Staff + applicants: ${input.userCount}`)
  console.log(`\nSuper admin: ${input.superAdminEmail} / ${input.demoPassword}`)
  console.log(`All other seeded users password: ${input.demoPassword}\n`)

  console.log('Agent property counts:')
  AGENTS.forEach((a, i) => {
    console.log(`  ${a.firstName} ${a.lastName} (${a.email}): ${AGENT_PROPERTY_COUNTS[i]} properties`)
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
      'Refusing to run: this wipes all data except the super admin and global configuration.\n' +
        'Re-run with SEED_CONFIRM=1 or --confirm',
    )
    process.exit(1)
  }

  const env = loadSeedEnv()
  await ensureSuperAdmin(env)

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
      applicantCount: result.applicantCount,
      applicationCount: result.applicationCount,
      userCount: result.userCount,
      credentials: result.credentials,
    })
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err)
  process.exit(1)
})
