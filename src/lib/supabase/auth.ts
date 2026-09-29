import { createClient } from '../../utils/supabase/client'
import { isSupabaseConfigured } from '../../utils/supabase/env'
import { RegistrationRedirectError } from '../auth/registrationErrors'
import type { AppUser, Role } from '../../types/domain'
import type { UserVerification, VerificationDocument } from '../verification'
import { EMAIL_TO_USER, resolveFrontendRole } from './idMap.js'
import type { AuthUserDto } from '../api/authClient'

export function supabaseAuthEnabled(): boolean {
  return isSupabaseConfigured()
}

function rowToAppUser(row: {
  metadata: Record<string, unknown> | null
  email: string
  first_name: string
  last_name: string
  phone: string | null
  role: string
  active: boolean
  client_id: string | null
  clients?: { settings: Record<string, unknown> | null } | null
}): AppUser {
  const meta = row.metadata ?? {}
  const frontendId =
    typeof meta.frontend_id === 'string' && meta.frontend_id
      ? meta.frontend_id
      : EMAIL_TO_USER[row.email.toLowerCase()] ?? row.email.toLowerCase()
  const feRole = resolveFrontendRole(row.role, meta, row.email)
  const verification =
    meta.verification && typeof meta.verification === 'object'
      ? (meta.verification as UserVerification)
      : undefined
  const profile =
    verification?.profile && typeof verification.profile === 'object'
      ? verification.profile
      : null
  const agencyFe =
    row.clients?.settings && typeof row.clients.settings.frontend_id === 'string'
      ? row.clients.settings.frontend_id
      : null

  return {
    id: frontendId,
    name: `${row.first_name} ${row.last_name}`.trim(),
    email: row.email,
    role: feRole as Role,
    agencyId: agencyFe,
    phone: row.phone ?? undefined,
    active: row.active,
    enabledPermissions: Array.isArray(meta.enabledPermissions)
      ? (meta.enabledPermissions as AppUser['enabledPermissions'])
      : undefined,
    licenseStatus: (meta.licenseStatus as AppUser['licenseStatus']) ?? undefined,
    mentorId: (meta.mentorId as string | null | undefined) ?? undefined,
    commissionSharePct:
      typeof meta.commissionSharePct === 'number' ? meta.commissionSharePct : undefined,
    company:
      typeof profile?.company === 'string'
        ? profile.company
        : typeof meta.company === 'string'
          ? meta.company
          : undefined,
    idNumberOrPassport:
      typeof profile?.idNumberOrPassport === 'string'
        ? profile.idNumberOrPassport
        : typeof meta.idNumberOrPassport === 'string'
          ? meta.idNumberOrPassport
          : undefined,
    verification,
  }
}

export function appUserToDto(user: AppUser): AuthUserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    agencyId: user.agencyId,
    phone: user.phone,
    active: user.active,
    enabledPermissions: user.enabledPermissions,
    licenseStatus: user.licenseStatus ?? null,
    mentorId: user.mentorId ?? null,
    commissionSharePct: user.commissionSharePct ?? null,
    company: user.company,
    idNumberOrPassport: user.idNumberOrPassport,
    verification: user.verification,
  }
}

export async function loadProfileForSession(authUserId: string): Promise<AppUser | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('users')
    .select('email, first_name, last_name, phone, role, active, client_id, metadata')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (error || !data) {
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData.session?.user?.id === authUserId) {
      await supabase.rpc('ensure_user_profile')
      const retry = await supabase
        .from('users')
        .select('email, first_name, last_name, phone, role, active, client_id, metadata')
        .eq('auth_user_id', authUserId)
        .maybeSingle()
      if (!retry.error && retry.data) {
        return rowToAppUserFromRow(retry.data, supabase)
      }
    }
    return null
  }

  return rowToAppUserFromRow(data, supabase)
}

async function rowToAppUserFromRow(
  data: {
    email: string
    first_name: string
    last_name: string
    phone: string | null
    role: string
    active: boolean
    client_id: string | null
    metadata: Record<string, unknown> | null
  },
  supabase: ReturnType<typeof createClient>,
): Promise<AppUser> {
  let agencySettings: Record<string, unknown> | null = null
  if (data.client_id) {
    const { data: clientRow } = await supabase
      .from('clients')
      .select('settings')
      .eq('id', data.client_id)
      .maybeSingle()
    agencySettings = (clientRow?.settings as Record<string, unknown> | null) ?? null
  }

  return rowToAppUser({
    ...data,
    clients: agencySettings ? { settings: agencySettings } : null,
  })
}

