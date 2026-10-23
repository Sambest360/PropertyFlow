/**
 * Client for the lease inspection routes (server/inspectionRoutes.ts). Uses the
 * same auth as other /api calls: the Supabase access token in Supabase mode,
 * the API session token otherwise.
 */
import { actorHeaders } from '../api/actorAuth'
import { resolveApiAuthorizationHeader } from '../api/authClient'
import { isApiEnabled, isSupabaseMode } from '../api/config'

/** Inspections live on the server only; the offline demo store has no copy. */
export const inspectionsAvailable = isSupabaseMode || isApiEnabled

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

async function headers(json: boolean): Promise<Record<string, string>> {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...actorHeaders(),
    ...(await resolveApiAuthorizationHeader()),
  }
}

export async function inspectionApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(await headers(true)), ...(init?.headers as Record<string, string> | undefined) },
  })
  const body = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`)
  return body
}

/** Stored photos / PDFs need the auth header, so they load as object URLs. */
export async function inspectionFileObjectUrl(path: string): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include', headers: await headers(false) })
  if (!res.ok) throw new Error(`Could not load the file (${res.status})`)
  return URL.createObjectURL(await res.blob())
}
