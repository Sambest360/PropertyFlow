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
  const env = loadSeedEnv({ resolvePassword: false })
  const pool = createPgPool(env.directUrl)
  const admin = new DirectAdminClient(pool)
  try {
    const { repaired } = await admin.repairAuthUsers()
    console.log(
      `Repaired ${repaired} auth.users (identities, app metadata, confirmed email). Passwords were left unchanged.`,
    )
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
