/** Trust cashbook vs bank (server/trustBankRoutes.ts). */
import { actorHeaders } from './actorAuth'
import { authHeaders } from './authClient'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

export type RecordedReconciliation = {
  asOf: string
  bankBalanceCents: number
  ledgerBalanceCents: number
  differenceCents: number
  recordedAt: string
}

export type TrustReconciliation = {
  asOf: string
  ledgerBalanceCents: number
  unallocatedCount: number
  unallocatedCents: number
  last: RecordedReconciliation | null
}

type Result<T> = { ok: true; data: T; error?: undefined } | { ok: false; error: string; data?: undefined }

async function call<T>(path: string, init?: { method: 'POST'; body: Record<string, unknown> }): Promise<Result<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: { ...(init ? { 'Content-Type': 'application/json' } : {}), ...actorHeaders(), ...authHeaders() },
      credentials: 'include',
      body: init ? JSON.stringify(init.body) : undefined,
    })
    const body = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string }
    if (!res.ok) return { ok: false, error: body.message || body.error || `Request failed (${res.status})` }
    return { ok: true, data: body }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// agencyId is only read for a super admin; staff are pinned to their own agency server-side.
export function fetchTrustReconciliation(agencyId: string, asOf: string) {
  const q = new URLSearchParams({ asOf, agencyId })
  return call<TrustReconciliation>(`/api/trust/reconciliation?${q}`)
}

export function recordTrustReconciliation(agencyId: string, asOf: string, bankBalanceCents: number) {
  return call<{ ok: true; reconciliation: RecordedReconciliation }>('/api/trust/reconciliation', {
    method: 'POST',
    body: { agencyId, asOf, bankBalanceCents },
  })
}

export function fetchExistingPartnerTxnIds(agencyId: string, partnerTxnIds: string[]) {
  return call<{ existing: string[] }>('/api/trust/existing-partner-ids', {
    method: 'POST',
    body: { agencyId, partnerTxnIds },
  })
}
