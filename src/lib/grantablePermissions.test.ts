import { describe, expect, it } from 'vitest'
import { grantablePermissions, roleCeiling } from './permissions'

describe('grantablePermissions', () => {
  it('never offers user management, platform or portal access to a Full Agent', () => {
    const g = grantablePermissions('ground_agent')
    for (const p of ['users.manage', 'roles.assign', 'config.manage', 'platform.manage', 'portal.owner', 'portal.tenant'] as const) {
      expect(g).not.toContain(p)
    }
    expect(g).toContain('leads.manage')
  })
  it('lets an agency administrator have office management but not platform access', () => {
    const c = roleCeiling('agent_admin')
    expect(c).toContain('users.manage')
    expect(c).not.toContain('platform.manage')
  })
  it('limits to the agency modules and to what an agency admin holds', () => {
    const g = grantablePermissions('ground_agent', {
      agencyEnabled: ['leads.view', 'leads.manage', 'assets.view'],
      granterRole: 'agent_admin',
      granterPermissions: ['leads.view', 'assets.view'],
    })
    expect(g.sort()).toEqual(['assets.view', 'leads.view'])
  })
  it('super admin granting is limited only by role and agency', () => {
    const g = grantablePermissions('ground_agent', { granterRole: 'super_admin', granterPermissions: [] })
    expect(g.length).toBeGreaterThan(5)
  })
})
