import { describe, expect, it } from 'vitest'
import { tenantConsentLabel, viewingStatusWithConsent } from './viewingConsent'

describe('tenantConsentLabel (occupied-home viewings)', () => {
  it('flags PENDING and DECLINED on scheduled bookings', () => {
    expect(tenantConsentLabel({ status: 'Scheduled', tenantConsentStatus: 'PENDING' })).toMatchObject({
      label: 'Tenant consent PENDING',
      tone: 'warning',
    })
    expect(tenantConsentLabel({ status: 'Scheduled', tenantConsentStatus: 'DECLINED' })).toMatchObject({
      label: 'Tenant DECLINED',
      tone: 'danger',
    })
  })

  it('stays quiet when consent is not needed, accepted, or the viewing is over', () => {
    expect(tenantConsentLabel({ status: 'Scheduled', tenantConsentStatus: 'NOT_REQUIRED' })).toBeNull()
    expect(tenantConsentLabel({ status: 'Scheduled', tenantConsentStatus: 'ACCEPTED' })).toBeNull()
    expect(tenantConsentLabel({ status: 'Scheduled' })).toBeNull()
    expect(tenantConsentLabel({ status: 'Cancelled', tenantConsentStatus: 'DECLINED' })).toBeNull()
  })

  it('never renders a pending booking as plain Scheduled', () => {
    expect(viewingStatusWithConsent({ status: 'Scheduled', tenantConsentStatus: 'PENDING' })).toBe(
      'Scheduled · Tenant consent PENDING',
    )
    expect(viewingStatusWithConsent({ status: 'Scheduled', tenantConsentStatus: 'DECLINED' })).toBe(
      'Scheduled · Tenant DECLINED',
    )
    expect(viewingStatusWithConsent({ status: 'Scheduled', tenantConsentStatus: 'ACCEPTED' })).toBe('Scheduled')
  })
})
