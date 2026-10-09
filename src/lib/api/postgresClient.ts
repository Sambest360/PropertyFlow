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
  agencyContractors?: unknown[]
  threads: unknown[]
  messages: unknown[]
  notifications: unknown[]
  suiteAlerts?: unknown[]
  activities?: unknown[]
  propertyEvents?: unknown[]
  invoices?: unknown[]
  lookups?: unknown[]
  /** Trust & Banking books (P0-7) — agency-scoped, present when authed. */
  trustTransactions?: unknown[]
  trustAllocations?: unknown[]
  payoutInstructions?: unknown[]
  depositHoldings?: unknown[]
  arrearsSnapshots?: unknown[]
  csvImportBatches?: unknown[]
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

export async function fetchApiHealth(timeoutMs = 800): Promise<boolean> {
  if (!isApiEnabled) return false
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/api/health?db=0`, { signal: ctrl.signal })
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
  lite = true,
): Promise<PostgresBootstrap | null> {
  if (!isApiEnabled) return null
  // No /api/health pre-check (same as #74 for persist): live health pings the
  // database and answered in 1.3-2.3 s, past the old 800 ms abort, so bootstrap
  // returned null without ever asking. The bootstrap response itself decides.
  // The session travels as Bearer (authHeaders) plus the same-origin
  // pf_session cookie; actor headers are only honoured outside production.

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const params = new URLSearchParams()
    if (lite) params.set('lite', '1')
    const qs = params.toString()
    const res = await fetch(`${API_BASE}/api/bootstrap${qs ? `?${qs}` : ''}`, {
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

/**
 * Signed-out marketplace slice (published listings only). /api/bootstrap
 * answers 401 without a session, so guests read this instead.
 */
export async function fetchPublicMarketplaceFromApi(
  timeoutMs = 10_000,
  lite = true,
): Promise<PostgresBootstrap | null> {
  if (!isApiEnabled) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/api/public/marketplace${lite ? '' : '?lite=0'}`, {
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    return (await res.json()) as PostgresBootstrap
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}