async function ensureSessionAfterSignUp(
  supabase: ReturnType<typeof createClient>,
  email: string,
  password: string,
  signUpSession: { access_token: string } | null,
  authUserId: string,
): Promise<string> {
  if (signUpSession) return authUserId

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) {
    const lower = error.message.toLowerCase()
    if (
      lower.includes('confirm') ||
      lower.includes('not confirmed') ||
      lower.includes('verification')
    ) {
      throw new RegistrationRedirectError('email_confirmation', email.trim())
    }
    throw new RegistrationRedirectError('sign_in_required', email.trim())
  }
  return data.user?.id ?? authUserId
}

export async function supabaseBootstrapNeeded(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false
  const supabase = createClient()
  const { data, error } = await supabase.rpc('auth_bootstrap_needed')
  if (error) {
    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true })
    return (count ?? 0) === 0
  }
  return Boolean(data)
}

export async function supabaseSignIn(email: string, password: string): Promise<AppUser> {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) {
    const status = typeof error.status === 'number' ? error.status : undefined
    const raw = (error.message || '').trim()
    if (status && status >= 500) {
      throw new Error(`Server error (${status}): ${raw || 'unexpected_failure'}`)
    }
    if (status === 429) {
      throw new Error(`Too many requests (${status}): ${raw || 'rate limit'}`)
    }
    throw new Error(raw || (status ? `Sign-in failed (${status})` : 'Sign-in failed'))
  }
  if (!data.user) throw new Error('Sign-in failed')

  // Trigger may need a moment to create public.users on first signup
  let profile = await loadProfileForSession(data.user.id)
  if (!profile) {
    await new Promise((r) => setTimeout(r, 400))
    profile = await loadProfileForSession(data.user.id)
  }
  if (!profile) throw new Error('Profile not found — contact support')
  if (!profile.active) throw new Error('Account is inactive')
  return profile
}

export type SupabaseRegisterInput = {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
  role?: string
  profile?: Record<string, unknown>
  documents?: unknown[]
}

async function attachRegistrationDocuments(
  authUserId: string,
  role: string,
  profile: Record<string, unknown> | undefined,
  documents: VerificationDocument[],
): Promise<AppUser | null> {
  if (!documents.length || (role !== 'landlord' && role !== 'contractor')) {
    return loadProfileForSession(authUserId)
  }

  const supabase = createClient()
  const { data: row, error: readErr } = await supabase
    .from('users')
    .select('metadata')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (readErr || !row) return loadProfileForSession(authUserId)

  const meta = (row.metadata as Record<string, unknown> | null) ?? {}
  const nextMeta: Record<string, unknown> = {
    ...meta,
    verification: {
      status: 'pending',
      submittedAt: new Date().toISOString(),
      profile: profile ?? {},
      documents,
    },
  }
  if (typeof profile?.company === 'string' && profile.company.trim()) {
    nextMeta.company = profile.company.trim()
  }
  if (typeof profile?.idNumberOrPassport === 'string' && profile.idNumberOrPassport.trim()) {
    nextMeta.idNumberOrPassport = profile.idNumberOrPassport.trim()
  }

  const { error: updateErr } = await supabase
    .from('users')
    .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
    .eq('auth_user_id', authUserId)

  if (updateErr) throw new Error(updateErr.message)
  return loadProfileForSession(authUserId)
}

export async function supabaseAttachPendingRegistrationDocs(input: {
  authUserId: string
  role: string
  profile?: Record<string, unknown>
  documents: VerificationDocument[]
}): Promise<AppUser | null> {
  return attachRegistrationDocuments(
    input.authUserId,
    input.role,
    input.profile,
    input.documents,
  )
}

const SUPABASE_API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

/**
 * Direct server registration (see server/supabase/registerUser.ts): the server
 * creates the pre-confirmed GoTrue user via SQL, skipping the /auth/v1/signup
 * endpoint whose confirmation-email quota (429 over_email_send_rate_limit)
 * and plus-address validator (400 email_address_invalid) were blocking new
 * registrations. Returns null when the route is unavailable so callers can
 * fall back to the legacy signup path.
 */
