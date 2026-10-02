import type { Application, Tenancy } from '../types/domain'

/** Application stages that unlock tenancy ops (payments, maintenance). */
export const TENANT_OCCUPANCY_STAGES: ReadonlySet<string> = new Set([
  'Approved',
  // P0-3: the workflow's AGENT_APPROVE transition lands on this label —
  // it is a real approval and must unlock tenant tools the same way.
  'Conditionally approved',
  'Awaiting Payment',
  'Deposit Paid',
  // Mode A workflow label (lowercase p) — matches applicationWorkflow stage()
  'Deposit paid',
  'Lease Signed',
  'Move-In Scheduled',
  'Keys Handed Over',
  'Active Tenancy',
  // P0-7: Add workflow status stages for occupancy unlock
  'conditionally_approved',
  'deposit_invoice_sent',
  'lease_generated',
  'lease_sent',
  'tenant_signed',
  'landlord_signed',
  'inspection_scheduled',
  'inspection_completed',
  'keys_ready',
  'keys_handed_over',
  'active_tenancy',
])

/** Workflow statuses that unlock tenancy ops (payments, maintenance). */
export const TENANT_OCCUPANCY_WORKFLOW_STATUSES: ReadonlySet<string> = new Set([
  'conditionally_approved',
  'deposit_invoice_sent',
  // Mode A Confirm deposit — unlocks portal occupancy without inventing Passed/TPN
  'deposit_paid',
  'lease_generated',
  'lease_sent',
  'tenant_signed',
  'landlord_signed',
  'inspection_scheduled',
  'inspection_completed',
  'keys_ready',
  'keys_handed_over',
  'active_tenancy',
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
 * P0-7: Check both stage labels and workflow status for proper occupancy unlock.
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
      (TENANT_OCCUPANCY_STAGES.has(a.stage) ||
        (a.workflowStatus && TENANT_OCCUPANCY_WORKFLOW_STATUSES.has(a.workflowStatus))),
  )
}

export function isTenantOccupancyPermission(permission: string): boolean {
  return (TENANT_OCCUPANCY_PERMISSIONS as readonly string[]).includes(permission)
}
