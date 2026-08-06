import type { Application, Tenancy } from '../types/domain'

/** Application stages that unlock tenancy ops (payments, maintenance). */
export const TENANT_OCCUPANCY_STAGES: ReadonlySet<string> = new Set([
  'Approved',
  'Awaiting Payment',
  'Deposit Paid',
  'Lease Signed',
  'Move-In Scheduled',
  'Keys Handed Over',
  'Active Tenancy',
])

/** Permissions only available after a tenant is approved onto a property. */
export const TENANT_OCCUPANCY_PERMISSIONS = [
  'payments.view',
  'payments.manage',
  'maintenance.view',
  'maintenance.manage',
  'messages.manage',
] as const

export type TenantIdentity = {
  id: string
  email?: string | null
  name?: string | null
}

function matchesApplicant(app: Application, user: TenantIdentity): boolean {
  return (
    app.applicantUserId === user.id ||
    (!!user.email && app.email.toLowerCase() === user.email.toLowerCase())
  )
}

/**
 * True when the tenant has at least one approved (or later) application,
 * or an active tenancy row — unlocks payments / maintenance / messaging.
 */
export function tenantHasApprovedOccupancy(
  applications: readonly Application[],
  tenancies: readonly Tenancy[],
  user: TenantIdentity,
): boolean {
  if (
    tenancies.some(
      (t) => t.tenantUserId === user.id && (t.status === 'Active' || t.status === 'Pending Move-In'),
    )
  ) {
    return true
  }

  return applications.some(
    (a) =>
      matchesApplicant(a, user) &&
      a.stage !== 'Blocked' &&
      a.stage !== 'Rejected' &&
      a.stage !== 'Withdrawn' &&
      TENANT_OCCUPANCY_STAGES.has(a.stage),
  )
}

export function isTenantOccupancyPermission(permission: string): boolean {
  return (TENANT_OCCUPANCY_PERMISSIONS as readonly string[]).includes(permission)
}
