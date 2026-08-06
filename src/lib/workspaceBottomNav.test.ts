import { describe, expect, it } from 'vitest'
import { resolveWorkspaceBottomNavTabs } from './workspaceBottomNav'
import type { Permission, Role } from '../types/domain'

function mockAuth(perms: Permission[], role: Role = 'ground_agent') {
  const set = new Set(perms)
  return {
    has: (p: Permission) => set.has(p),
    hasAny: (ps: Permission[]) => ps.some((p) => set.has(p)),
    role,
    dashboardTo: '/workspace',
  }
}

describe('resolveWorkspaceBottomNavTabs', () => {
  it('always includes Home and More', () => {
    const tabs = resolveWorkspaceBottomNavTabs(mockAuth([]))
    expect(tabs.map((t) => t.id)).toEqual(['dashboard', 'more'])
  })

  it('includes Properties when assets permission is granted', () => {
    const tabs = resolveWorkspaceBottomNavTabs(mockAuth(['assets.view']))
    expect(tabs.some((t) => t.id === 'properties')).toBe(true)
    expect(tabs.find((t) => t.id === 'properties')?.to).toBe('/workspace/properties')
  })

  it('prefers applications route for Sales tab', () => {
    const tabs = resolveWorkspaceBottomNavTabs(
      mockAuth(['applications.view', 'leads.view']),
    )
    expect(tabs.find((t) => t.id === 'sales')?.to).toBe('/workspace/sales/applications')
  })

  it('caps at five tabs including More', () => {
    const tabs = resolveWorkspaceBottomNavTabs(
      mockAuth([
        'assets.view',
        'applications.view',
        'maintenance.view',
        'messages.manage',
        'payments.view',
      ]),
    )
    expect(tabs.length).toBeLessThanOrEqual(5)
    expect(tabs[tabs.length - 1]?.id).toBe('more')
  })
})
