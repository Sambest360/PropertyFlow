import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'
import { DirectAdminClient } from './directAdmin.js'

const DEMO_DOC_BASE =
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf.pdf'

export const DEMO_SAMPLE_PDF = DEMO_DOC_BASE

export type DbRole =
  | 'SUPER_ADMIN'
  | 'AGENCY_ADMIN'
  | 'AGENT_ADMIN'
  | 'GROUND_AGENT'
  | 'LANDLORD'
  | 'END_USER'
  | 'CONTRACTOR'

export type FeRole =
  | 'super_admin'
  | 'client_admin'
  | 'agent_admin'
  | 'ground_agent'
  | 'agent'
  | 'landlord'
  | 'tenant'
  | 'contractor'

export const ROLE_TO_FE: Record<DbRole, FeRole> = {
  SUPER_ADMIN: 'super_admin',
  AGENCY_ADMIN: 'client_admin',
  AGENT_ADMIN: 'agent_admin',
  GROUND_AGENT: 'ground_agent',
  LANDLORD: 'landlord',
  END_USER: 'tenant',
  CONTRACTOR: 'contractor',
}

export type SeedEnv = {
  directUrl: string
  supabaseUrl: string
  supabaseSecret: string
  superAdminEmail: string
  demoPassword: string
}

export function loadSeedEnv(): SeedEnv {
  const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  // Local .env.local ships the publishable key only. When no real secret is
  // present the seed scripts fall back to the direct-Postgres admin shim.
  const rawSecret =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY
  const isRealSecret = Boolean(rawSecret && !rawSecret.startsWith('sb_publishable_'))
  const supabaseSecret = isRealSecret
    ? rawSecret
    : `direct:${directUrl}`
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL ?? 'ephraimbampo317@gmail.com'
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? process.env.SUPER_ADMIN_PASSWORD ?? 'secret'

  if (!directUrl) throw new Error('Missing DIRECT_URL or DATABASE_URL')
  if (!supabaseUrl) throw new Error('Missing SUPABASE_URL')
  if (!supabaseSecret)
    throw new Error(
      'Missing DIRECT_URL or DATABASE_URL — seed scripts need a Postgres connection (direct shim) or SUPABASE_SECRET_KEY (Auth Admin API).',
    )

  return { directUrl, supabaseUrl, supabaseSecret, superAdminEmail, demoPassword }
}

export function createPgPool(directUrl: string): pg.Pool {
  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/|$)/.test(directUrl)
  if (isLocal) {
    return new pg.Pool({ connectionString: directUrl })
  }

  // Strip sslmode from URL so pg uses our ssl config (avoids cert chain errors on Supabase pooler).
  const connectionString = directUrl
    .replace(/([?&])sslmode=[^&]*&?/g, (_, sep) => (sep === '?' ? '?' : ''))
    .replace(/[?&]$/, '')

  return new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })
}

export function createAdminClient(env: SeedEnv): SupabaseClient {
  // No real secret key → drive Postgres directly via the supabase-js-shaped shim.
  if (env.supabaseSecret.startsWith('direct:')) {
    const pool = createPgPool(env.directUrl)
    return new DirectAdminClient(pool, env.demoPassword) as unknown as SupabaseClient
  }
  return createClient(env.supabaseUrl, env.supabaseSecret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function findAuthUserByEmail(admin: SupabaseClient, email: string) {
  let page = 1
  const perPage = 200
  const target = email.trim().toLowerCase()
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const match = data.users.find((u) => u.email?.toLowerCase() === target)
    if (match) return match
    if (data.users.length < perPage) return null
    page += 1
  }
}

export async function deleteAllAuthUsersExcept(admin: SupabaseClient, keepAuthIds: string | string[]) {
  const keep = new Set(Array.isArray(keepAuthIds) ? keepAuthIds : [keepAuthIds])
  let page = 1
  const perPage = 200
  let deleted = 0
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    for (const user of data.users) {
      if (keep.has(user.id)) continue
      const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
      if (delErr) throw delErr
      deleted += 1
    }
    if (data.users.length < perPage) break
    page += 1
  }
  return deleted
}

