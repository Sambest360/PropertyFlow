/**
 * Direct Supabase registration — bypasses the GoTrue /auth/v1/signup endpoint.
 *
 * Why: the shared Supabase project rate-limits signup confirmation emails
 * (429 over_email_send_rate_limit) and its email validator rejects otherwise
 * valid plus-addresses (400 email_address_invalid). Users were locked out of
 * registering entirely ("Too many attempts" dialog).
 *
 * How: insert the GoTrue user directly into auth.users with
 * email_confirmed_at = NOW() — no confirmation email is ever sent, so neither
 * the email quota nor the validator applies. The existing
 * `handle_new_auth_user` trigger (migration 004/009) creates + links the
 * public.users profile from raw_user_meta_data, exactly mirroring what the
 * Auth Admin API createUser(email_confirm: true) does — the same mechanism the
 * seed scripts use. We then verify with a real GoTrue password grant before
 * reporting success, so a half-created account can never be reported as OK.
 *
 * Insert shape kept aligned with scripts/seed/directAdmin.ts insertGoTrueUser.
 * Sign-in stays 100% on the normal client path (supabase.auth.signInWithPassword).
 */
import crypto from 'node:crypto'
import { pool, databaseConfigured } from '../db.js'
import { isReservedSuperAdminEmail } from '../../src/lib/supabase/idMap.js'
import { MIN_PASSWORD_LENGTH } from '../passwordPolicy.js'

const AUTH_INSTANCE_ID = '00000000-0000-0000-0000-000000000000'

export type DirectRegisterInput = {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
  role?: string
  profile?: Record<string, unknown>
  documents?: unknown[]
}

/** Same allow-list the trigger applies; super_admin only when the platform is empty. */
async function resolveRole(input: { requestedRole?: string; email: string }): Promise<{
  roleFe: string
  bootstrap: boolean
}> {
  const totalRows = await pool!.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM public.users')
  const bootstrap = Number(totalRows.rows[0]?.n ?? 0) === 0
  let roleFe = bootstrap ? 'super_admin' : (input.requestedRole ?? 'tenant').trim() || 'tenant'
  if (!bootstrap) {
    const allowedPublic = new Set(['tenant', 'landlord', 'contractor', 'applicant'])
    if (!allowedPublic.has(roleFe)) roleFe = 'tenant'
    if (roleFe === 'applicant') roleFe = 'tenant'
  }
  return { roleFe, bootstrap }
}

async function insertGoTrueUser(input: {
  id: string
  email: string
  password: string
  userMetadata: Record<string, unknown>
}): Promise<void> {
  const params = [
    input.id,
    AUTH_INSTANCE_ID,
    input.email,
    input.password,
    JSON.stringify(input.userMetadata),
  ]
  try {
    await pool!.query(
      `INSERT INTO auth.users (
         id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data, is_sso_user,
         created_at, updated_at
       ) VALUES (
         $1, $2::uuid, 'authenticated', 'authenticated', $3,
         crypt($4, gen_salt('bf', 10)),
         NOW(), '', '', '', '',
         '{"provider":"email","providers":["email"]}'::jsonb,
         $5::jsonb, false,
         NOW(), NOW()
       )`,
      params,
    )
  } catch {
    // Older project generations lack some of the optional token columns.
    await pool!.query(
      `INSERT INTO auth.users (
         id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at
       ) VALUES (
         $1, $2::uuid, 'authenticated', 'authenticated', $3,
         crypt($4, gen_salt('bf', 10)),
         NOW(),
         '{"provider":"email","providers":["email"]}'::jsonb,
         $5::jsonb,
         NOW(), NOW()
       )`,
      params,
    )
  }

  // GoTrue 500s on /token when the identity row is missing — mirror the seed scripts.
  const identityData = JSON.stringify({
    sub: input.id,
    email: input.email,
    email_verified: true,
    phone_verified: false,
  })
  try {
    await pool!.query(
      `INSERT INTO auth.identities (
         id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
       )
       SELECT $1::uuid, $2::uuid, $3::jsonb, 'email', $4, NOW(), NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM auth.identities WHERE user_id = $2::uuid AND provider = 'email'
       )`,
      [crypto.randomUUID(), input.id, identityData, input.email],
    )
  } catch {
    await pool!.query(
      `INSERT INTO auth.identities (
         id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
       )
       SELECT $1::uuid, $2::uuid, $3::jsonb, 'email', NOW(), NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM auth.identities WHERE user_id = $2::uuid AND provider = 'email'
       )`,
      [crypto.randomUUID(), input.id, identityData],
    )
  }
}