async function supabaseSignUpViaServer(
  input: SupabaseRegisterInput,
): Promise<{ authUserId: string; bootstrap: boolean } | null> {
  const documents = (input.documents ?? []) as VerificationDocument[]
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 20_000)
    const { authHeaders } = await import('../api/authClient')
    const res = await fetch(`${SUPABASE_API_BASE}/api/auth/register-supabase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      credentials: 'include',
      signal: ctrl.signal,
      body: JSON.stringify({
        email: input.email.trim(),
        password: input.password,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        role: input.role,
        profile: input.profile,
        documents,
      }),
    })
    clearTimeout(t)
    if (res.status === 404) return null // route not deployed → legacy path
    // Vercel currently rewrites /api/* to the SPA (HTTP 200 text/html). That is
    // not a successful registration — fall back to GoTrue signup.
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) return null
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      authUserId?: string
      bootstrap?: boolean
      message?: string
    }
    if (!res.ok) {
      // Server created the account but its post-create checks failed — same
      // UX contract: success flow to sign-in, not an error dialog.
      const srvMsg = data.message?.toLowerCase() ?? ''
      if (srvMsg.includes('profile sync failed') || srvMsg.includes('sign-in verification failed')) {
        throw new RegistrationRedirectError('sign_in_required', input.email.trim())
      }
      const err = new Error(data.message || `Registration failed (${res.status})`) as Error & {
        status: number
        retryAfterSec?: number
      }
      err.status = res.status
      const retryAfter = Number(res.headers.get('Retry-After'))
      if (Number.isFinite(retryAfter) && retryAfter > 0) err.retryAfterSec = retryAfter
      throw err
    }
    if (!data.authUserId) throw new Error('Registration failed')
    return { authUserId: data.authUserId, bootstrap: Boolean(data.bootstrap) }
  } catch (err) {
    // Network/timeout failures fall back to the legacy path; explicit server
    // rejections (400/409/…) propagate so the user sees the real problem.
    if (err instanceof Error && typeof (err as { status?: number }).status === 'number') throw err
    return null
  }
}

export async function supabaseSignUp(
  input: SupabaseRegisterInput,
): Promise<{ user: AppUser; bootstrap: boolean }> {
  const documents = (input.documents ?? []) as VerificationDocument[]

  // Server-side direct registration first (no confirmation email → no quota,
  // no plus-address validator). Falls back to the legacy GoTrue signup when
  // the route is missing (e.g. API not deployed) or unreachable.
  const viaServer = await supabaseSignUpViaServer(input)
  if (viaServer) {
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email.trim(),
      password: input.password,
    })
    if (error) throw new Error(error.message)
    if (!data.user) throw new Error('Registration failed')

    let profile = await loadProfileForSession(data.user.id)
    for (let i = 0; i < 8 && !profile; i++) {
      await new Promise((r) => setTimeout(r, 400))
      profile = await loadProfileForSession(data.user.id)
    }
    if (!profile) {
      // The account exists and the password grant just succeeded — only the
      // post-signup profile read failed (pooler latency / RLS race). Never
      // render this as an error: send the user to sign-in with the success
      // flow (the docs stash + login-page attach path handles the rest).
      throw new RegistrationRedirectError('sign_in_required', input.email.trim())
    }

    if (documents.length > 0) {
      profile =
        (await attachRegistrationDocuments(
          data.user.id,
          input.role ?? 'tenant',
          input.profile,
          documents,
        )) ?? profile
    }
    return { user: profile, bootstrap: viaServer.bootstrap }
  }

  const bootstrap = await supabaseBootstrapNeeded()
  const supabase = createClient()
  const role = bootstrap ? 'super_admin' : input.role ?? 'tenant'

  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        phone: input.phone?.trim() ?? '',
        role,
        profile: input.profile ?? {},
      },
    },
  })
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Registration failed')

  const authUserId = await ensureSessionAfterSignUp(
    supabase,
    input.email,
    input.password,
    data.session,
    data.user.id,
  )

  let profile = await loadProfileForSession(authUserId)
  for (let i = 0; i < 8 && !profile; i++) {
    await new Promise((r) => setTimeout(r, 400))
    profile = await loadProfileForSession(authUserId)
  }
  if (!profile) {
    // Same contract as the direct path: account exists, only the post-signup
    // profile read failed — never render that as an error dialog.
    throw new RegistrationRedirectError('sign_in_required', input.email.trim())
  }

  if (documents.length > 0) {
    profile =
      (await attachRegistrationDocuments(authUserId, role, input.profile, documents)) ?? profile
  }

  return { user: profile, bootstrap }
}

export async function supabaseSignOut(): Promise<void> {
  const supabase = createClient()
  await supabase.auth.signOut()
}

export async function supabaseGetSessionUser(): Promise<AppUser | null> {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  if (!data.session?.user) return null
  return loadProfileForSession(data.session.user.id)
}

export function onSupabaseAuthChange(
  cb: (user: AppUser | null) => void,
): { unsubscribe: () => void } {
  const supabase = createClient()
  const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) {
      cb(null)
      return
    }
    const profile = await loadProfileForSession(session.user.id)
    cb(profile)
  })
  return { unsubscribe: () => data.subscription.unsubscribe() }
}

export async function supabaseUpdateUserVerification(input: {
  userId: string
  status: 'approved' | 'rejected'
  rejectNote?: string
}): Promise<AppUser> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('admin_update_user_verification', {
    p_frontend_user_id: input.userId,
    p_status: input.status,
    p_reject_note: input.rejectNote ?? null,
  })
  if (error) throw new Error(error.message)

  const session = await supabaseGetSessionUser()
  if (session) return session

  const meta = (data as Record<string, unknown>) ?? {}
  return {
    id: input.userId,
    name: '',
    email: '',
    role: 'tenant',
    agencyId: null,
    active: true,
    verification: meta.verification as UserVerification | undefined,
  }
}
