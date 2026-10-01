/**
 * DQ-M3 Mode A — assemble printable owner statement book from in-app records.
 * Read-only: never mutates payouts, never mints settled / partnerPayoutId.
 */

import type { PaymentRecord, PayoutInstruction, PropertyAsset, Tenancy, TrustAllocation } from '../../types/domain'
import {
  OWNER_STATEMENT_MODE_A_COPY,
  OWNER_STATEMENT_PAYOUT_STATUSES,
  type OwnerStatementAllocationLine,
  type OwnerStatementBook,
  type OwnerStatementBookInput,
  type OwnerStatementLine,
  type OwnerStatementPaymentLine,
  type OwnerStatementPayoutLine,
  type OwnerStatementPayoutStatus,
} from './types'

function dateInPeriod(isoDate: string, start: string, end: string): boolean {
  const d = isoDate.slice(0, 10)
  return d >= start && d <= end
}

function isOwnerStatementPayoutStatus(s: string): s is OwnerStatementPayoutStatus {
  return (OWNER_STATEMENT_PAYOUT_STATUSES as readonly string[]).includes(s)
}

/** True when payout may appear on Mode A statement (landlord payee, <= submitted). */
export function isModeAStatementPayout(p: PayoutInstruction, landlordUserId: string): boolean {
  if (p.payeeType !== 'landlord') return false
  if (p.payeeId !== landlordUserId) return false
  return isOwnerStatementPayoutStatus(p.status)
}

/**
 * Build the in-app book for one landlord + period.
 * Excludes settled/failed/cancelled payouts from lines (<= submitted only).
 * Does not invent partnerPayoutId or upgrade status to settled.
 */
export function buildOwnerStatementBook(input: OwnerStatementBookInput): OwnerStatementBook {
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const { start, end } = input.period

  const landlordProperties = input.properties.filter(
    (p) => p.landlordId === input.landlordUserId && p.agencyId === input.agencyId,
  )
  const propertyIds = new Set(landlordProperties.map((p) => p.id))
  const propertyTitle = (id: string) =>
    landlordProperties.find((p) => p.id === id)?.title ?? id

  const landlordTenancies = input.tenancies.filter(
    (t) => t.landlordId === input.landlordUserId && t.agencyId === input.agencyId,
  )
  const occupancyIds = new Set(landlordTenancies.map((t) => t.id))
  const tenancyProperty = (occupancyId: string | null): string => {
    if (!occupancyId) return '-'
    const tn = landlordTenancies.find((t) => t.id === occupancyId)
    return tn ? propertyTitle(tn.propertyId) : '—'
  }

  const payments: OwnerStatementPaymentLine[] = input.payments
    .filter((pay) => {
      if (!propertyIds.has(pay.propertyId)) return false
      if (!pay.landlordVisible) return false
      if (pay.agencyId !== input.agencyId) return false
      const anchor = (pay.paidAt || pay.dueDate || '').slice(0, 10)
      if (!anchor) return false
      return dateInPeriod(anchor, start, end)
    })
    .map((pay) => ({
      kind: 'payment' as const,
      id: pay.id,
      date: (pay.paidAt || pay.dueDate).slice(0, 10),
      propertyTitle: propertyTitle(pay.propertyId),
      description: `${pay.type} - ${pay.partyName} (${pay.status})`,
      amountZar: pay.paidAmount ?? pay.amount,
      status: pay.status,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  const allocations: OwnerStatementAllocationLine[] = (input.trustAllocations ?? [])
    .filter((a) => {
      if (a.agencyId !== input.agencyId) return false
      if (!a.occupancyId || !occupancyIds.has(a.occupancyId)) return false
      return dateInPeriod(a.allocatedAt, start, end)
    })
    .map((a) => ({
      kind: 'allocation' as const,
      id: a.id,
      date: a.allocatedAt.slice(0, 10),
      propertyTitle: tenancyProperty(a.occupancyId),
      description: `Trust allocation - ${a.bucketCode} (in-app book)`,
      amountZar: a.amountCents / 100,
      bucketCode: a.bucketCode,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  const payouts: OwnerStatementPayoutLine[] = (input.payoutInstructions ?? [])
    .filter((p) => {
      if (!isModeAStatementPayout(p, input.landlordUserId)) return false
      if (p.agencyId !== input.agencyId) return false
      if (!propertyIds.has(p.propertyId)) return false
      const anchor = (p.submittedAt || p.updatedAt || p.createdAt).slice(0, 10)
      return dateInPeriod(anchor, start, end)
    })
    .map((p) => {
      const status = p.status as OwnerStatementPayoutStatus
      return {
        kind: 'payout' as const,
        id: p.id,
        date: (p.submittedAt || p.updatedAt || p.createdAt).slice(0, 10),
        propertyTitle: propertyTitle(p.propertyId),
        description: `Payout instruction - ${p.bucketCode} - in-app ${status} (not bank / not PayProp)`,
        amountZar: p.amountCents / 100,
        status,
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  const lines: OwnerStatementLine[] = [...payments, ...allocations, ...payouts].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  )

  return {
    landlordUserId: input.landlordUserId,
    landlordName: input.landlordName,
    agencyId: input.agencyId,
    agencyName: input.agencyName,
    period: { start, end },
    propertyTitles: landlordProperties.map((p) => p.title),
    payments,
    allocations,
    payouts,
    lines,
    totals: {
      paymentsZar: payments.reduce((n, l) => n + l.amountZar, 0),
      allocationsZar: allocations.reduce((n, l) => n + l.amountZar, 0),
      payoutsSubmittedZar: payouts.reduce((n, l) => n + l.amountZar, 0),
    },
    honesty: OWNER_STATEMENT_MODE_A_COPY,
    generatedAt,
  }
}

/** Draft PropertyDocument (caller supplies id via addPropertyDocument). */
export function ownerStatementDocumentDraft(params: {
  agencyId: string
  /** Prefer first landlord property; required for PropertyDocument.propertyId */
  propertyId: string
  landlordName: string
  periodStart: string
  periodEnd: string
  fileUrl: string
  uploadedAt?: string
}): Omit<import('../../types/domain').PropertyDocument, 'id'> {
  return {
    agencyId: params.agencyId,
    propertyId: params.propertyId,
    name: `Owner statement - ${params.landlordName} (${params.periodStart} to ${params.periodEnd})`,
    category: 'Other',
    status: 'uploaded',
    uploadedAt: (params.uploadedAt ?? new Date().toISOString()).slice(0, 10),
    note: OWNER_STATEMENT_MODE_A_COPY,
    fileUrl: params.fileUrl,
  }
}

/** Default calendar month period (YYYY-MM-DD) for UI. */
export function defaultOwnerStatementPeriod(now = new Date()): { start: string; end: string } {
  const y = now.getFullYear()
  const m = now.getMonth()
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`
  const lastDay = new Date(y, m + 1, 0).getDate()
  const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

/** Re-export helpers used by tests / UI filters. */
export type { PaymentRecord, PayoutInstruction, PropertyAsset, Tenancy, TrustAllocation }
