/**
 * Repair GoTrue rows seeded without auth.identities / app metadata
 * (Auth token HTTP 500 for Lerato, agents, applicants).
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/repair-auth-identities.ts
 */
import { DirectAdminClient } from './seed/directAdmin.js'
import { createPgPool, loadSeedEnv } from './seed/helpers.js'

async function main() {
  const env = loadSeedEnv()
  const pool = createPgPool(env.directUrl)
  const admin = new DirectAdminClient(pool, env.demoPassword)
  try {
    const { repaired } = await admin.repairAuthUsers(env.demoPassword)
    console.log(`Repaired ${repaired} auth.users (identities, app metadata, confirmed email, password reset).`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
