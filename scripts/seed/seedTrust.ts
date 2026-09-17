/**
 * Trust & Banking seed rows (GO#5 P0-7): demo-credible books for the
 * Cashbook / Unallocated / Payouts / Deposits / Arrears pages.
 *
 * Money is integer cents (ZAR). Transactions reference the demo agency
 * (`ag-seeff-cb`); payouts are seeded at `pending_approval` so the dual-control
 * approval can be exercised live during the demo.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { AGENCY_ID } from './data/agency.js'
import { fixedUuid } from './helpers.js'

export type TrustSeedRefs = {
  unitIdByFe: Map<string, { unitId: string }>
  appUserByFe: Map<string, { appUserId: string }>
}

type TxnSeed = {
  feId: string
  direction: 'in' | 'out'
  amountCents: number
  valueDate: string
  postedAt: string
  bankRef: string | null
  description: string
  status: 'received' | 'recognised' | 'allocated' | 'split_allocated' | 'unallocated' | 'reversed'
}

const TXNS: TxnSeed[] = [
  {
    feId: 'TT-SCB-001',
    direction: 'in',
    amountCents: 2_150_000, // R21,500.00 rent — Tamboerskloof apt
    valueDate: '2026-09-01',
    postedAt: '2026-09-01T08:12:00.000Z',
    bankRef: 'FNB-904411',
    description: 'Rent — De Waterkant apartment (PR-SCB-004)',
    status: 'allocated',
  },
  {
    feId: 'TT-SCB-002',
    direction: 'in',
    amountCents: 34_000_000, // R34,000.00 deposit — Tamboerskloof
    valueDate: '2026-08-28',
    postedAt: '2026-08-28T10:05:00.000Z',
    bankRef: 'FNB-904412',
    description: 'Deposit — De Waterkant apartment (PR-SCB-004)',
    status: 'allocated',
  },
  {
    feId: 'TT-SCB-003',
    direction: 'in',
    amountCents: 1_675_000, // R16,750.00 rent
    valueDate: '2026-09-01',
    postedAt: '2026-09-01T09:40:00.000Z',
    bankRef: 'FNB-904418',
    description: 'Rent — Gardens home (PR-SCB-002)',
    status: 'allocated',
  },
  {
    feId: 'TT-SCB-004',
    direction: 'in',
    amountCents: 980_000, // R9,800.00 rent
    valueDate: '2026-09-02',
    postedAt: '2026-09-02T07:55:00.000Z',
    bankRef: 'FNB-904425',
    description: 'Rent — City Bowl studio (PR-SCB-006)',
    status: 'recognised',
  },
  {
    feId: 'TT-SCB-005',
    direction: 'in',
    amountCents: 500_000, // R5,000.00 — unidentifiable payment
    valueDate: '2026-09-03',
    postedAt: '2026-09-03T15:22:00.000Z',
    bankRef: 'UNKNOWN-REF-901',
    description: 'Unknown payment — no reference',
    status: 'unallocated',
  },
  {
    feId: 'TT-SCB-006',
    direction: 'in',
    amountCents: 1_200_000, // R12,000.00 — partial, split across rent + utilities
    valueDate: '2026-09-04',
    postedAt: '2026-09-04T11:03:00.000Z',
    bankRef: 'FNB-904437',
    description: 'Partial rent — Vredehoek residence (PR-SCB-009)',
    status: 'split_allocated',
  },
  {
    feId: 'TT-SCB-007',
    direction: 'out',
    amountCents: 1_935_000, // R19,350.00 owner payout (90%)
    valueDate: '2026-09-05',
    postedAt: '2026-09-05T10:00:00.000Z',
    bankRef: 'FNB-904442',
    description: 'Owner payout — De Waterkant (PR-SCB-004) Aug rent',
    status: 'recognised',
  },
]

export async function seedTrustData(
  admin: SupabaseClient,
  refs: TrustSeedRefs,
): Promise<void> {
  // --- Trust transactions (immutable cashbook) ---
  const txnIds = new Map<string, string>()
  for (let i = 0; i < TXNS.length; i++) {
    const t = TXNS[i]
    const id = fixedUuid('b9300001', i + 1)
    txnIds.set(t.feId, id)
    const { error } = await admin.from('trust_transactions').insert({
      id,
      client_id: AGENCY_ID,
      direction: t.direction,
      amount_cents: t.amountCents,
      currency: 'ZAR',
      value_date: t.valueDate,
      posted_at: t.postedAt,
      partner_txn_id: t.bankRef,
      bank_ref: t.bankRef,
      description: t.description,
      counterparty_hash: null,
      status: t.status,
      raw_payload_document_id: null,
    })
    if (error) throw new Error(`trust_transactions ${t.feId}: ${error.message}`)
  }

  // --- Allocations for the allocated/split transactions ---
  const allocations: Array<{ txnFe: string; bucketCode: string; amountCents: number; note: string }> = [
    { txnFe: 'TT-SCB-001', bucketCode: 'rent', amountCents: 2_150_000, note: 'rent bucket' },
    { txnFe: 'TT-SCB-002', bucketCode: 'deposit_held', amountCents: 34_000_000, note: 'deposit held' },
    { txnFe: 'TT-SCB-003', bucketCode: 'rent', amountCents: 1_675_000, note: 'rent bucket' },
    { txnFe: 'TT-SCB-004', bucketCode: 'rent', amountCents: 980_000, note: 'rent bucket' },
    { txnFe: 'TT-SCB-006', bucketCode: 'rent', amountCents: 950_000, note: 'rent portion' },
    { txnFe: 'TT-SCB-006', bucketCode: 'utilities', amountCents: 250_000, note: 'utilities portion' },
  ]
  const allocUser = refs.appUserByFe.get('u-admin-lerato')
  for (let i = 0; i < allocations.length; i++) {
    const a = allocations[i]
    const txnId = txnIds.get(a.txnFe)
    if (!txnId) continue
    const { error } = await admin.from('trust_allocations').insert({
      id: fixedUuid('b9301001', i + 1),
      client_id: AGENCY_ID,
      trust_transaction_id: txnId,
      occupancy_id: null,
      bucket_code: a.bucketCode,
      charge_id: null,
      amount_cents: a.amountCents,
      allocated_by: allocUser?.appUserId ?? null,
    })
    if (error) throw new Error(`trust_allocations ${i}: ${error.message}`)
  }

  // --- Payout instructions (dual-control: propose + separate approver) ---
  const payouts = [
    {
      // settled history row
      feId: 'PI-SCB-001',
      payeeType: 'landlord',
      amountCents: 1_935_000,
      bucketCode: 'owner_payable',
      status: 'settled' as const,
      proposedBy: 'u-agent-james',
      approvedBy: 'u-admin-lerato',
      submittedAt: '2026-09-05T09:00:00.000Z',
      settledAt: '2026-09-05T10:00:00.000Z',
      idempotencyKey: 'PI-SCB-001-dewaterkant-aug',
    },
    {
      // awaiting dual-control approval — demoable live
      feId: 'PI-SCB-002',
      payeeType: 'agency',
      amountCents: 215_000,
      bucketCode: 'agency_fee',
      status: 'pending_approval' as const,
      proposedBy: 'u-agent-james',
      approvedBy: null,
      submittedAt: null,
      settledAt: null,
      idempotencyKey: 'PI-SCB-002-commission-sep',
    },
    {
      // proposed by admin, ready for another approver
      feId: 'PI-SCB-003',
      payeeType: 'contractor',
      amountCents: 4_500_000,
      bucketCode: 'contractor_payable',
      status: 'proposed' as const,
      proposedBy: 'u-admin-lerato',
      approvedBy: null,
      submittedAt: null,
      settledAt: null,
      idempotencyKey: 'PI-SCB-003-aquafix-repair',
    },
  ]
  for (let i = 0; i < payouts.length; i++) {
    const p = payouts[i]
    const proposer = refs.appUserByFe.get(p.proposedBy)
    const approver = p.approvedBy ? refs.appUserByFe.get(p.approvedBy) : undefined
    const { error } = await admin.from('payout_instructions').insert({
      id: fixedUuid('b9302001', i + 1),
      client_id: AGENCY_ID,
      occupancy_id: null,
      unit_id: null,
      payee_type: p.payeeType,
      payee_id: p.payeeType === 'agency' ? AGENCY_ID : null,
      bank_account_id: `BA-${p.feId.slice(-3)}`,
      amount_cents: p.amountCents,
      bucket_code: p.bucketCode,
      status: p.status,
      proposed_by: proposer?.appUserId ?? null,
      approved_by: approver?.appUserId ?? null,
      submitted_at: p.submittedAt,
      settled_at: p.settledAt,
      partner_payout_id: p.settledAt ? 'FNB-904442' : null,
      failure_reason: null,
      idempotency_key: p.idempotencyKey,
    })
    if (error) throw new Error(`payout_instructions ${p.feId}: ${error.message}`)
  }

  // --- Deposit holdings (RHA s5(3) interest-bearing, deadlines tracked) ---
  const deposits = [
    {
      feId: 'DH-SCB-001',
      expectedCents: 34_000_000,
      heldCents: 34_000_000,
      interest: 148_000, // R1,480.00 accrued
      status: 'held' as const,
      deadlineOn: '2026-12-01',
      interestUnknown: false,
    },
    {
      feId: 'DH-SCB-002',
      expectedCents: 19_000_000,
      heldCents: 19_000_000,
      interest: 0,
      status: 'held' as const,
      deadlineOn: null,
      interestUnknown: true, // rate not confirmed with landlord — flagged in UI
    },
    {
      feId: 'DH-SCB-003',
      expectedCents: 25_000_000,
      heldCents: 0, // expected but not yet received
      interest: 0,
      status: 'expected' as const,
      deadlineOn: '2026-09-24', // within 7 days → urgent badge in Deposits page
      interestUnknown: false,
    },
  ]
  for (let i = 0; i < deposits.length; i++) {
    const d = deposits[i]
    const { error } = await admin.from('deposit_holdings').insert({
      id: fixedUuid('b9303001', i + 1),
      client_id: AGENCY_ID,
      occupancy_id: null,
      unit_id: null,
      expected_cents: d.expectedCents,
      held_cents: d.heldCents,
      interest_accrued_cents: d.interest,
      status: d.status,
      statutory_deadline_on: d.deadlineOn,
      interest_rate_unknown: d.interestUnknown,
    })
    if (error) throw new Error(`deposit_holdings ${d.feId}: ${error.message}`)
  }

  // --- Arrears snapshot (ageing buckets) ---
  const { error: arrearsErr } = await admin.from('arrears_snapshots').insert({
    id: fixedUuid('b9304001', 1),
    client_id: AGENCY_ID,
    occupancy_id: null,
    as_of: '2026-09-16',
    current_cents: 0,
    d30: 1_675_000, // R16,750.00 — 1 month overdue
    d60: 0,
    d90: 980_000, // R9,800.00 — 3 months
    d90plus: 0,
  })
  if (arrearsErr) throw new Error(`arrears_snapshots: ${arrearsErr.message}`)

  // --- CSV import batch history ---
  const { error: csvErr } = await admin.from('csv_import_batches').insert({
    id: fixedUuid('b9305001', 1),
    client_id: AGENCY_ID,
    filename: 'fnb-september-2026.csv',
    row_count: 7,
    imported_by: allocUser?.appUserId ?? null,
    status: 'completed',
  })
  if (csvErr) throw new Error(`csv_import_batches: ${csvErr.message}`)
}
