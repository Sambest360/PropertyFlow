/**
 * Payout dual control (Jim #80 B5): approve / submit go through dedicated
 * server routes that enforce the two-person rule (approver ≠ proposer, same
 * agency, trust.approve_payout). Generic persist only creates proposals.
 */
import { actorHeaders } from './actorAuth'
import { authHeaders } from './authClient'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

export type PayoutTransitionPatch = {
  id: string
  status: 'approved' | 'submitted'
  approvedBy?: string
  submittedAt?: string
  settledAt?: null
  partnerPayoutId?: null
  updatedAt: string
}

export type PayoutTransitionResult =
  | { ok: true; instruction: PayoutTransitionPatch }
  | { ok: false; error: string; status?: number }

export async function postPayoutTransition(
  instructionId: string,
  step: 'approve' | 'submit',
): Promise<PayoutTransitionResult> {
  try {
    const res = await fetch(
      `${API_BASE}/api/trust/payouts/${encodeURIComponent(instructionId)}/${step}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...actorHeaders(), ...authHeaders() },
        credentials: 'include',
        body: '{}',
      },
    )
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      instruction?: PayoutTransitionPatch
      message?: string
      error?: string
    }
    if (!res.ok || body.ok !== true || !body.instruction) {
      return {
        ok: false,
        status: res.status,
        error: body.message || body.error || `Payout ${step} failed (${res.status})`,
      }
    }
    return { ok: true, instruction: body.instruction }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
