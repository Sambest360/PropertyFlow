/**
 * Client auth API (login / register / session).
 */
import { setApiActor, type DemoActor } from './actorAuth'
import { isApiEnabled, isSupabaseMode } from './config'
import type { UserVerification, VerificationDocument, VerificationProfile } from '../verification'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''
const TOKEN_KEY = 'propertyflow-auth-token'

/** Default /api/auth/me probe; cold navigations can exceed a short timeout (L02). */
export const API_ME_TIMEOUT_MS = 8_000
export const API_ME_RETRY_TIMEOUT_MS = 8_000
/** Initial probe + one retry before the shell may treat auth as settled. */
export const SESSION_PROBE_MAX_MS = API_ME_TIMEOUT_MS + API_ME_RETRY_TIMEOUT_MS + 2_000

export type AuthUserDto = {
  id: string
  email: string
  name: string
  role: string
  agencyId: string | null
  phone?: string
  active: boolean
  enabledPermissions?: string[]
  licenseStatus?: string | null
  mentorId?: string | null
  commissionSharePct?: number | null
  company?: string
  idNumberOrPassport?: string
  verification?: UserVerification
  /** D3: set after a staff reset; the server allows only me / change-password / logout. */
  mustChangePassword?: boolean
}

export type AuthResponse = {
  ok: boolean
  token?: string
  user: AuthUserDto
  bootstrap?: boolean
}

export function readAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function writeAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export function authHeaders(): Record<string, string> {
  const token = readAuthToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

/**
 * Authorization for same-origin /api/* calls. Supabase mode must send the GoTrue
 * access token — never a stale propertyflow-auth-token from API-mode Neon.
 */
export async function resolveApiAuthorizationHeader(): Promise<Record<string, string>> {
  if (!isSupabaseMode) return authHeaders()
  try {
    const { createClient } = await import('../../utils/supabase/client')
    const supabase = createClient()
    let session = (await supabase.auth.getSession()).data.session
    if (!session?.access_token) {
      const refreshed = await supabase.auth.refreshSession()
      session = refreshed.data.session ?? session
    }
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` }
    }
  } catch {
    /* ignore */
  }
  return {}
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string }
  if (!res.ok) {
    const msg =
      (data as { message?: string }).message ||
      (data as { error?: string }).error ||
      `Request failed (${res.status})`
    const err = new Error(msg) as Error & { status: number; retryAfterSec?: number }
    err.status = res.status
    const retryAfter = Number(res.headers.get('Retry-After'))
    if (Number.isFinite(retryAfter) && retryAfter > 0) err.retryAfterSec = retryAfter
    throw err
  }
  return data
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15000,
): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (err) {
    if (ctrl.signal.aborted) {
      // P0-2: keep an explicit, retryable failure — never leave the app hanging.
      throw new Error(
        'The request timed out. Please check your connection and try again.',
      )
    }
    throw err
  } finally {
    clearTimeout(t)
  }
}

export async function apiRegister(input: {
  email: string
  password: string
  firstName: string
  lastName: string
  /** @deprecated prefer firstName + lastName */
  name?: string
  phone?: string
  role?: string
  profile?: VerificationProfile
  documents?: VerificationDocument[]
}): Promise<AuthResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      firstName: input.firstName,
      lastName: input.lastName,
      name: input.name,
      phone: input.phone,
      role: input.role,
      profile: input.profile,
      documents: input.documents,
    }),
  })
  const data = await parseJson<AuthResponse>(res)
  if (data.token) writeAuthToken(data.token)
  syncActorFromUser(data.user)
  return data
}

async function patchUserVerificationOnServer(
  input: {
    userId: string
    status: 'approved' | 'rejected'
    rejectNote?: string
  },
): Promise<AuthUserDto> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(),
  }
  if (isSupabaseMode) {
    const { createClient } = await import('../../utils/supabase/client')
    const { data } = await createClient().auth.getSession()
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`
  }
  const res = await fetch(
    `${API_BASE}/api/admin/users/${encodeURIComponent(input.userId)}/verification`,
    {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        status: input.status,
        rejectNote: input.rejectNote,
      }),
    },
  )
  const data2 = await parseJson<{ ok: boolean; user: AuthUserDto }>(res)
  return data2.user
}

