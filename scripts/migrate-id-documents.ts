import { migrateUserMetadataDocuments } from '../server/migrateIdDocuments.ts'

const databaseUrl = process.env.DATABASE_URL
const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!databaseUrl || !supabaseUrl || !serviceRoleKey) {
  console.error('Set DATABASE_URL, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const result = await migrateUserMetadataDocuments({ databaseUrl, supabaseUrl, serviceRoleKey })
console.log(JSON.stringify(result))