async function goTruePasswordSignIn(
  email: string,
  password: string,
): Promise<{ ok: boolean; status: number; userId?: string }> {
  const base = (
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).replace(/\/$/, '')
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  if (!base || !key) return { ok: false, status: 0 }
  try {
    const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) return { ok: false, status: res.status }
    const body = (await res.json()) as { user?: { id?: string } }
    return { ok: Boolean(body.user?.id), status: res.status, userId: body.user?.id }
  } catch {
    return { ok: false, status: 0 }
  }
}

export type DirectRegisterResult = {
  authUserId: string
  email: string
  roleFe: string
  bootstrap: boolean
}

export function directRegisterConfigured(): boolean {
  return databaseConfigured && pool != null
}

/**
 * Create a pre-confirmed Supabase auth user + linked public.users profile
 * without touching the GoTrue signup endpoint. Throws { status } errors in the
 * same shape registerUser() uses so the route's error mapping keeps working.
 */
export async function registerSupabaseUserDirect(
  input: DirectRegisterInput,
): Promise<DirectRegisterResult> {
  if (!directRegisterConfigured()) {
    const err = new Error('DATABASE_URL is not configured') as Error & { status: number }
    err.status = 503
    throw err
  }
  const email = input.email.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error('Valid email is required') as Error & { status: number }
    err.status = 400
    throw err
  }
  if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
    const err = new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`) as Error & { status: number }
    err.status = 400
    throw err
  }
  const first = input.firstName?.trim()
  const last = input.lastName?.trim()
  if (!first || !last) {
    const err = new Error('First name and surname are required') as Error & { status: number }
    err.status = 400
    throw err
  }

  // Unique mailbox check across BOTH tables (public.users carries the trigger
  // profile keyed on email; auth.users is the login source of truth).
  const existing = await pool!.query<{ n: string }>(
    `SELECT
       (SELECT COUNT(*) FROM public.users WHERE email = $1)
     + (SELECT COUNT(*) FROM auth.users WHERE lower(email) = $1) AS n`,
    [email],
  )
  if (Number(existing.rows[0]?.n ?? 0) > 0) {
    const err = new Error('Email already registered') as Error & { status: number }
    err.status = 409
    throw err
  }

  const { roleFe, bootstrap } = await resolveRole({ requestedRole: input.role, email })
  if (!bootstrap && isReservedSuperAdminEmail(email)) {
    const err = new Error('This email address is reserved') as Error & { status: number }
    err.status = 403
    throw err
  }
  const id = crypto.randomUUID()
  const userMetadata: Record<string, unknown> = {
    first_name: first,
    last_name: last,
    phone: input.phone?.trim() ?? '',
    role: roleFe,
    profile: input.profile ?? {},
  }
  if (Array.isArray(input.documents) && input.documents.length > 0) {
    userMetadata.documents = input.documents
  }

  await insertGoTrueUser({ id, email, password: input.password, userMetadata })

  // Wait for the row-level trigger to create + link the public.users profile.
  let profileLinked = false
  for (let attempt = 0; attempt < 10; attempt++) {
    const prof = await pool!.query<{ n: string }>(
      'SELECT COUNT(*)::text AS n FROM public.users WHERE auth_user_id = $1',
      [id],
    )
    if (Number(prof.rows[0]?.n ?? 0) > 0) {
      profileLinked = true
      break
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  if (!profileLinked) {
    // Fall back to the SECURITY DEFINER sync function (same one the client's
    // ensure_user_profile RPC path uses), then check once more.
    try {
      await pool!.query('SELECT public.sync_auth_user_profile($1::uuid)', [id])
      const prof = await pool!.query<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM public.users WHERE auth_user_id = $1',
        [id],
      )
      profileLinked = Number(prof.rows[0]?.n ?? 0) > 0
    } catch {
      /* fall through to final check */
    }
  }
  if (!profileLinked) {
    const err = new Error('Account created but profile sync failed — try signing in') as Error & {
      status: number
    }
    err.status = 500
    throw err
  }

  // Prove the account can actually sign in before reporting success.
  const probe = await goTruePasswordSignIn(email, input.password)
  if (!probe.ok) {
    const err = new Error(
      `Account created but sign-in verification failed (status ${probe.status || 'network'}) — try signing in`,
    ) as Error & { status: number }
    err.status = 502
    throw err
  }

  return { authUserId: id, email, roleFe, bootstrap }
}

/** Roles SA / agency-admin mint may assign — broader than public self-register. */
export const STAFF_MINT_ROLES = new Set([
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
  'landlord',
  'tenant',
  'contractor',
])

export type LinkStaffAuthInput = {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
  roleFe: string
  /** public.users.id already written by upsertUser */
  profileId: string
}

export type LinkStaffAuthResult = {
  authUserId: string
  email: string
  roleFe: string
  repairedOrphan: boolean
}

function statusError(message: string, status: number): Error & { status: number } {
  const err = new Error(message) as Error & { status: number }
  err.status = status
  return err
}

/**
 * SA / staff mint: ensure auth.users (+ identity) exists for an already-upserted
 * public.users row, link auth_user_id, and verify a real GoTrue password grant
 * before the caller reports success. Repairs Kelly-style orphans (profile with
 * auth_user_id NULL, no auth.users row) on the same email.
 *
 * Shared with registerSupabaseUserDirect (insertGoTrueUser + goTruePasswordSignIn).
 */
export async function linkStaffAuthUser(input: LinkStaffAuthInput): Promise<LinkStaffAuthResult> {
  if (!directRegisterConfigured()) {
    throw statusError('DATABASE_URL is not configured', 503)
  }
  const email = input.email.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw statusError('Valid email is required', 400)
  }
  if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
    throw statusError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400)
  }
  const roleFe = (input.roleFe || 'tenant').trim()
  if (!STAFF_MINT_ROLES.has(roleFe)) {
    throw statusError(`Role not allowed for staff mint: ${roleFe}`, 400)
  }
  const first = input.firstName?.trim()
  const last = input.lastName?.trim()
  if (!first || !last) {
    throw statusError('First name and surname are required', 400)
  }
  if (!input.profileId) {
    throw statusError('profileId is required', 400)
  }

  const existingAuth = await pool!.query<{ id: string }>(
    `SELECT id::text AS id FROM auth.users WHERE lower(email) = $1 LIMIT 1`,
    [email],
  )
  let authUserId = existingAuth.rows[0]?.id ?? null
  let repairedOrphan = false

  const userMetadata: Record<string, unknown> = {
    first_name: first,
    last_name: last,
    phone: input.phone?.trim() ?? '',
    role: roleFe,
  }

  if (!authUserId) {
    authUserId = crypto.randomUUID()
    await insertGoTrueUser({
      id: authUserId,
      email,
      password: input.password,
      userMetadata,
    })
    repairedOrphan = true
  } else {
    // Re-mint / password rotate for an existing Auth row (e.g. retry after failed link).
    await pool!.query(
      `UPDATE auth.users
       SET encrypted_password = crypt($2, gen_salt('bf', 10)),
           email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
           raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || $3::jsonb,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [authUserId, input.password, JSON.stringify(userMetadata)],
    )
    const identityData = JSON.stringify({
      sub: authUserId,
      email,
      email_verified: true,
      phone_verified: false,
    })
    try {
      await pool!.query(
        `INSERT INTO auth.identities (
           id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
         )
         SELECT $1::uuid, $2::uuid, $3::jsonb, 'email', $4, NOW(), NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM auth.identities WHERE user_id = $2::uuid AND provider = 'email'
         )`,
        [crypto.randomUUID(), authUserId, identityData, email],
      )
    } catch {
      await pool!.query(
        `INSERT INTO auth.identities (
           id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
         )
         SELECT $1::uuid, $2::uuid, $3::jsonb, 'email', NOW(), NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM auth.identities WHERE user_id = $2::uuid AND provider = 'email'
         )`,
        [crypto.randomUUID(), authUserId, identityData],
      )
    }
  }

  // P0 residual: only THIS mint profileId counts as linked. An any-row poll
  // (auth_user_id = $auth OR id=$profile AND auth_user_id IS NOT NULL) could
  // return OK while the upsertUser row stayed NULL — Kelly r13c/r13d orphan.
  const profileLinked = async (): Promise<boolean> => {
    const prof = await pool!.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM public.users
       WHERE id = $1::uuid AND auth_user_id = $2::uuid`,
      [input.profileId, authUserId],
    )
    return Number(prof.rows[0]?.n ?? 0) > 0
  }

  let linked = false
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await profileLinked()) {
      linked = true
      break
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  if (!linked) {
    await pool!.query(
      `UPDATE public.users
       SET auth_user_id = $1::uuid, updated_at = NOW()
       WHERE id = $2::uuid AND (auth_user_id IS NULL OR auth_user_id = $1::uuid)`,
      [authUserId, input.profileId],
    )
    // Also link by email if a prior orphan row shares the email (repair path).
    await pool!.query(
      `UPDATE public.users
       SET auth_user_id = $1::uuid, updated_at = NOW()
       WHERE lower(email) = $2 AND auth_user_id IS NULL`,
      [authUserId, email],
    )
    linked = await profileLinked()
  }
  if (!linked) {
    try {
      await pool!.query('SELECT public.sync_auth_user_profile($1::uuid)', [authUserId])
      linked = await profileLinked()
    } catch {
      /* fall through */
    }
  }
  if (!linked) {
    throw statusError('Auth user created but profile link failed for mint profileId', 500)
  }

  const probe = await goTruePasswordSignIn(email, input.password)
  if (!probe.ok) {
    throw statusError(
      `Auth linked but sign-in verification failed (status ${probe.status || 'network'})`,
      502,
    )
  }

  return { authUserId, email, roleFe, repairedOrphan }
}
