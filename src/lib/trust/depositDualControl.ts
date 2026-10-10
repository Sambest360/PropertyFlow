/**
 * DQ-M2 Mode A — deposit register + dual-control release (in-app status only).
 * No PayProp / bank HTTP; submit/release_approved ≠ settled / refunded.
 */

import type { DepositHolding, PayoutInstruction } from '../../types/domain'

export const DEPOSIT_PERSIST_RESOURCE = 'deposit_holding' as const
export const PAYOUT_PERSIST_RESOURCE = 'payout_instruction' as const

export type DualControlResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

/** Create or refresh a held deposit row (Mode A register). */
export function buildHeldDeposit(params: {
  id: string
  agencyId: string
  occupancyId: string
  expectedCents: number
  heldCents: number
  statutoryDeadlineOn?: string | null
  interestAccruedCents?: number
  interestRateUnknown?: boolean
  existing?: DepositHolding | null
  now: string
}): DualControlResult<DepositHolding> {
  const occupancyId = params.occupancyId.trim()
  if (!occupancyId) return { ok: false, error: 'Occupancy id is required' }
  if (!params.agencyId) return { ok: false, error: 'Agency id is required' }
  const expectedCents = Math.max(0, Math.round(params.expectedCents))
  const heldCents = Math.max(0, Math.round(params.heldCents))
  if (heldCents <= 0) return { ok: false, error: 'Held amount must be greater than zero' }

  const base = params.existing
  const row: DepositHolding = {
    id: params.id,
    agencyId: params.agencyId,
    occupancyId,
    expectedCents,
    heldCents,
    interestAccruedCents: params.interestAccruedCents ?? base?.interestAccruedCents ?? 0,
    status: 'held',
    statutoryDeadlineOn:
      params.statutoryDeadlineOn !== undefined
        ? params.statutoryDeadlineOn
        : (base?.statutoryDeadlineOn ?? null),
    interestRateUnknown: params.interestRateUnknown ?? base?.interestRateUnknown ?? true,
    releaseProposedBy: null,
    releaseApprovedBy: null,
    createdAt: base?.createdAt ?? params.now,
    updatedAt: params.now,
  }
  return { ok: true, value: row }
}

/** Propose release — held → release_proposed; records proposer for dual control. */
export function proposeDepositRelease(
  deposit: DepositHolding,
  actorUserId: string,
  now: string,
): DualControlResult<DepositHolding> {
  if (!actorUserId) return { ok: false, error: 'Actor required' }
  if (deposit.status !== 'held') {
    return { ok: false, error: `Deposit is ${deposit.status} — only held deposits can propose release` }
  }
  return {
    ok: true,
    value: {
      ...deposit,
      status: 'release_proposed',
      releaseProposedBy: actorUserId,
      releaseApprovedBy: null,
      updatedAt: now,
    },
  }
}

/** Approve release — dual control: proposer ≠ approver by user id. */
export function approveDepositRelease(
  deposit: DepositHolding,
  approverUserId: string,
  now: string,
): DualControlResult<DepositHolding> {
  if (!approverUserId) return { ok: false, error: 'Approver required' }
  if (deposit.status !== 'release_proposed') {
    return {
      ok: false,
      error: `Deposit is ${deposit.status} — only release_proposed can be approved`,
    }
  }
  if (!deposit.releaseProposedBy) {
    return { ok: false, error: 'Release has no proposer — cannot dual-control approve' }
  }
  if (deposit.releaseProposedBy === approverUserId) {
    return { ok: false, error: 'Dual control: the proposer cannot approve their own deposit release' }
  }
  return {
    ok: true,
    value: {
      ...deposit,
      status: 'release_approved',
      releaseApprovedBy: approverUserId,
      updatedAt: now,
    },
  }
}

