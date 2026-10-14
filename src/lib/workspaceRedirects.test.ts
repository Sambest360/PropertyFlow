import { describe, expect, it } from 'vitest'
import type { Permission } from '../types/domain'
import { resolveWorkspaceApplicationsPath, resolveWorkspaceLeasesPath } from './workspaceRedirects'

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

  it('sends landlords to owner portal', () => {
    expect(resolveWorkspaceApplicationsPath(hasOnly('portal.owner'))).toBe('/workspace/portals/owner')
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

  it('sends tenants to tenant leases deep link', () => {
    expect(resolveWorkspaceLeasesPath(hasOnly('portal.tenant'))).toBe('/workspace/portals/tenant/leases')
  })

  it('sends landlords to owner portal', () => {
    expect(resolveWorkspaceLeasesPath(hasOnly('portal.owner'))).toBe('/workspace/portals/owner')
  })
})
