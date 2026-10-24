/**
 * §5 Mode A — assemble point-in-time (as-at) rent roll from in-app tenancies.
 * Read-only: never mutates ledgers, never claims bank/Trust audit.
 */

import type { PaymentRecord, PropertyAsset, Tenancy, AppUser } from '../../types/domain'
import {
  RENT_ROLL_MODE_A_COPY,
  type RentRollAsAtInput,
  type RentRollBook,
  type RentRollRow,
} from './types'
import { personRefLabel, propertyRefLabel } from '../propertyRefs'

const RENT_LIKE: ReadonlySet<PaymentRecord['type']> = new Set([
  'Rent',
  'First Month Rent',
])

function ymd(iso: string): string {
  return iso.slice(0, 10)
}

/** Tenancy is on the as-at roll when start ≤ asAt and (no end or end ≥ asAt). */
export function isTenancyOnRentRollAsAt(t: Tenancy, asAt: string): boolean {
  const d = ymd(asAt)
  if (ymd(t.startDate) > d) return false
  if (t.endDate && ymd(t.endDate) < d) return false
  return true
}

function arrearsForTenancy(
  tenancyId: string,
  payments: PaymentRecord[],
  asAt: string,
): number {
  const d = ymd(asAt)
  return payments
    .filter((p) => {
      if (p.tenancyId !== tenancyId) return false
      if (!RENT_LIKE.has(p.type)) return false
      if (p.status !== 'Due' && p.status !== 'Overdue') return false
      return ymd(p.dueDate) <= d
    })
    .reduce((sum, p) => sum + p.amount, 0)
}

function landlordName(
  landlordId: string,
  landlords: AppUser[] | undefined,
): string {
  return landlords?.find((u) => u.id === landlordId)?.name ?? personRefLabel(landlordId)
}

function propertyAddress(p: PropertyAsset | undefined): string {
  if (!p) return '—'
  const parts = [p.address, p.suburb, p.city].filter(Boolean)
  return parts.length ? parts.join(', ') : '—'
}

/**
 * Build as-at rent roll for an agency (optional landlord scope).
 * Arrears are in-app Due/Overdue only — not bank-confirmed.
 */
export function buildRentRollAsAt(input: RentRollAsAtInput): RentRollBook {
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const asAt = ymd(input.asAt)
  const payments = input.payments ?? []

  let properties = input.properties.filter((p) => p.agencyId === input.agencyId)
  let tenancies = input.tenancies.filter((t) => t.agencyId === input.agencyId)

  if (input.landlordUserId) {
    properties = properties.filter((p) => p.landlordId === input.landlordUserId)
    tenancies = tenancies.filter((t) => t.landlordId === input.landlordUserId)
  }

  const propertyById = new Map(properties.map((p) => [p.id, p]))
  const scopedPropertyIds = new Set(properties.map((p) => p.id))

  const rows: RentRollRow[] = tenancies
    .filter((t) => scopedPropertyIds.has(t.propertyId) && isTenancyOnRentRollAsAt(t, asAt))
    .map((t) => {
      const prop = propertyById.get(t.propertyId)
      return {
        tenancyId: t.id,
        propertyId: t.propertyId,
        propertyTitle: prop?.title ?? propertyRefLabel(t.propertyId),
        propertyAddress: propertyAddress(prop),
        landlordId: t.landlordId,
        landlordName: landlordName(t.landlordId, input.landlords),
        tenantName: t.tenantName,
        tenantEmail: t.tenantEmail,
        status: t.status,
        startDate: ymd(t.startDate),
        endDate: t.endDate ? ymd(t.endDate) : null,
        rentZar: t.rent,
        depositZar: t.deposit,
        rentDueDay: t.rentDueDay ?? 1,
        arrearsZar: arrearsForTenancy(t.id, payments, asAt),
        increaseDate: t.billingSchedule?.nextEscalationOn
          ? ymd(t.billingSchedule.nextEscalationOn)
          : null,
        escalationPct: t.billingSchedule?.escalationPct ?? null,
      }
    })
    .sort(
      (a, b) =>
        a.propertyTitle.localeCompare(b.propertyTitle) ||
        a.tenantName.localeCompare(b.tenantName) ||
        a.tenancyId.localeCompare(b.tenancyId),
    )

  return {
    agencyId: input.agencyId,
    agencyName: input.agencyName,
    asAt,
    landlordUserId: input.landlordUserId ?? null,
    rows,
    totals: {
      units: rows.length,
      rentPcmZar: rows.reduce((n, r) => n + r.rentZar, 0),
      depositZar: rows.reduce((n, r) => n + r.depositZar, 0),
      arrearsZar: rows.reduce((n, r) => n + r.arrearsZar, 0),
    },
    honesty: RENT_ROLL_MODE_A_COPY,
    generatedAt,
  }
}

/** Default as-at = today (YYYY-MM-DD) for UI. */
export function defaultRentRollAsAt(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export type { PaymentRecord, PropertyAsset, Tenancy, AppUser }
