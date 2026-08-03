/**
 * Local Postgres API client (Hono on :8787, proxied via Vite `/api`).
 * Falls back silently when the API is unreachable so `npm run dev` still works.
 */

import { actorHeaders, type DemoActor } from './actorAuth'
import { authHeaders } from './authClient'
import { isApiEnabled } from './config'

export type PostgresBootstrap = {
  source: 'postgres'
  fetchedAt: string
  /** True when payload was filtered for a property-locked actor. */
  scoped?: boolean
  actor?: { userId: string; role: string; agencyId: string | null } | null
  agencies: unknown[]
  users: unknown[]
  buildings: unknown[]
  units: unknown[]
  properties: unknown[]
  leads: unknown[]
  applications: unknown[]
  tenancies: unknown[]
  viewings: unknown[]
  viewingSlots?: unknown[]
  payments: unknown[]
  propertyDocuments: unknown[]
  tickets: unknown[]
  threads: unknown[]
  messages: unknown[]
  notifications: unknown[]
  suiteAlerts?: unknown[]
  activities?: unknown[]
  propertyEvents?: unknown[]
  invoices?: unknown[]
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

export async function fetchApiHealth(timeoutMs = 800): Promise<boolean> {
  if (!isApiEnabled) return false
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: ctrl.signal })
    if (!res.ok) return false
    const json = (await res.json()) as { ok?: boolean }
    return Boolean(json.ok)
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

export async function fetchPostgresBootstrap(
  timeoutMs = 2500,
  actor?: DemoActor | null,
): Promise<PostgresBootstrap | null> {
  if (!isApiEnabled) return null
  const healthy = await fetchApiHealth(Math.min(800, timeoutMs))
  if (!healthy) return null

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/api/bootstrap`, {
      signal: ctrl.signal,
      headers: { ...actorHeaders(actor), ...authHeaders() },
      credentials: 'include',
    })
    if (!res.ok) return null
    return (await res.json()) as PostgresBootstrap
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}
