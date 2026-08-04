/**
 * Bootstrap Super Admin via Supabase Auth Admin API.
 * Creates the user if missing, or updates password if the email already exists.
 *
 * Usage: set -a && source .env.local && set +a && npx tsx scripts/create-super-admin.ts
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const email = process.env.SUPER_ADMIN_EMAIL ?? 'sambampo200@gmail.com'
const password = process.env.SUPER_ADMIN_PASSWORD ?? 'secret'

if (!url || !secret) {
  console.error('Missing SUPABASE_URL and SUPABASE_SECRET_KEY')
  process.exit(1)
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function findUserByEmail(targetEmail: string) {
  let page = 1
  const perPage = 200
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const match = data.users.find((u) => u.email?.toLowerCase() === targetEmail.toLowerCase())
    if (match) return match
    if (data.users.length < perPage) return null
    page += 1
  }
}

function isExistingUserError(message: string) {
  const lower = message.toLowerCase()
  return lower.includes('already been registered') || lower.includes('already exists')
}

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

if (!error) {
  console.log(
    JSON.stringify({ ok: true, action: 'created', id: data.user?.id, email: data.user?.email }),
  )
  process.exit(0)
}

if (!isExistingUserError(error.message)) {
  console.error('createUser failed:', error.message)
  process.exit(1)
}

const existing = await findUserByEmail(email)
if (!existing) {
  console.error('User appears to exist but could not be found by email:', email)
  process.exit(1)
}

const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
  password,
  email_confirm: true,
  user_metadata: {
    ...existing.user_metadata,
    first_name: 'Super',
    last_name: 'Admin',
    role: 'super_admin',
  },
})

if (updateError) {
  console.error('updateUserById failed:', updateError.message)
  process.exit(1)
}

console.log(
  JSON.stringify({
    ok: true,
    action: 'password_updated',
    id: updated.user?.id ?? existing.id,
    email: updated.user?.email ?? email,
  }),
)
