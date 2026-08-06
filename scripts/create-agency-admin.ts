/**
 * Ensure the Seeff City Bowl agency admin exists in Supabase Auth + public.users.
 *
 * Usage:
 *   set -a && source .env.local && set +a && npx tsx scripts/create-agency-admin.ts
 *
 * Optional overrides:
 *   AGENCY_ADMIN_EMAIL=lerato.nkosi@propertyflow.demo
 *   AGENCY_ADMIN_PASSWORD=secret
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AGENCY, AGENCY_FE_ID, AGENCY_ID } from './seed/data/agency.js'
import { AGENCY_ADMIN } from './seed/data/users.js'
import {
  findAuthUserByEmail,
  loadSeedEnv,
  patchAppUser,
  ROLE_TO_FE,
  upsertEntityMap,
} from './seed/helpers.js'

function isExistingUserError(message: string) {
  const lower = message.toLowerCase()
  return lower.includes('already been registered') || lower.includes('already exists')
}

async function resolveAgencyId(admin: SupabaseClient): Promise<string> {
  const { data: byId, error: byIdErr } = await admin
    .from('clients')
    .select('id, company_name')
    .eq('id', AGENCY_ID)
    .maybeSingle()
  if (byIdErr) throw byIdErr
  if (byId?.id) return byId.id as string

  const { data: byName, error: byNameErr } = await admin
    .from('clients')
    .select('id, company_name')
    .ilike('company_name', AGENCY.company_name)
    .maybeSingle()
  if (byNameErr) throw byNameErr
  if (byName?.id) return byName.id as string

  throw new Error(
    `Agency "${AGENCY.company_name}" not found. Run SEED_CONFIRM=1 npm run db:seed:supabase first.`,
  )
}

async function ensurePublicAgencyAdmin(
  client: SupabaseClient,
  input: {
    authUserId: string
    clientId: string
    email: string
    firstName: string
    lastName: string
    phone: string
    feId: string
  },
): Promise<string> {
  const feRole = ROLE_TO_FE.AGENCY_ADMIN
  const metadata = {
    frontend_id: input.feId,
    frontend_role: feRole,
    mustChangePassword: false,
    licenseStatus: 'n/a',
  }

  const { data: existing, error: fetchErr } = await client
    .from('users')
    .select('id')
    .ilike('email', input.email)
    .maybeSingle()
  if (fetchErr) throw fetchErr

  let appUserId = existing?.id as string | undefined

  if (appUserId) {
    const { error: updateErr } = await client
      .from('users')
      .update({
        auth_user_id: input.authUserId,
        client_id: input.clientId,
        role: 'AGENCY_ADMIN',
        first_name: input.firstName,
        last_name: input.lastName,
        phone: input.phone,
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
      auth_user_id: input.authUserId,
      client_id: input.clientId,
      email: input.email.toLowerCase(),
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      role: 'AGENCY_ADMIN',
      active: true,
      metadata,
      updated_at: new Date().toISOString(),
    })
    if (insertErr) throw insertErr
  }

  await upsertEntityMap(client, 'user', input.feId, appUserId)
  await upsertEntityMap(client, 'agency', AGENCY_FE_ID, input.clientId)
  return appUserId
}

export async function ensureAgencyAdminAccount(
  client: SupabaseClient,
  password: string,
  email = AGENCY_ADMIN.email,
): Promise<{
  action: 'created' | 'updated'
  authUserId: string
  appUserId: string
  clientId: string
  email: string
}> {
  const clientId = await resolveAgencyId(client)
  const def = { ...AGENCY_ADMIN, email: email.trim().toLowerCase() }

  let authUser = await findAuthUserByEmail(client, def.email)
  let action: 'created' | 'updated' = 'updated'

  if (!authUser) {
    const { data, error } = await client.auth.admin.createUser({
      email: def.email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: def.firstName,
        last_name: def.lastName,
        phone: def.phone,
        role: 'tenant',
      },
    })
    if (error) {
      if (!isExistingUserError(error.message)) {
        throw new Error(`createUser ${def.email}: ${error.message}`)
      }
      authUser = await findAuthUserByEmail(client, def.email)
    } else {
      authUser = data.user ?? null
      action = 'created'
    }
  }

  if (!authUser) {
    throw new Error(`Could not resolve auth user for ${def.email}`)
  }

  const { error: updateError } = await client.auth.admin.updateUserById(authUser.id, {
    password,
    email_confirm: true,
    user_metadata: {
      ...(authUser.user_metadata as Record<string, unknown>),
      first_name: def.firstName,
      last_name: def.lastName,
      phone: def.phone,
    },
  })
  if (updateError) {
    throw new Error(`updateUserById ${def.email}: ${updateError.message}`)
  }

  try {
    await patchAppUser(client, {
      authUserId: authUser.id,
      dbRole: 'AGENCY_ADMIN',
      feId: def.feId,
      feRole: ROLE_TO_FE.AGENCY_ADMIN,
      clientId,
      extraMetadata: { licenseStatus: 'n/a' },
    })
  } catch {
    // Auth trigger may not have created public.users yet — upsert manually.
  }

  const appUserId = await ensurePublicAgencyAdmin(client, {
    authUserId: authUser.id,
    clientId,
    email: def.email,
    firstName: def.firstName,
    lastName: def.lastName,
    phone: def.phone,
    feId: def.feId,
  })

  return { action, authUserId: authUser.id, appUserId, clientId, email: def.email }
}

async function main() {
  const env = loadSeedEnv()
  const password = process.env.AGENCY_ADMIN_PASSWORD ?? env.demoPassword
  const email = process.env.AGENCY_ADMIN_EMAIL ?? AGENCY_ADMIN.email

  const admin = createClient(env.supabaseUrl, env.supabaseSecret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const result = await ensureAgencyAdminAccount(admin, password, email)

  console.log(
    JSON.stringify(
      {
        ok: true,
        agency: AGENCY.company_name,
        role: 'AGENCY_ADMIN (client_admin)',
        frontendId: AGENCY_ADMIN.feId,
        email: result.email,
        password,
        action: result.action,
        clientId: result.clientId,
        appUserId: result.appUserId,
      },
      null,
      2,
    ),
  )
}

const isMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('create-agency-admin.ts') ||
    process.argv[1].endsWith('create-agency-admin.js'))

if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err)
    process.exit(1)
  })
}
