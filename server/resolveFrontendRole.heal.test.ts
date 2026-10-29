import { describe, expect, it } from 'vitest'
import { resolveFrontendRole } from '../src/lib/idMap.js'

describe('resolveFrontendRole heal (P0 r20 optional #3)', () => {
  it('GROUND_AGENT overrides stale metadata frontend_role: tenant', () => {
    expect(
      resolveFrontendRole('GROUND_AGENT', { frontend_role: 'tenant' }, 'fa@example.com'),
    ).toBe('ground_agent')
  })

  it('AGENCY_ADMIN overrides stale metadata frontend_role: tenant', () => {
    expect(
      resolveFrontendRole('AGENCY_ADMIN', { frontend_role: 'tenant' }, 'admin@example.com'),
    ).toBe('client_admin')
  })

  it('END_USER still respects metadata frontend_role when present', () => {
    expect(
      resolveFrontendRole('END_USER', { frontend_role: 'applicant' }, 'app@example.com'),
    ).toBe('applicant')
  })
})
