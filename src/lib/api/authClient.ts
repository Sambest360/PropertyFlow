/**
 * Client auth API (login / register / session).
 */
import { setApiActor, type DemoActor } from './actorAuth'
import { isApiEnabled } from './config'
import { isSupabaseConfigured } from '../../utils/supabase/env'
import type { UserVerification, VerificationDocument, VerificationProfile } from '../verification'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''
const TOKEN_KEY = 'propertyflow-auth-token'

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

/** Bearer token for the Hono API: the Supabase access token when a session exists, otherwise the legacy API token. */
export async function apiAuthHeaders(): Promise<Record<string, string>> {
  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import('../../utils/supabase/client')
      const { data } = await createClient().auth.getSession()
      const accessToken = data.session?.access_token
      if (accessToken) return { Authorization: `Bearer ${accessToken}` }
    } catch {
      /* fall through to the legacy token */
    }
  }
  return authHeaders()
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

export async function apiUpdateUserVerification(input: {
  userId: string
  status: 'approved' | 'rejected'
  rejectNote?: string
}): Promise<AuthUserDto> {
  // Supabase mode: still go through the server route (so the decision email +
  // in-app notification fire server-side), passing the supabase JWT for the
  // server to validate. The route is the single decision path in both modes.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await apiAuthHeaders()),
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

export async function apiLogout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...(await apiAuthHeaders()) },
    })
  } finally {
    writeAuthToken(null)
    setApiActor(null)
  }
}

export async function apiMe(timeoutMs = 3000): Promise<AuthUserDto | null> {
  const headers = await apiAuthHeaders()
  if (!headers.Authorization) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      credentials: 'include',
      headers,
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
