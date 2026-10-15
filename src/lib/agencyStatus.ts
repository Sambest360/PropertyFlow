import type { Agency } from '../types/domain'

/** Map Postgres `clients.status` to front-end agency status. */
export function mapAgencyStatusFromDb(db: string | null | undefined): Agency['status'] {
  const s = String(db ?? '').toLowerCase()
  if (s === 'active' || s === 'trial') return 'Active'
  if (s === 'cancelled') return 'Cancelled'
  if (s === 'suspended') return 'Suspended'
  return 'Suspended'
}

/** Map front-end agency status to Postgres `clients.status`. */
export function mapAgencyStatusToDb(fe: Agency['status'] | string | null | undefined): string {
  const s = String(fe ?? '')
  if (s === 'Active') return 'active'
  if (s === 'Cancelled') return 'cancelled'
  if (s === 'Suspended') return 'suspended'
  return 'active'
}

/** Staff lose workspace access when the agency is suspended or cancelled. */
export function agencyBlocksStaffAccess(status: Agency['status'] | null | undefined): boolean {
  return status === 'Suspended' || status === 'Cancelled'
}

/** Agencies that can receive new users, listings, etc. */
export function agencyIsSelectable(status: Agency['status'] | null | undefined): boolean {
  return status !== 'Cancelled'
}

export function agencyStatusBadgeTone(
  status: Agency['status'],
): 'success' | 'danger' | 'neutral' {
  if (status === 'Active') return 'success'
  if (status === 'Cancelled') return 'neutral'
  return 'danger'
}
