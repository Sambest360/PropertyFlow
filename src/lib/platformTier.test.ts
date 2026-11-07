import { describe, expect, it } from 'vitest'
import { isAdministrator, isAdministratorHiddenPath, isFullSuperAdmin, platformRoleLabel, platformTierFrom } from './platformTier'
import { buildWorkspaceNavForActor, flattenNavLinks, navItemPath } from '../components/layout/navigation'
import { rolePermissions } from './permissions'

describe('platform tier', () => {
  it('reads the tier only on a super admin row', () => {
    expect(platformTierFrom('SUPER_ADMIN', { platform_tier: 'administrator' })).toBe('administrator')
    expect(platformTierFrom('LANDLORD', { platform_tier: 'administrator' })).toBeNull()
    expect(platformTierFrom('SUPER_ADMIN', {})).toBeNull()
  })
  it('tells the two tiers apart', () => {
    expect(isAdministrator({ role: 'super_admin', platformTier: 'administrator' })).toBe(true)
    expect(isFullSuperAdmin({ role: 'super_admin', platformTier: null })).toBe(true)
    expect(isAdministrator({ role: 'landlord', platformTier: 'administrator' })).toBe(false)
    expect(platformRoleLabel({ role: 'super_admin', platformTier: 'administrator' })).toBe('Administrator')
  })
  it('hides the super-admin-only pages and their sub-pages', () => {
    expect(isAdministratorHiddenPath('/workspace/admin/emails')).toBe(true)
    expect(isAdministratorHiddenPath('/workspace/platform/billing/inv-1')).toBe(true)
    expect(isAdministratorHiddenPath('/workspace/admin/users')).toBe(false)
  })
  it('leaves those pages out of an Administrator nav only', () => {
    const perms = new Set(rolePermissions.super_admin)
    const input = {
      role: 'super_admin',
      has: (p: never) => perms.has(p),
      hasAny: (ps: never[]) => ps.some((p) => perms.has(p)),
    }
    const paths = (nav: ReturnType<typeof buildWorkspaceNavForActor>) =>
      flattenNavLinks(nav).map((item) => navItemPath(item))
    const fullNav = paths(buildWorkspaceNavForActor(input))
    const admNav = paths(buildWorkspaceNavForActor({ ...input, administrator: true }))
    expect(fullNav).toContain('/workspace/admin/emails')
    expect(admNav.some((p) => isAdministratorHiddenPath(p))).toBe(false)
    expect(admNav.length).toBeGreaterThan(5)
  })
})
