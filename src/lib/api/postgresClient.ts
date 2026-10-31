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
  /** False until maintenance_tickets.access_notes exists (migration 013). */
  ticketAccessNotesSupported?: boolean
  /** False until units.erf_size_sqm exists (migration 037, T2). */
  unitErfSizeSupported?: boolean
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
  leaseSignEvents?: unknown[]
  invoices?: unknown[]
  lookups?: unknown[]
  /** Trust & Banking books (P0-7) — agency-scoped, present when authed. */
  trustTransactions?: unknown[]
  trustAllocations?: unknown[]
  payoutInstructions?: unknown[]
  depositHoldings?: unknown[]
  arrearsSnapshots?: unknown[]
  csvImportBatches?: unknown[]
  /** CR7 help desk — own submissions + the viewer's desk (server-filtered). */
  supportTickets?: unknown[]
  /** Guest marketplace RPC/API failed (distinct from legitimately zero listings). */
  marketplaceFetchFailed?: boolean
  infraRooms?: unknown[]
  internalAssets?: unknown[]
  /** entity_id_map rows for client-side UUID → FE route redirects (not shown in UI). */
  idMapRows?: Array<{ entity_type: string; backend_id: string; frontend_id: string }>
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
 * Nearest-first browse: the point the marketplace list is fetched around,
 * rounded to 2 decimals (~1 km). Memory only (never stored), and sent in a
 * header rather than the URL so it stays out of access logs.
 */
let marketplaceNear: { lat: number; lng: number; mode: 'rent' | 'buy' | null } | null = null

/** Returns true when the point (or mode) changed, i.e. the list should be fetched again. */
export function setMarketplaceNearPoint(
  point: { lat: number; lng: number; mode?: string | null } | null,
): boolean {
  const next: typeof marketplaceNear = point
    ? {
        lat: Math.round(point.lat * 100) / 100,
        lng: Math.round(point.lng * 100) / 100,
        mode: point.mode === 'rent' || point.mode === 'buy' ? point.mode : null,
      }
    : null
  const same =
    next === marketplaceNear ||
    (next != null &&
      marketplaceNear != null &&
      next.lat === marketplaceNear.lat &&
      next.lng === marketplaceNear.lng &&
      next.mode === marketplaceNear.mode)
  marketplaceNear = next
  return !same
}

export function marketplaceNearHeaders(): Record<string, string> {
  if (!marketplaceNear) return {}
  const { lat, lng, mode } = marketplaceNear
  return { 'X-Browse-Near': [lat, lng, mode].filter((v) => v != null).join(',') }
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
      ...(marketplaceNear ? { headers: marketplaceNearHeaders() } : {}),
    })
    if (!res.ok) return null
    return (await res.json()) as PostgresBootstrap
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/** Home hero: suburbs / cities with published listings (null when the API is off or fails). */
export async function fetchPublicMarketplaceAreas(
  timeoutMs = 8_000,
): Promise<import('../listingAreas').ListingArea[] | null> {
  if (!isApiEnabled) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/api/public/marketplace/areas`, { signal: ctrl.signal })
    if (!res.ok) return null
    const body = (await res.json()) as { areas?: unknown }
    return Array.isArray(body.areas) ? (body.areas as import('../listingAreas').ListingArea[]) : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/** P3a / FW-04: one published listing bootstrap slice (works signed-in; no session required). */
export async function fetchPublicListingBootstrapFromApi(
  id: string,
  timeoutMs = 10_000,
): Promise<PostgresBootstrap | null> {
  if (!isApiEnabled || !id) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/api/public/marketplace?id=${encodeURIComponent(id)}`, {
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

/** P3a: all photos of one public listing (guest list cards carry one). Null if unavailable. */
export async function fetchPublicListingImages(id: string, timeoutMs = 10_000): Promise<string[] | null> {
  if (!isApiEnabled || !id) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/api/public/marketplace?id=${encodeURIComponent(id)}`, { signal: ctrl.signal })
    if (!res.ok) return null
    const json = (await res.json()) as { properties?: Array<{ id?: string; images?: unknown }> }
    const p = json.properties?.find((x) => x.id === id)
    return Array.isArray(p?.images) ? (p!.images as unknown[]).filter((x): x is string => typeof x === 'string') : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}
