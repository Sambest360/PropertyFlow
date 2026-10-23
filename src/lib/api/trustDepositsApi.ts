/**
 * Deposit release dual control (follow-up to #80): propose / approve go
 * through dedicated server routes that enforce the two-person rule
 * (approver ≠ proposer, same agency, trust permission). Generic persist never
 * moves a deposit's status.
 */
import { actorHeaders } from './actorAuth'
import { authHeaders } from './authClient'
import { assertCanPersistWrites } from '../auth/writeGate'
import type { DepositRefundRecord } from '../../types/domain'

export type DepositTransitionStep =
  | 'propose-release'
  | 'approve-release'
  | 'reject-release'
  | 'cancel-release'
  | 'refund'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

export type DepositTransitionPatch = {
  id: string
  status: 'held' | 'release_proposed' | 'release_approved' | 'refunded'
  releaseProposedBy?: string | null
  releaseApprovedBy?: string | null
  refund?: DepositRefundRecord | null
  updatedAt: string
}

export type DepositTransitionResult =
  | { ok: true; deposit: DepositTransitionPatch }
  | { ok: false; error: string; status?: number }

export async function postDepositTransition(
  depositId: string,
  step: DepositTransitionStep,
  payload: Record<string, unknown> = {},
): Promise<DepositTransitionResult> {
  if (!assertCanPersistWrites()) {
    return { ok: false, error: 'Workspace is still loading. Try again in a moment.' }
  }
  try {
    const res = await fetch(
      `${API_BASE}/api/trust/deposits/${encodeURIComponent(depositId)}/${step}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...actorHeaders(), ...authHeaders() },
        credentials: 'include',
        body: JSON.stringify(payload),
      },
    )
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      deposit?: DepositTransitionPatch
      message?: string
      error?: string
    }
    if (!res.ok || body.ok !== true || !body.deposit) {
      return {
        ok: false,
        status: res.status,
        error: body.message || body.error || `Deposit ${step} failed (${res.status})`,
      }
    }
    return { ok: true, deposit: body.deposit }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Deductions a move-out inspection approved for this deposit (server reads the
 * deposit_deductions_approved hand-off). Empty when there are none or offline.
 */
export async function fetchInspectionDeductions(
  depositId: string,
): Promise<Array<{ reason: string; amountCents: number }>> {
  try {
    const res = await fetch(
      `${API_BASE}/api/trust/deposits/${encodeURIComponent(depositId)}/inspection-deductions`,
      { headers: { ...actorHeaders(), ...authHeaders() }, credentials: 'include' },
    )
    if (!res.ok) return []
    const body = (await res.json().catch(() => ({}))) as { deductions?: Array<{ reason: string; amountCents: number }> }
    return Array.isArray(body.deductions) ? body.deductions : []
  } catch {
    return []
  }
}
