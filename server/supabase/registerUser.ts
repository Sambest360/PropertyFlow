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
import { passwordMeetsPolicy } from '../../src/lib/auth/passwordStrength.js'
import { pool, databaseConfigured } from '../db.js'

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

/** Portal roles only. An empty users table does not become super admin. */
export function resolveSignupRole(requestedRole?: string): string {
  let roleFe = (requestedRole ?? 'tenant').trim() || 'tenant'
  const allowedPublic = new Set(['tenant', 'landlord', 'contractor', 'applicant'])
  if (!allowedPublic.has(roleFe) || roleFe === 'applicant') roleFe = 'tenant'
  return roleFe
}

async function resolveRole(input: { requestedRole?: string; email: string }): Promise<{
  roleFe: string
  bootstrap: boolean
}> {
  return { roleFe: resolveSignupRole(input.requestedRole), bootstrap: false }
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
  const passwordPolicy = passwordMeetsPolicy(input.password ?? '')
  if (!passwordPolicy.ok) {
    const err = new Error(passwordPolicy.message) as Error & { status: number }
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