export async function apiUpdateUserVerification(input: {
  userId: string
  status: 'approved' | 'rejected'
  rejectNote?: string
  /** When set (e.g. from AppStore), fills AuthUserDto fields after Supabase RPC. */
  subject?: Pick<AuthUserDto, 'name' | 'email' | 'role' | 'agencyId' | 'active'>
}): Promise<AuthUserDto> {
  if (isSupabaseMode) {
    const { supabaseUpdateUserVerification } = await import('../supabase/auth')
    const updated = await supabaseUpdateUserVerification(input)
    void patchUserVerificationOnServer(input).catch(() => {
      /* email/notification side effects; RPC already persisted */
    })
    const subject = input.subject
    return {
      id: input.userId,
      email: subject?.email ?? updated.email ?? '',
      name: subject?.name ?? updated.name ?? '',
      role: subject?.role ?? updated.role ?? 'landlord',
      agencyId: subject?.agencyId ?? updated.agencyId ?? null,
      active: subject?.active ?? updated.active ?? true,
      verification: updated.verification,
    }
  }
  return patchUserVerificationOnServer(input)
}

export async function apiLogin(input: {
  email: string
  password: string
}): Promise<AuthResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  const data = await parseJson<AuthResponse>(res)
  if (data.token) writeAuthToken(data.token)
  syncActorFromUser(data.user)
  return data
}

/**
 * Change the signed-in user's password. Goes through the server route that
 * checks the current password (the generic persist route never accepts a
 * password or hash from a non-super user write).
 */
export async function apiChangePassword(input: {
  currentPassword: string
  newPassword: string
}): Promise<AuthUserDto> {
  const res = await fetchWithTimeout(`${API_BASE}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  const data = await parseJson<{ ok: boolean; token?: string; user: AuthUserDto }>(res)
  // The change revokes every older token; the server reissues this session.
  if (data.token) writeAuthToken(data.token)
  return data.user
}

/**
 * D3 staff password reset. Returns the temp password once; callers must show
 * it and never store it (no state beyond the open modal, no localStorage).
 */
export async function apiResetPassword(userId: string): Promise<{ tempPassword: string }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ userId }),
  })
  const data = await parseJson<{ ok: boolean; tempPassword: string }>(res)
  return { tempPassword: data.tempPassword }
}

export async function apiLogout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...authHeaders() },
    })
  } finally {
    writeAuthToken(null)
    setApiActor(null)
  }
}

export async function apiMe(timeoutMs = API_ME_TIMEOUT_MS): Promise<AuthUserDto | null> {
  const token = readAuthToken()
  if (!token) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      credentials: 'include',
      headers: { ...authHeaders() },
      signal: ctrl.signal,
    })
    if (res.status === 401) {
      writeAuthToken(null)
      setApiActor(null)
      return null
    }
    const data = await parseJson<{ ok: boolean; user: AuthUserDto }>(res)
    syncActorFromUser(data.user)
    return data.user
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export async function apiAuthBootstrapNeeded(timeoutMs = 2000): Promise<boolean> {
  if (!isApiEnabled) return false
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/api/auth/bootstrap-needed`, {
      credentials: 'include',
      signal: ctrl.signal,
    })
    if (!res.ok) return false
    const data = (await res.json()) as { needed?: boolean }
    return Boolean(data.needed)
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

export function syncActorFromUser(user: AuthUserDto | null): DemoActor | null {
  if (!user) {
    setApiActor(null)
    return null
  }
  const actor: DemoActor = {
    userId: user.id,
    role: user.role as DemoActor['role'],
    agencyId: user.agencyId,
  }
  setApiActor(actor)
  return actor
}
