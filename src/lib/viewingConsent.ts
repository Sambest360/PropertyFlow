import type { Viewing } from '../types/domain'

/**
 * Occupied-home viewings (027): a booking is only firm once the sitting tenant
 * accepts. Staff lists must not show a pending or declined one as plain
 * "Scheduled", so every staff surface puts this label beside the status.
 */
export type TenantConsentLabel = {
  label: string
  tone: 'warning' | 'danger'
  title: string
}

export function tenantConsentLabel(
  v: Pick<Viewing, 'status' | 'tenantConsentStatus'>,
): TenantConsentLabel | null {
  if (v.status !== 'Scheduled') return null
  if (v.tenantConsentStatus === 'PENDING') {
    return {
      label: 'Tenant consent PENDING',
      tone: 'warning',
      title: 'Occupied home: waiting for the tenant to accept this viewing time',
    }
  }
  if (v.tenantConsentStatus === 'DECLINED') {
    return {
      label: 'Tenant DECLINED',
      tone: 'danger',
      title: 'Occupied home: the tenant declined this viewing time; rebook or contact the applicant',
    }
  }
  return null
}