export function demoDoc(key: string, label: string) {
  return {
    key,
    label,
    name: `${label.replace(/\s+/g, '-').toLowerCase()}.pdf`,
    mimeType: 'application/pdf',
    dataUrl: DEMO_SAMPLE_PDF,
    uploadedAt: new Date().toISOString(),
  }
}

export type CreateUserInput = {
  email: string
  firstName: string
  lastName: string
  phone?: string
  dbRole: DbRole
  feId: string
  clientId?: string | null
  metadata?: Record<string, unknown>
  password: string
}

export async function createAuthUser(admin: SupabaseClient, input: CreateUserInput): Promise<string> {
  const feRole = ROLE_TO_FE[input.dbRole]
  const signupRole =
    input.dbRole === 'CONTRACTOR'
      ? 'contractor'
      : input.dbRole === 'LANDLORD'
        ? 'landlord'
        : 'tenant'

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email.trim(),
    password: input.password,
    email_confirm: true,
    user_metadata: {
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      phone: input.phone?.trim() ?? '',
      role: signupRole,
      profile: input.metadata?.profile ?? {},
    },
  })
  if (error) throw new Error(`createUser ${input.email}: ${error.message}`)
  if (!data.user) throw new Error(`createUser ${input.email}: no user returned`)

  await patchAppUser(admin, {
    authUserId: data.user.id,
    dbRole: input.dbRole,
    feId: input.feId,
    feRole,
    clientId: input.clientId ?? null,
    extraMetadata: input.metadata,
  })

  return data.user.id
}

export async function patchAppUser(
  admin: SupabaseClient,
  input: {
    authUserId: string
    dbRole: DbRole
    feId: string
    feRole: FeRole
    clientId: string | null
    extraMetadata?: Record<string, unknown>
  },
): Promise<string> {
  const { data: row, error: readErr } = await admin
    .from('users')
    .select('id, metadata')
    .eq('auth_user_id', input.authUserId)
    .maybeSingle()
  if (readErr) throw readErr
  if (!row) throw new Error(`public.users row missing for auth ${input.authUserId}`)

  const baseMeta = (row.metadata as Record<string, unknown> | null) ?? {}
  const metadata: Record<string, unknown> = {
    ...baseMeta,
    ...input.extraMetadata,
    frontend_id: input.feId,
    frontend_role: input.feRole,
    mustChangePassword: false,
  }

  const { error: updErr } = await admin
    .from('users')
    .update({
      role: input.dbRole,
      client_id: input.clientId,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
  if (updErr) throw updErr

  await upsertEntityMap(admin, 'user', input.feId, row.id)
  return row.id
}

export async function upsertEntityMap(
  admin: SupabaseClient,
  entityType: string,
  frontendId: string,
  backendId: string,
) {
  // Auth trigger may insert a random frontend_id — replace mapping for this backend row.
  await admin.from('entity_id_map').delete().eq('entity_type', entityType).eq('backend_id', backendId)
  await admin.from('entity_id_map').delete().eq('entity_type', entityType).eq('frontend_id', frontendId)

  const { error } = await admin.from('entity_id_map').insert({
    entity_type: entityType,
    frontend_id: frontendId,
    backend_id: backendId,
  })
  if (error) throw error
}

export async function getAppUserIdByAuth(admin: SupabaseClient, authUserId: string): Promise<string> {
  const { data, error } = await admin.from('users').select('id').eq('auth_user_id', authUserId).maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error(`No app user for auth ${authUserId}`)
  return data.id
}

export function fixedUuid(prefix: string, n: number): string {
  const hex = n.toString(16).padStart(12, '0')
  return `${prefix}-0001-4000-8000-${hex}`
}
