/**
 * Bootstrap super admin account(s) via Supabase Auth Admin API.
 *
 * Usage (all configured super admins):
 *   set -a && source .env.local && set +a && npx tsx scripts/create-super-admin.ts
 *
 * Usage (single account):
 *   SUPER_ADMIN_EMAIL=sambampo200@gmail.com npx tsx scripts/create-super-admin.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPER_ADMINS, superAdminByEmail, type SuperAdminDef } from './seed/superAdmins.js'
import { DirectAdminClient } from './seed/directAdmin.js'
import { createPgPool } from './seed/helpers.js'

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const rawSecret = process.env.SUPABASE_SECRET_KEY
const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL
const password = process.env.SUPER_ADMIN_PASSWORD ?? 'secret'
const singleEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase()

const hasRealSecret = Boolean(rawSecret && !rawSecret.startsWith('sb_publishable_'))

// No secret key but a direct Postgres URL → use the SQL shim (auth trigger
// creates the public.users profile; crypt() writes GoTrue-compatible hashes).
const admin: SupabaseClient = hasRealSecret
  ? createClient(url!, rawSecret!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : directUrl
    ? (new DirectAdminClient(createPgPool(directUrl), password) as unknown as SupabaseClient)
    : (() => {
        console.error(
          'Missing SUPABASE_SECRET_KEY (or DIRECT_URL for the direct-Postgres shim)',
        )
        process.exit(1)
      })()

async function findUserByEmail(client: SupabaseClient, targetEmail: string) {
  let page = 1
  const perPage = 200
  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage })
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

export async function ensurePublicSuperAdmin(
  client: SupabaseClient,
  def: SuperAdminDef,
  authUserId: string,
): Promise<string> {
  const metadata = {
    frontend_id: def.feId,
    frontend_role: 'super_admin',
    mustChangePassword: false,
  }

  const { data: existing, error: fetchErr } = await client
    .from('users')
    .select('id')
    .ilike('email', def.email)
    .maybeSingle()

  if (fetchErr) throw fetchErr

  let appUserId = existing?.id as string | undefined

  if (appUserId) {
    const { error: updateErr } = await client
      .from('users')
      .update({
        auth_user_id: authUserId,
        client_id: null,
        role: 'SUPER_ADMIN',
        first_name: def.firstName,
        last_name: def.lastName,
        active: true,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', appUserId)
    if (updateErr) throw updateErr
  } else {
    appUserId = crypto.randomUUID()
    const { error: insertErr } = await client.from('users').insert({
      id: appUserId,
      auth_user_id: authUserId,
      client_id: null,
      email: def.email.toLowerCase(),
      first_name: def.firstName,
      last_name: def.lastName,
      role: 'SUPER_ADMIN',
      active: true,
      metadata,
      updated_at: new Date().toISOString(),
    })
    if (insertErr) throw insertErr
  }

  await client.from('entity_id_map').delete().eq('entity_type', 'user').eq('backend_id', appUserId)
  await client.from('entity_id_map').delete().eq('entity_type', 'user').eq('frontend_id', def.feId)

  const { error: mapInsertErr } = await client.from('entity_id_map').insert({
    entity_type: 'user',
    backend_id: appUserId,
    frontend_id: def.feId,
  })
  if (mapInsertErr) throw mapInsertErr

  return appUserId
}

export async function ensureSuperAdminAccount(
  client: SupabaseClient,
  def: SuperAdminDef,
  accountPassword: string,
): Promise<{ action: 'created' | 'password_updated'; authUserId: string; appUserId: string }> {
  let authUser = await findUserByEmail(client, def.email)
  let action: 'created' | 'password_updated' = 'password_updated'

  if (!authUser) {
    const { data, error } = await client.auth.admin.createUser({
      email: def.email,
      password: accountPassword,
      email_confirm: true,
      user_metadata: {
        first_name: def.firstName,
        last_name: def.lastName,
        role: 'super_admin',
      },
    })
    if (error) {
      if (!isExistingUserError(error.message)) {
        throw new Error(`createUser ${def.email}: ${error.message}`)
      }
      authUser = await findUserByEmail(client, def.email)
    } else {
      authUser = data.user ?? null
      action = 'created'
    }
  }

  if (!authUser) {
    throw new Error(`Could not resolve auth user for ${def.email}`)
  }

  const { error: updateError } = await client.auth.admin.updateUserById(authUser.id, {
    password: accountPassword,
    email_confirm: true,
    user_metadata: {
      ...(authUser.user_metadata as Record<string, unknown>),
      first_name: def.firstName,
      last_name: def.lastName,
      role: 'super_admin',
    },
  })
  if (updateError) {
    throw new Error(`updateUserById ${def.email}: ${updateError.message}`)
  }

  const appUserId = await ensurePublicSuperAdmin(client, def, authUser.id)
  return { action, authUserId: authUser.id, appUserId }
}

async function main() {
  const targets = singleEmail
    ? (() => {
        const def = superAdminByEmail(singleEmail)
        if (!def) {
          throw new Error(
            `Unknown SUPER_ADMIN_EMAIL: ${singleEmail}. Configured: ${SUPER_ADMINS.map((a) => a.email).join(', ')}`,
          )
        }
        return [def]
      })()
    : SUPER_ADMINS

  const results = []
  for (const def of targets) {
    const result = await ensureSuperAdminAccount(admin, def, password)
    results.push({
      ok: true,
      ...result,
      frontendId: def.feId,
      email: def.email,
      role: 'SUPER_ADMIN',
    })
    console.log(JSON.stringify(results[results.length - 1]))
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('create-super-admin.ts') ||
    process.argv[1].endsWith('create-super-admin.js'))

if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
