/**
 * One-off: create bootstrap Super Admin via Supabase Auth Admin API.
 * Usage: set -a && source .env.local && set +a && npx tsx scripts/create-super-admin.ts
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const email = process.env.SUPER_ADMIN_EMAIL ?? 'sambampo200@gmail.com'
const password = process.env.SUPER_ADMIN_PASSWORD ?? 'PropertyFlow-SuperAdmin-2026!'

if (!url || !secret) {
  console.error('Missing SUPABASE_URL and SUPABASE_SECRET_KEY')
  process.exit(1)
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: {
    first_name: 'Super',
    last_name: 'Admin',
    role: 'super_admin',
  },
})

if (error) {
  console.error('createUser failed:', error.message)
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, id: data.user?.id, email: data.user?.email }))
