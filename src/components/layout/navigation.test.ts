import { describe, expect, it } from 'vitest'
import { filterWorkspaceNav, getWorkspaceNav, previewNavLabels } from './navigation'
import type { Permission } from '../../types/domain'

describe('workspace nav permission filtering', () => {
  it('hides Agencies from non-platform roles', () => {
    const has = (p: Permission) => p !== 'platform.manage'
    const hasAny = (ps: Permission[]) => ps.some(has)
    const labels = previewNavLabels([
      'users.manage',
      'config.manage',
      'assets.view',
      'reports.view',
    ])
    expect(labels).not.toContain('Agencies')
    expect(labels).toContain('Reports')
    expect(labels).toContain('Team')
    expect(labels).not.toContain('Users')

    const filtered = filterWorkspaceNav(getWorkspaceNav(), has, hasAny)
    const flat = filtered.flatMap((e) =>
      e.type === 'link' ? [e.item.label] : e.group.children.map((c) => c.label),
    )
    expect(flat).not.toContain('Agencies')
  })

  it('shows Users only with roles.assign; Team with users.manage', () => {
    expect(previewNavLabels(['users.manage'])).toContain('Team')
    expect(previewNavLabels(['users.manage'])).not.toContain('Users')
    expect(previewNavLabels(['users.manage'])).not.toContain('Tenants')
    expect(previewNavLabels(['roles.assign'])).toContain('Users')
    expect(previewNavLabels(['occupants.view'])).toContain('Tenants')
  })

  it('shows Agencies only when platform.manage is present', () => {
    expect(previewNavLabels(['platform.manage'])).toContain('Agencies')
  })

  it('keeps Reports as a trailing top-level insight link when allowed', () => {
    const entries = filterWorkspaceNav(
      getWorkspaceNav(),
      (p) => p === 'reports.view',
      (ps) => ps.includes('reports.view'),
    )
    const last = entries[entries.length - 1]
    expect(last?.type).toBe('link')
    if (last?.type === 'link') {
      expect(last.item.label).toBe('Reports')
      expect(last.item.to).toBe('/workspace/insights/reports')
    }
  })

  it('does not expose portal links to staff-only packs', () => {
    const labels = previewNavLabels([
      'assets.view',
      'leads.view',
      'users.manage',
      'reports.view',
    ])
    expect(labels).not.toContain('My portfolio')
    expect(labels).not.toContain('My tenancy')
    expect(labels).not.toContain('My applications')
    expect(labels).not.toContain('Wishlist')
    expect(labels).not.toContain('My jobs')
  })

  it('shows applicant wishlist and applications with portal.tenant', () => {
    const labels = previewNavLabels(['portal.tenant'])
    expect(labels).toContain('My tenancy')
    expect(labels).toContain('My applications')
    expect(labels).toContain('Wishlist')
  })
})
