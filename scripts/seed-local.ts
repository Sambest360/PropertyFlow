/**
 * Load the local fixture into the Supabase CLI database, set one seed
 * password, and upload one obviously fake file per agency into local Storage.
 *
 *   npm run db:seed:local
 *
 * Password: SEED_USER_PASSWORD. If that is unset, a strong password is
 * generated and printed once. `supabase db reset` loads supabase/seed.sql
 * without a usable password; run this script afterwards to sign in.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { localDevAgencies, localDevUsers } from '../database/fixtures/localDevSeed.ts'
import { assertLocalSeedTarget } from './seed/localOnlyGuard.ts'
import { resolveSeedPassword } from './seed/seedPassword.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Well-known local demo key printed by `supabase status` as SERVICE_ROLE_KEY
// when the CLI uses its default JWT secret. It is not a hosted project key.
const LOCAL_DEMO_SERVICE_ROLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const databaseUrl =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'

assertLocalSeedTarget({ databaseUrl, supabaseUrl })

const password = resolveSeedPassword()

const secret =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  LOCAL_DEMO_SERVICE_ROLE

const sql = readFileSync(join(root, 'supabase/seed.sql'), 'utf8')
const pool = new pg.Pool({ connectionString: databaseUrl })

try {
  await pool.query(sql)
  await pool.query(
    `UPDATE auth.users
     SET encrypted_password = crypt($1, gen_salt('bf', 10)), updated_at = NOW()
     WHERE email LIKE '%@example.test'`,
    [password],
  )
  await pool.query(
    `UPDATE public.users
     SET password_hash = crypt($1, gen_salt('bf', 10)), updated_at = NOW()
     WHERE email LIKE '%@example.test'`,
    [password],
  )
} finally {
  await pool.end()
}

for (const agency of localDevAgencies) {
  const path = `local-dev/${agency.subdomain}-lease.txt`
  const response = await fetch(`${supabaseUrl}/storage/v1/object/documents/${path}`, {
    method: 'POST',
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'text/plain',
      'x-upsert': 'true',
    },
    body: `FAKE lease pack for ${agency.name}. Not a real document.\n`,
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Storage upload ${path} failed (${response.status}): ${detail}`)
  }
  console.log(`Uploaded storage object documents/${path}`)
}

console.log('\nLocal seed ready. Every @example.test account uses the seed password from this run.')
console.log('Role             Email')
for (const user of localDevUsers) {
  console.log(`${user.role.padEnd(16)} ${user.email}`)
}
