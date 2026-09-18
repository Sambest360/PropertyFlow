import { describe, expect, it } from 'vitest'
import {
  buildWorkspaceNavForActor,
  dedupeNavEntries,
  filterWorkspaceNav,
  flattenNavLinks,
  getWorkspaceNav,
  navItemPath,
  previewNavLabels,
} from './navigation'
import { LayoutDashboard, Heart, ClipboardList } from 'lucide-react'
import type { Permission } from '../../types/domain'
import { ACCOUNT_WISHLIST_PATH } from '../../lib/accountRoutes'

function navPaths(entries: ReturnType<typeof buildWorkspaceNavForActor>): string[] {
  return flattenNavLinks(entries).map((item) => navItemPath(item))
}

function navLabels(entries: ReturnType<typeof buildWorkspaceNavForActor>): string[] {
  return flattenNavLinks(entries).map((item) => item.label)
}

function hasUniquePaths(entries: ReturnType<typeof buildWorkspaceNavForActor>): boolean {
  const paths = navPaths(entries)
  return paths.length === new Set(paths).size
}

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

  it('shows Team with users.manage; Users nav merged into Team page', () => {
    expect(previewNavLabels(['users.manage'])).toContain('Team')
    expect(previewNavLabels(['users.manage'])).not.toContain('Users')
    expect(previewNavLabels(['users.manage'])).not.toContain('Tenants')
    expect(previewNavLabels(['roles.assign'])).not.toContain('Users')
    expect(previewNavLabels(['roles.assign', 'users.manage'])).toContain('Team')
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

  it('flattens small nav trees into top-level links', () => {
    const entries = filterWorkspaceNav(
      getWorkspaceNav(),
      (p) => ['payments.view', 'maintenance.view', 'reports.view'].includes(p),
      (ps) => ps.some((p) => ['payments.view', 'maintenance.view', 'reports.view'].includes(p)),
    )
    expect(entries.every((e) => e.type === 'link')).toBe(true)
    expect(entries.some((e) => e.type === 'link' && e.item.label === 'Payments')).toBe(true)
  })

  it('dedupes nav entries by destination path', () => {
    const duped = dedupeNavEntries([
      {
        type: 'link',
        item: {
          to: '/workspace/portals/tenant/applications',
          label: 'My applications',
          icon: ClipboardList,
        },
      },
      {
        type: 'link',
        item: { to: '/account/wishlist', label: 'Wishlist', icon: Heart },
      },
      {
        type: 'link',
        item: {
          to: '/workspace/portals/tenant/applications',
          label: 'My applications',
          icon: ClipboardList,
        },
      },
      {
        type: 'link',
        item: { to: '/workspace/portals/tenant', label: 'Dashboard', end: true, icon: LayoutDashboard },
      },
    ])
    expect(duped).toHaveLength(3)
    expect(
      duped.filter(
        (e) => e.type === 'link' && e.item.to === '/workspace/portals/tenant/applications',
      ),
    ).toHaveLength(1)
  })
})

