import { describe, expect, it } from 'vitest'
import {
  applyGroupLevel,
  can,
  effectiveCan,
  resolveGroupLevel,
  userBasePermissions,
  viewPermissionsInGroup,
} from './permissions'
import type { Permission } from '../types/domain'

describe('can / role packs', () => {
  it('grants platform.manage only to super_admin', () => {
    expect(can('super_admin', 'platform.manage')).toBe(true)
    expect(can('client_admin', 'platform.manage')).toBe(false)
    expect(can('ground_agent', 'platform.manage')).toBe(false)
  })

  it('candidate agents cannot publish or review independently', () => {
    expect(can('agent', 'listings.publish')).toBe(false)
    expect(can('agent', 'applications.review')).toBe(false)
    expect(can('ground_agent', 'listings.publish')).toBe(true)
    expect(can('ground_agent', 'applications.review')).toBe(true)
    expect(can('agent_admin', 'listings.publish')).toBe(true)
    expect(can('agent_admin', 'trust.view')).toBe(true)
  })

  it('tenants get portal; payments stay in the pack (gated by occupancy at runtime)', () => {
    expect(can('tenant', 'portal.tenant')).toBe(true)
    expect(can('tenant', 'payments.manage')).toBe(true)
    expect(can('tenant', 'applications.view')).toBe(false)
    expect(can('tenant', 'assets.manage')).toBe(false)
  })

  it('landlords can view portfolio documents for owner register', () => {
    expect(can('landlord', 'documents.view')).toBe(true)
    expect(can('landlord', 'portal.owner')).toBe(true)
    expect(can('landlord', 'messages.manage')).toBe(false)
  })
})

describe('effectiveCan agency intersection', () => {
  const agencyPack: Permission[] = ['assets.view', 'leads.view', 'payments.view']

  it('super_admin ignores agency module clamps', () => {
    expect(effectiveCan('super_admin', 'platform.manage', [])).toBe(true)
    expect(effectiveCan('super_admin', 'assets.manage', agencyPack)).toBe(true)
  })

  it('denies permissions missing from the agency enabled pack', () => {
    expect(effectiveCan('client_admin', 'assets.view', agencyPack)).toBe(true)
    expect(effectiveCan('client_admin', 'assets.manage', agencyPack)).toBe(false)
  })

  it('user override pack still cannot exceed agency modules', () => {
    const userPack: Permission[] = ['assets.view', 'assets.manage', 'leads.view']
    expect(effectiveCan('ground_agent', 'assets.manage', agencyPack, userPack)).toBe(false)
    expect(effectiveCan('ground_agent', 'assets.view', agencyPack, userPack)).toBe(true)
  })

  it('null agency pack means role defaults apply', () => {
    expect(effectiveCan('ground_agent', 'listings.publish', null)).toBe(true)
  })

  it('userBasePermissions prefers explicit overrides except for super_admin', () => {
    const override: Permission[] = ['assets.view']
    expect(userBasePermissions('ground_agent', override)).toEqual(override)
    expect(userBasePermissions('super_admin', override)).toContain('platform.manage')
  })
})

describe('capability group levels', () => {
  const group: Permission[] = ['assets.view', 'assets.manage', 'listings.publish']

  it('resolves none / view / full / custom', () => {
    expect(resolveGroupLevel(group, [])).toBe('none')
    expect(resolveGroupLevel(group, viewPermissionsInGroup(group))).toBe('view')
    expect(resolveGroupLevel(group, group)).toBe('full')
    expect(resolveGroupLevel(group, ['assets.manage'])).toBe('custom')
  })

  it('applyGroupLevel preserves permissions outside the group', () => {
    const current: Permission[] = ['payments.view', 'assets.manage']
    expect(applyGroupLevel(current, group, 'none')).toEqual(['payments.view'])
    expect(applyGroupLevel(current, group, 'full').sort()).toEqual(
      ['payments.view', ...group].sort(),
    )
    expect(applyGroupLevel(current, group, 'view').sort()).toEqual(
      ['payments.view', ...viewPermissionsInGroup(group)].sort(),
    )
  })
})
