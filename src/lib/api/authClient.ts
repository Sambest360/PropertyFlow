/**
 * Client auth API (login / register / session).
 */
import { setApiActor, type DemoActor } from './actorAuth'
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

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string }
  if (!res.ok) {
    const msg =
      (data as { message?: string }).message ||
      (data as { error?: string }).error ||
      `Request failed (${res.status})`
    const err = new Error(msg) as Error & { status: number }
    err.status = res.status
    throw err
  }
  return data
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
  const res = await fetch(`${API_BASE}/api/auth/register`, {
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
  const res = await fetch(
    `${API_BASE}/api/admin/users/${encodeURIComponent(input.userId)}/verification`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify({
        status: input.status,
        rejectNote: input.rejectNote,
      }),
    },
  )
  const data = await parseJson<{ ok: boolean; user: AuthUserDto }>(res)
  return data.user
}

export async function apiLogin(input: {
  email: string
  password: string
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
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
      headers: { ...authHeaders() },
    })
  } finally {
    writeAuthToken(null)
    setApiActor(null)
  }
}

export async function apiMe(): Promise<AuthUserDto | null> {
  const token = readAuthToken()
  if (!token) return null
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      credentials: 'include',
      headers: { ...authHeaders() },
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
  }
}

export async function apiAuthBootstrapNeeded(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/bootstrap-needed`, {
      credentials: 'include',
    })
    if (!res.ok) return false
    const data = (await res.json()) as { needed?: boolean }
    return Boolean(data.needed)
  } catch {
    return false
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
