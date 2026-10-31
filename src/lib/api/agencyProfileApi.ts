/** Client for listing contact cards, agency public profiles and profile photos (server/agencyProfileRoutes.ts). */
import { actorHeaders } from './actorAuth'
import { resolveApiAuthorizationHeader } from './authClient'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

export type AgencyPublicProfile = {
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  description: string | null
  logoUrl: string | null
}

export type PublicListingContact = {
  agency: (AgencyPublicProfile & { name: string; area: string | null }) | null
  person: { name: string; role: string; photoUrl: string | null; phone: string | null } | null
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = await resolveApiAuthorizationHeader().catch(() => ({}))
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...actorHeaders(), ...auth, ...init?.headers },
  })
  const json = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`)
  return json
}

/** Public: null when the listing is not public or the request failed. */
export async function fetchListingContact(listingId: string): Promise<PublicListingContact | null> {
  try {
    const res = await fetch(`${API_BASE}/api/public/listings/${encodeURIComponent(listingId)}/contact`)
    if (!res.ok) return null
    return (await res.json()) as PublicListingContact
  } catch {
    return null
  }
}

export async function fetchAgencyProfile(agencyId: string) {
  const r = await call<{ profile: AgencyPublicProfile & { name: string; canEdit: boolean } }>(
    `/api/agencies/${encodeURIComponent(agencyId)}/public-profile`,
  )
  return r.profile
}

/** `logo`: data URL to upload, null to remove, omitted to keep. */
export async function saveAgencyProfile(
  agencyId: string,
  edit: Omit<AgencyPublicProfile, 'logoUrl'> & { logo?: string | null },
): Promise<AgencyPublicProfile> {
  const r = await call<{ profile: AgencyPublicProfile }>(`/api/agencies/${encodeURIComponent(agencyId)}/public-profile`, {
    method: 'PUT',
    body: JSON.stringify(edit),
  })
  return r.profile
}

export async function fetchUserPhoto(userId: string) {
  return call<{ avatarUrl: string | null; canEdit: boolean }>(`/api/users/${encodeURIComponent(userId)}/photo`)
}

/** Data URL to set, null to remove. */
export async function saveUserPhoto(userId: string, photo: string | null) {
  return call<{ avatarUrl: string | null }>(`/api/users/${encodeURIComponent(userId)}/photo`, {
    method: 'PUT',
    body: JSON.stringify({ photo }),
  })
}
