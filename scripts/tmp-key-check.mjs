// One-off: show that the publishable key cannot call the Auth admin API.
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY // holds the publishable key for this test

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
if (error) {
  console.log(`PUBLISHABLE KEY -> admin API rejected: ${error.status ?? ''} ${error.message}`)
} else {
  console.log(`PUBLISHABLE KEY -> unexpectedly allowed listUsers (${data.users.length} users)`)
}
