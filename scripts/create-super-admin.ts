/**
 * Bootstrap Super Admin via Supabase Auth Admin API.
 * Creates the user if missing, or updates password if the email already exists.
 * Always repairs public.users + entity_id_map so the account is SUPER_ADMIN (not applicant).
 *
 * Usage: set -a && source .env.local && set +a && npx tsx scripts/create-super-admin.ts
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const email = process.env.SUPER_ADMIN_EMAIL ?? 'ephraimbampo317@gmail.com'
const password = process.env.SUPER_ADMIN_PASSWORD ?? 'secret'
const SUPER_FE_ID = 'u-super'

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

async function ensurePublicSuperAdmin(authUserId: string) {
  const metadata = {
    frontend_id: SUPER_FE_ID,
    frontend_role: 'super_admin',
    mustChangePassword: false,
  }

  const { data: existing, error: fetchErr } = await admin
    .from('users')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  if (fetchErr) throw fetchErr

  let appUserId = existing?.id as string | undefined

  if (appUserId) {
    const { error: updateErr } = await admin
      .from('users')
      .update({
        auth_user_id: authUserId,
        client_id: null,
        role: 'SUPER_ADMIN',
        first_name: 'Super',
        last_name: 'Admin',
        active: true,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', appUserId)
    if (updateErr) throw updateErr
  } else {
    appUserId = crypto.randomUUID()
    const { error: insertErr } = await admin.from('users').insert({
      id: appUserId,
      auth_user_id: authUserId,
      client_id: null,
      email: email.toLowerCase(),
      first_name: 'Super',
      last_name: 'Admin',
      role: 'SUPER_ADMIN',
      active: true,
      metadata,
      updated_at: new Date().toISOString(),
    })
    if (insertErr) throw insertErr
  }

  await admin.from('entity_id_map').delete().eq('entity_type', 'user').eq('backend_id', appUserId)
  await admin.from('entity_id_map').delete().eq('entity_type', 'user').eq('frontend_id', SUPER_FE_ID)

  const { error: mapInsertErr } = await admin.from('entity_id_map').insert({
    entity_type: 'user',
    backend_id: appUserId,
    frontend_id: SUPER_FE_ID,
  })
  if (mapInsertErr) throw mapInsertErr

  return appUserId
}

async function main() {
  let authUser = await findUserByEmail(email)
  let action: 'created' | 'password_updated' = 'password_updated'

  if (!authUser) {
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
      if (!isExistingUserError(error.message)) {
        console.error('createUser failed:', error.message)
        process.exit(1)
      }
      authUser = await findUserByEmail(email)
    } else {
      authUser = data.user ?? null
      action = 'created'
    }
  }

  if (!authUser) {
    console.error('Could not resolve auth user for', email)
    process.exit(1)
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(authUser.id, {
    password,
    email_confirm: true,
    user_metadata: {
      ...(authUser.user_metadata as Record<string, unknown>),
      first_name: 'Super',
      last_name: 'Admin',
      role: 'super_admin',
    },
  })
  if (updateError) {
    console.error('updateUserById failed:', updateError.message)
    process.exit(1)
  }

  const appUserId = await ensurePublicSuperAdmin(authUser.id)

  console.log(
    JSON.stringify({
      ok: true,
      action,
      authUserId: authUser.id,
      appUserId,
      frontendId: SUPER_FE_ID,
      email,
      role: 'SUPER_ADMIN',
    }),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
