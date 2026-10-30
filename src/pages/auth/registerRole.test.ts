import { readFileSync } from 'node:fs'
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

  it('RegisterPage seeds its role state from ?role= through initialRegisterRole', () => {
    const src = readFileSync(new URL('./RegisterPage.tsx', import.meta.url), 'utf8')
    expect(src).toMatch(/useState<PublicRole>\(\(\) => initialRegisterRole\(params\.get\('role'\)\)\)/)
    expect(src).not.toMatch(/useState<PublicRole>\('tenant'\)/)
  })
})

// The footer "List with us" link arrives with PR #117 (T5). Until it is on main
// this skips; once #117 merges it pins the link to LIST_WITH_US_PATH.
const listWithUs = marketplaceFooter
  .flatMap((g) => g.links as ReadonlyArray<readonly [string, string]>)
  .find(([label]) => label === 'List with us')

describe.skipIf(!listWithUs)('T6 C6 footer "List with us" (needs PR #117 merged first)', () => {
  it('links to /register with Landlord preselected', () => {
    expect(listWithUs?.[1]).toBe(LIST_WITH_US_PATH)
  })
})