/** Propose a payout instruction (durable create; status proposed only). */
export function buildProposedPayout(params: {
  id: string
  agencyId: string
  occupancyId: string | null
  propertyId: string
  payeeType: string
  payeeId: string
  bankAccountId: string
  amountCents: number
  bucketCode: string
  proposedBy: string
  idempotencyKey: string
  now: string
}): DualControlResult<PayoutInstruction> {
  if (!params.agencyId) return { ok: false, error: 'Agency id is required' }
  if (!params.proposedBy) return { ok: false, error: 'Proposer required' }
  const amountCents = Math.max(0, Math.round(params.amountCents))
  if (amountCents <= 0) return { ok: false, error: 'Amount must be greater than zero' }

  const row: PayoutInstruction = {
    id: params.id,
    agencyId: params.agencyId,
    occupancyId: params.occupancyId,
    propertyId: params.propertyId,
    payeeType: params.payeeType || 'landlord',
    payeeId: params.payeeId,
    bankAccountId: params.bankAccountId,
    amountCents,
    bucketCode: params.bucketCode || 'owner_payable',
    status: 'proposed',
    proposedBy: params.proposedBy,
    approvedBy: null,
    submittedAt: null,
    settledAt: null,
    partnerPayoutId: null,
    failureReason: null,
    idempotencyKey: params.idempotencyKey || params.id,
    createdAt: params.now,
    updatedAt: params.now,
  }
  return { ok: true, value: row }
}

/** Approve payout — proposer ≠ approver; proposed | pending_approval → approved. */
export function applyApprovePayout(
  inst: PayoutInstruction,
  approverUserId: string,
  now: string,
): DualControlResult<PayoutInstruction> {
  if (!approverUserId) return { ok: false, error: 'Approver required' }
  if (inst.status !== 'proposed' && inst.status !== 'pending_approval') {
    return { ok: false, error: `Payout is ${inst.status} — only proposed payouts can be approved` }
  }
  if (inst.proposedBy === approverUserId) {
    return { ok: false, error: 'Dual control: the proposer cannot approve their own payout' }
  }
  return {
    ok: true,
    value: {
      ...inst,
      status: 'approved',
      approvedBy: approverUserId,
      updatedAt: now,
    },
  }
}

/**
 * Submit approved payout → submitted only.
 * Honesty: never invent settled / partnerPayoutId.
 */
export function applySubmitPayout(
  inst: PayoutInstruction,
  actorUserId: string,
  now: string,
): DualControlResult<PayoutInstruction> {
  if (!actorUserId) return { ok: false, error: 'Actor required' }
  if (inst.status !== 'approved') {
    return { ok: false, error: 'Payout must be approved before submission' }
  }
  return {
    ok: true,
    value: {
      ...inst,
      status: 'submitted',
      submittedAt: now,
      settledAt: null,
      partnerPayoutId: null,
      updatedAt: now,
    },
  }
}

/** D2 copy for a recorded refund. Never "Refunded", "paid" or "settled". */
export const DEPOSIT_REFUND_RECORDED_LABEL = 'Refund recorded (not bank-confirmed)'

/** Shown when deposit releases are attempted without the server API. */
export const DEPOSIT_NEEDS_SERVER_COPY = 'Deposit releases need the server. Ask your administrator.'

export type RefundSplitInput = {
  refundedCents: number
  interestCents: number
  deductions: { reason: string; amountCents: number }[]
}

/** Client-side mirror of the server check: refunded + deductions = held + interest. */
export function checkRefundSplit(heldCents: number, split: RefundSplitInput): string | null {
  const ints = [split.refundedCents, split.interestCents, ...split.deductions.map((d) => d.amountCents)]
  if (ints.some((n) => !Number.isInteger(n) || n < 0)) return 'Amounts must be whole cents, 0 or more'
  for (const [i, d] of split.deductions.entries()) {
    if (!d.reason.trim()) return `Deduction ${i + 1} needs a reason`
    if (d.amountCents <= 0) return `Deduction ${i + 1} must be more than 0`
  }
  const deducted = split.deductions.reduce((s, d) => s + d.amountCents, 0)
  if (split.refundedCents + deducted !== heldCents + split.interestCents) {
    return 'Refunded plus deductions must equal held plus interest'
  }
  return null
}