describe('buildWorkspaceNavForActor portal dedupe', () => {
  const has =
    (permissions: Permission[]) =>
    (p: Permission) =>
      permissions.includes(p)
  const hasAny =
    (permissions: Permission[]) =>
    (ps: Permission[]) =>
      ps.some((p) => permissions.includes(p))

  it('contractor with tenant permissions sees one dashboard and no applicant links', () => {
    const entries = buildWorkspaceNavForActor({
      role: 'contractor',
      has: has(['portal.contractor', 'portal.tenant', 'maintenance.view']),
      hasAny: hasAny(['portal.contractor', 'portal.tenant', 'maintenance.view']),
    })
    const paths = navPaths(entries)
    const labels = navLabels(entries)

    expect(labels.filter((l) => l === 'Dashboard')).toHaveLength(1)
    expect(paths.filter((p) => p === '/workspace/portals/contractor')).toHaveLength(1)
    expect(labels).not.toContain('My applications')
    expect(labels).not.toContain('Wishlist')
    expect(labels).not.toContain('My jobs')
    expect(labels).toContain('Maintenance')
    expect(hasUniquePaths(entries)).toBe(true)
  })

  it('pure tenant applicant sees one dashboard and no contractor portal links', () => {
    const entries = buildWorkspaceNavForActor({
      role: 'tenant',
      has: has(['portal.tenant', 'maintenance.view']),
      hasAny: hasAny(['portal.tenant', 'maintenance.view']),
      tenantHasStaffNav: false,
      tenantOccupancyReady: false,
    })
    const paths = navPaths(entries)
    const labels = navLabels(entries)

    expect(labels.filter((l) => l === 'Dashboard')).toHaveLength(1)
    expect(paths.filter((p) => p === '/workspace/portals/tenant')).toHaveLength(1)
    expect(labels).toContain('My applications')
    expect(labels).toContain('Wishlist')
    expect(labels).not.toContain('My jobs')
    expect(paths).not.toContain('/workspace/portals/contractor')
    expect(hasUniquePaths(entries)).toBe(true)
  })

  it('tenant with contractor permission does not get duplicate maintenance paths from operations + portal', () => {
    const entries = buildWorkspaceNavForActor({
      role: 'tenant',
      has: has(['portal.tenant', 'maintenance.view', 'portal.contractor']),
      hasAny: hasAny(['portal.tenant', 'maintenance.view', 'portal.contractor']),
      tenantHasStaffNav: false,
      tenantOccupancyReady: true,
    })
    const paths = navPaths(entries)

    expect(navLabels(entries).filter((l) => l === 'Dashboard')).toHaveLength(1)
    expect(paths.filter((p) => p === '/workspace/portals/tenant/maintenance')).toHaveLength(1)
    expect(paths).not.toContain('/workspace/operations/maintenance')
    expect(paths).not.toContain('/workspace/portals/contractor')
    expect(hasUniquePaths(entries)).toBe(true)
  })

  it('landlord portal actor gets a single dashboard without tenant or contractor links', () => {
    const entries = buildWorkspaceNavForActor({
      role: 'landlord',
      has: has(['portal.owner', 'assets.view', 'portal.tenant']),
      hasAny: hasAny(['portal.owner', 'assets.view', 'portal.tenant']),
    })
    const paths = navPaths(entries)
    const labels = navLabels(entries)

    expect(labels.filter((l) => l === 'Dashboard')).toHaveLength(1)
    expect(paths.filter((p) => p === '/workspace/portals/owner')).toHaveLength(1)
    expect(labels).not.toContain('My applications')
    expect(labels).not.toContain('My jobs')
    expect(hasUniquePaths(entries)).toBe(true)
  })

  it('staff without portal permissions keeps grouped nav without duplicate paths', () => {
    const entries = buildWorkspaceNavForActor({
      role: 'ground_agent',
      has: has(['assets.view', 'maintenance.view', 'applications.view']),
      hasAny: hasAny(['assets.view', 'maintenance.view', 'applications.view']),
    })

    expect(hasUniquePaths(entries)).toBe(true)
    expect(navLabels(entries).filter((l) => l === 'Dashboard')).toHaveLength(1)
  })

  it('Trust & Banking stays grouped with Dashboard not active on child pages', () => {
    const labels = previewNavLabels(['trust.view', 'trust.allocate', 'trust.approve_payout'])
    expect(labels).toContain('Trust Dashboard')
    expect(labels).toContain('Cashbook')

    // The dashboard link must be end-anchored so /workspace/trust/cashbook
    // does not highlight the Dashboard item (GO#5 nav parity). The filtered
    // set is flat here (smart-flatten), so scan all links.
    const dashboardEntry = filterWorkspaceNav(
      getWorkspaceNav(),
      (p) => p === 'trust.view',
      (ps) => ps.includes('trust.view'),
    )
      .flatMap((e) => (e.type === 'link' ? [e.item] : e.group.children))
      .find((c) => navItemPath(c) === '/workspace/trust')
    expect(dashboardEntry?.end).toBe(true)
  })

  it('Compliance nav item requires compliance.view', () => {
    expect(previewNavLabels(['compliance.view'])).toContain('Compliance Dashboard')
    expect(previewNavLabels(['trust.view'])).not.toContain('Compliance Dashboard')
  })
})
