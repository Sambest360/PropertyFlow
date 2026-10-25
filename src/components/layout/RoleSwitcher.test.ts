import { describe, expect, it } from 'vitest'
import type { Permission } from '../../types/domain'
import { shortcutSections } from './RoleSwitcher'

const can = (list: Permission[]) => ({
  has: (p: Permission) => list.includes(p),
  hasAny: (ps: Permission[]) => ps.some((p) => list.includes(p)),
})

describe('account menu shortcuts', () => {
  it('gives tenants their portal pages with counts, not the staff dashboard', () => {
    const [section] = shortcutSections({
      role: 'tenant',
      userId: 'u-t',
      ...can(['portal.tenant']),
      counts: { applications: 1, viewings: 2, paymentsDue: 0 },
    })
    expect(section.items.map((i) => i.label)).toEqual([
      'Overview',
      'Applications',
      'Viewings',
      'Enquiries',
      'Payments',
      'Faults',
      'Messages',
      'Saved homes',
      'Browse homes',
    ])
    expect(section.items.find((i) => i.label === 'Viewings')).toMatchObject({
      to: '/workspace/portals/tenant/viewings',
      count: 2,
    })
  })

  it('gives staff the dashboard, and administration only with admin rights', () => {
    const agent = shortcutSections({ role: 'ground_agent', userId: 'u-a', ...can([]) })[0]
    expect(agent.items.map((i) => i.label)).toEqual(['Dashboard'])
    const admin = shortcutSections({ role: 'agent_admin', userId: 'u-ad', ...can(['users.manage', 'roles.assign']) })[0]
    expect(admin.items.map((i) => i.label)).toEqual(['Dashboard', 'My profile', 'Administration'])
  })
})
