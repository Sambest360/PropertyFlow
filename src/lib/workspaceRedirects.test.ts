import { describe, expect, it } from 'vitest'
import type { Permission } from '../types/domain'
import {
  resolveWorkspaceApplicationsPath,
  resolveWorkspaceLeasesPath,
  resolveWorkspacePaymentsPath,
} from './workspaceRedirects'

function hasOnly(...perms: Permission[]) {
  const set = new Set(perms)
  return (p: Permission) => set.has(p)
}

describe('resolveWorkspaceApplicationsPath', () => {
  it('prefers sales for agency staff', () => {
    expect(resolveWorkspaceApplicationsPath(hasOnly('applications.view'))).toBe(
      '/workspace/sales/applications',
    )
  })

  it("prefers the owner's applications page when landlord pack includes applications.view", () => {
    expect(
      resolveWorkspaceApplicationsPath(hasOnly('applications.view', 'portal.owner'), 'landlord'),
    ).toBe('/workspace/portals/owner/applications')
  })

  it("sends landlords to their applications page, not the dashboard", () => {
    expect(resolveWorkspaceApplicationsPath(hasOnly('portal.owner'))).toBe('/workspace/portals/owner/applications')
  })

  it('falls back to owner portal for landlord role without explicit portal perm', () => {
    expect(resolveWorkspaceApplicationsPath(hasOnly('reports.view'), 'landlord')).toBe(
      '/workspace/portals/owner',
    )
  })

  it('sends tenants to tenant applications', () => {
    expect(resolveWorkspaceApplicationsPath(hasOnly('portal.tenant'))).toBe(
      '/workspace/portals/tenant/applications',
    )
  })

  it('falls back to workspace home', () => {
    expect(resolveWorkspaceApplicationsPath(hasOnly('reports.view'))).toBe('/workspace')
  })
})

describe('resolveWorkspaceLeasesPath', () => {
  it('sends staff to people leases', () => {
    expect(resolveWorkspaceLeasesPath(hasOnly('occupants.view'))).toBe('/workspace/people/leases')
  })

  it('prefers owner portal when landlord pack includes occupants.view', () => {
    expect(
      resolveWorkspaceLeasesPath(hasOnly('occupants.view', 'portal.owner'), 'landlord'),
    ).toBe('/workspace/portals/owner')
  })

  it('sends tenants to tenant leases deep link', () => {
    expect(resolveWorkspaceLeasesPath(hasOnly('portal.tenant'))).toBe('/workspace/portals/tenant/leases')
  })

  it('sends landlords to owner portal', () => {
    expect(resolveWorkspaceLeasesPath(hasOnly('portal.owner'))).toBe('/workspace/portals/owner')
  })

  it('falls back to owner portal for landlord role without explicit portal perm', () => {
    expect(resolveWorkspaceLeasesPath(hasOnly('reports.view'), 'landlord')).toBe(
      '/workspace/portals/owner',
    )
  })
})

describe('resolveWorkspacePaymentsPath', () => {
  it('sends staff to operations payments', () => {
    expect(resolveWorkspacePaymentsPath(hasOnly('payments.view'))).toBe(
      '/workspace/operations/payments',
    )
  })

  it('prefers owner portal when landlord pack includes payments.view', () => {
    expect(
      resolveWorkspacePaymentsPath(hasOnly('payments.view', 'portal.owner'), 'landlord'),
    ).toBe('/workspace/portals/owner')
  })

  it('sends tenants to tenant payments deep link', () => {
    expect(resolveWorkspacePaymentsPath(hasOnly('portal.tenant', 'payments.manage'))).toBe(
      '/workspace/portals/tenant/payments',
    )
  })

  it('sends landlords to owner portal', () => {
    expect(resolveWorkspacePaymentsPath(hasOnly('portal.owner'))).toBe('/workspace/portals/owner')
  })

  it('falls back to owner portal for landlord role without explicit portal perm', () => {
    expect(resolveWorkspacePaymentsPath(hasOnly('reports.view'), 'landlord')).toBe(
      '/workspace/portals/owner',
    )
  })
})
