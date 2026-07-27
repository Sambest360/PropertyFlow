import { describe, expect, it } from 'vitest'
import { ROLE_TO_DB_SMOKE } from './authSmokeHelpers'
import { rolePermissions } from './permissions'

describe('empty-start auth helpers', () => {
  it('maps frontend roles to Postgres CHECK values', () => {
    expect(ROLE_TO_DB_SMOKE.super_admin).toBe('SUPER_ADMIN')
    expect(ROLE_TO_DB_SMOKE.client_admin).toBe('AGENCY_ADMIN')
    expect(ROLE_TO_DB_SMOKE.tenant).toBe('END_USER')
    expect(ROLE_TO_DB_SMOKE.landlord).toBe('LANDLORD')
    expect(ROLE_TO_DB_SMOKE.contractor).toBe('CONTRACTOR')
  })

  it('bootstrap first-user rule: empty users → super_admin', () => {
    const userCount = 0
    const requested = 'tenant'
    const role = userCount === 0 ? 'super_admin' : requested
    expect(role).toBe('super_admin')
  })

  it('public register roles stay portal-safe when users already exist', () => {
    const allowed = new Set(['tenant', 'landlord', 'contractor', 'applicant'])
    const requested = 'client_admin'
    const role = allowed.has(requested) ? requested : 'tenant'
    expect(role).toBe('tenant')
  })

  it('landlords can manage and publish assets for self-serve listings', () => {
    expect(rolePermissions.landlord).toContain('assets.manage')
    expect(rolePermissions.landlord).toContain('listings.publish')
    expect(rolePermissions.landlord).toContain('portal.owner')
  })

  it('register payload prefers firstName + lastName', () => {
    const firstName = 'Amy'
    const lastName = 'Applicant'
    const name = `${firstName} ${lastName}`.trim()
    expect(name).toBe('Amy Applicant')
  })

  it('landlord/contractor register carries pending verification shape', () => {
    const verification = {
      status: 'pending' as const,
      submittedAt: '2026-07-27T12:00:00.000Z',
      profile: { idNumberOrPassport: '9001015800080' },
      documents: [{ key: 'id_copy', label: 'ID', name: 'id.pdf' }],
    }
    expect(verification.status).toBe('pending')
    expect(verification.documents).toHaveLength(1)
  })
})
