import { describe, expect, it } from 'vitest'
import { marketplaceFooter } from '../../components/layout/navigation'
import { initialRegisterRole, LIST_WITH_US_PATH } from './registerRole'

describe('T6 (Jim T5 C6): /register?role= preselects a public role', () => {
  it('role=landlord preselects Landlord, role=contractor preselects Contractor', () => {
    expect(initialRegisterRole('landlord')).toBe('landlord')
    expect(initialRegisterRole('contractor')).toBe('contractor')
    expect(initialRegisterRole(' Landlord ')).toBe('landlord')
  })

  it('no role, or anything that is not a public role, keeps the Applicant / Tenant default', () => {
    for (const raw of [null, '', 'tenant', 'applicant', 'agency', 'agency_admin', 'super_admin', 'admin', 'staff', 'landlord;x']) {
      expect(initialRegisterRole(raw), String(raw)).toBe('tenant')
    }
  })

  it('"List with us" target preselects Landlord (agencies are not self-serve)', () => {
    expect(LIST_WITH_US_PATH).toBe('/register?role=landlord')
    const role = new URL(LIST_WITH_US_PATH, 'https://example.test').searchParams.get('role')
    expect(initialRegisterRole(role)).toBe('landlord')
  })

  // The RegisterPage wiring is proven by behaviour in RegisterPage.role.test.tsx (Angela #118 C3),
  // which replaced a source-text pin that missed real breakage and failed harmless refactors.
})

// No skip guard: if the footer link goes missing, this fails loudly.
describe('T6 C6 footer "List with us"', () => {
  it('links to /register with Landlord preselected', () => {
    const listWithUs = marketplaceFooter
      .flatMap((g) => g.links as ReadonlyArray<readonly [string, string]>)
      .find(([label]) => label === 'List with us')
    expect(listWithUs, 'footer has a "List with us" link').toBeDefined()
    expect(listWithUs?.[1]).toBe(LIST_WITH_US_PATH)
  })
})
