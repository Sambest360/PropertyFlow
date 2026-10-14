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
  it('shows only Home when no other permissions', () => {
    const tabs = resolveWorkspaceBottomNavTabs(mockAuth([]))
    expect(tabs.map((t) => t.id)).toEqual(['dashboard'])
  })

  it('omits More when everything fits in five slots', () => {
    const tabs = resolveWorkspaceBottomNavTabs(
      mockAuth(['assets.view', 'applications.view', 'maintenance.view']),
    )
    expect(tabs.some((t) => t.id === 'more')).toBe(false)
    expect(tabs.length).toBeLessThanOrEqual(5)
  })

  it('includes Properties when assets permission is granted', () => {
    const tabs = resolveWorkspaceBottomNavTabs(mockAuth(['assets.view']))
    expect(tabs.some((t) => t.id === 'properties')).toBe(true)
    expect(tabs.find((t) => t.id === 'properties')?.to).toBe('/workspace/properties')
  })

  it('prefers applications route for applicants tab', () => {
    const tabs = resolveWorkspaceBottomNavTabs(
      mockAuth(['applications.view', 'leads.view']),
    )
    expect(tabs.find((t) => t.id === 'applications')?.to).toBe('/workspace/sales/applications')
  })

  it('sends landlords to the role-aware applications redirect', () => {
    const tabs = resolveWorkspaceBottomNavTabs(
      mockAuth(['portal.owner', 'applications.view', 'assets.view'], 'landlord'),
    )
    expect(tabs.find((t) => t.id === 'applications')?.to).toBe('/workspace/portals/owner')
  })

  it('sends tenants with payments.manage to the tenant portal payments page', () => {
    const tabs = resolveWorkspaceBottomNavTabs(
      mockAuth(['portal.tenant', 'payments.manage', 'maintenance.view'], 'tenant'),
    )
    expect(tabs.find((t) => t.id === 'payments')?.to).toBe('/workspace/portals/tenant/payments')
  })

  it('adds More only when tabs would overflow', () => {
    const tabs = resolveWorkspaceBottomNavTabs(
      mockAuth([
        'assets.view',
        'applications.view',
        'maintenance.view',
        'payments.view',
        'contractors.view',
        'messages.manage',
        'reports.view',
      ]),
    )
    expect(tabs.length).toBe(5)
    expect(tabs[tabs.length - 1]?.id).toBe('more')
  })
})
