import { describe, expect, it } from 'vitest'
import { defaultWorkspacePath, postRegisterPath, resolvePostLoginPath, safeNextPath } from './workspaceRoutes'

describe('postRegisterPath', () => {
  it('routes tenants, landlords, and contractors to portal homes', () => {
    expect(postRegisterPath('tenant', false, '/workspace')).toBe('/workspace/portals/tenant')
    expect(postRegisterPath('landlord', false, '/workspace')).toBe('/workspace/portals/owner')
    expect(postRegisterPath('contractor', false, '/workspace')).toBe(
      '/workspace/portals/contractor',
    )
  })

  it('preserves listing/browse next for tenants', () => {
    expect(postRegisterPath('tenant', false, '/listing/p-1')).toBe('/listing/p-1')
    expect(postRegisterPath('tenant', false, '/browse?q=cpt')).toBe('/browse?q=cpt')
  })

  it('sends bootstrap founders to new agency', () => {
    expect(postRegisterPath('tenant', true, '/workspace')).toBe('/workspace/admin/agencies/new')
  })
})

describe('defaultWorkspacePath / resolvePostLoginPath', () => {
  it('lands tenants on the portal home', () => {
    expect(defaultWorkspacePath('tenant')).toBe('/workspace/portals/tenant')
    expect(resolvePostLoginPath('tenant', '/workspace')).toBe('/workspace/portals/tenant')
  })
})

describe('T5: sign in lands each portal role in its own portal', () => {
  // LoginPage defaults next to '/workspace' (LoginPage.tsx:23) and calls resolvePostLoginPath (:84, :94).
  it.each([
    ['landlord', '/workspace/portals/owner'],
    ['tenant', '/workspace/portals/tenant'],
    ['contractor', '/workspace/portals/contractor'],
  ] as const)('%s → %s', (role, path) => {
    expect(resolvePostLoginPath(role, '/workspace')).toBe(path)
    expect(resolvePostLoginPath(role, '/workspace/')).toBe(path)
    expect(resolvePostLoginPath(role, null)).toBe(path)
  })

  it('staff roles still land on the workspace home', () => {
    expect(resolvePostLoginPath('client_admin', '/workspace')).toBe('/workspace')
  })
})

describe('email deep links survive sign-in (RequireAuth → /login?next= → resolvePostLoginPath)', () => {
  it('returns the signed-out visitor to the exact page the email linked', () => {
    expect(resolvePostLoginPath('tenant', '/workspace/portals/tenant/applications/APP-1042?tab=documents')).toBe(
      '/workspace/portals/tenant/applications/APP-1042?tab=documents',
    )
    expect(resolvePostLoginPath('agent', '/workspace/sales/viewings/property/PR-1011?booking=BK-1')).toBe(
      '/workspace/sales/viewings/property/PR-1011?booking=BK-1',
    )
    expect(resolvePostLoginPath('landlord', '/workspace/portals/owner')).toBe('/workspace/portals/owner')
  })

  it('never leaves the site or loops back to sign-in', () => {
    for (const bad of ['https://evil.example/x', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)', '/login?next=/x', '/register']) {
      expect(safeNextPath(bad), bad).toBeNull()
      expect(resolvePostLoginPath('tenant', bad), bad).toBe('/workspace/portals/tenant')
    }
  })
})
