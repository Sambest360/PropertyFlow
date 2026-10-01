import { describe, expect, it } from 'vitest'
import { TRUST_MODE_A_COPY } from '../../components/trust/TrustModeABanner'
import type { DepositHolding, PayoutInstruction } from '../../types/domain'
import {
  DEPOSIT_PERSIST_RESOURCE,
  PAYOUT_PERSIST_RESOURCE,
  applyApprovePayout,
  applySubmitPayout,
  approveDepositRelease,
  buildHeldDeposit,
  buildProposedPayout,
  proposeDepositRelease,
} from './depositDualControl'

const now = '2026-10-01T12:00:00.000Z'

function baseDeposit(overrides: Partial<DepositHolding> = {}): DepositHolding {
  return {
    id: 'DH-t1',
    agencyId: 'ag-horizon',
    occupancyId: 'TN-1',
    expectedCents: 100_000,
    heldCents: 100_000,
    interestAccruedCents: 0,
    status: 'held',
    statutoryDeadlineOn: null,
    interestRateUnknown: true,
    releaseProposedBy: null,
    releaseApprovedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function basePayout(overrides: Partial<PayoutInstruction> = {}): PayoutInstruction {
  return {
    id: 'PI-t1',
    agencyId: 'ag-horizon',
    occupancyId: 'TN-1',
    propertyId: 'PR-1002',
    payeeType: 'landlord',
    payeeId: 'u-owner1',
    bankAccountId: 'BA-001',
    amountCents: 50_000,
    bucketCode: 'owner_payable',
    status: 'proposed',
    proposedBy: 'u-lerato',
    approvedBy: null,
    submittedAt: null,
    settledAt: null,
    partnerPayoutId: null,
    failureReason: null,
    idempotencyKey: 'PI-t1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('DQ-M2 deposit persist + dual-control', () => {
  it('uses deposit_holding persist resource key', () => {
    expect(DEPOSIT_PERSIST_RESOURCE).toBe('deposit_holding')
    expect(PAYOUT_PERSIST_RESOURCE).toBe('payout_instruction')
  })

  it('buildHeldDeposit creates held status for durable register', () => {
    const r = buildHeldDeposit({
      id: 'DH-new',
      agencyId: 'ag-horizon',
      occupancyId: 'TN-9',
      expectedCents: 25000.4,
      heldCents: 25000.4,
      now,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.status).toBe('held')
    expect(r.value.heldCents).toBe(25000)
    expect(r.value.releaseProposedBy).toBeNull()
  })

  it('propose then approve requires different user ids', () => {
    const held = baseDeposit()
    const proposed = proposeDepositRelease(held, 'u-lerato', now)
    expect(proposed.ok).toBe(true)
    if (!proposed.ok) return
    expect(proposed.value.status).toBe('release_proposed')
    expect(proposed.value.releaseProposedBy).toBe('u-lerato')

    const sameUser = approveDepositRelease(proposed.value, 'u-lerato', now)
    expect(sameUser.ok).toBe(false)
    if (sameUser.ok) return
    expect(sameUser.error).toMatch(/Dual control/i)

    const other = approveDepositRelease(proposed.value, 'u-amelia', now)
    expect(other.ok).toBe(true)
    if (!other.ok) return
    expect(other.value.status).toBe('release_approved')
    expect(other.value.releaseApprovedBy).toBe('u-amelia')
    // Honesty: release_approved is not refunded / bank settlement
    expect(other.value.status).not.toBe('refunded')
  })
})

describe('DQ-M2 payout dual-control + submitted ≠ settled', () => {
  it('approves pending_approval as well as proposed', () => {
    const pending = basePayout({ status: 'pending_approval' })
    const ok = applyApprovePayout(pending, 'u-amelia', now)
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.value.status).toBe('approved')

    const self = applyApprovePayout(pending, 'u-lerato', now)
    expect(self.ok).toBe(false)
  })

  it('submit never invents settled or partnerPayoutId', () => {
    const approved = basePayout({ status: 'approved', approvedBy: 'u-amelia' })
    const submitted = applySubmitPayout(approved, 'u-amelia', now)
    expect(submitted.ok).toBe(true)
    if (!submitted.ok) return
    expect(submitted.value.status).toBe('submitted')
    expect(submitted.value.status).not.toBe('settled')
    expect(submitted.value.settledAt).toBeNull()
    expect(submitted.value.partnerPayoutId).toBeNull()
  })

  it('proposePayoutInstruction starts proposed with null partner id', () => {
    const r = buildProposedPayout({
      id: 'PI-new',
      agencyId: 'ag-horizon',
      occupancyId: null,
      propertyId: 'PR-1002',
      payeeType: 'landlord',
      payeeId: 'u-owner1',
      bankAccountId: '',
      amountCents: 1000,
      bucketCode: 'owner_payable',
      proposedBy: 'u-lerato',
      idempotencyKey: 'k1',
      now,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.status).toBe('proposed')
    expect(r.value.partnerPayoutId).toBeNull()
    expect(r.value.settledAt).toBeNull()
  })

  it('honesty banner still denies live PayProp', () => {
    expect(TRUST_MODE_A_COPY).toMatch(/not live PayProp/i)
  })
})
