import { describe, expect, it } from 'vitest'
import { defaultWorkspacePath, postRegisterPath, resolvePostLoginPath } from './workspaceRoutes'

describe('postRegisterPath', () => {
  it('routes tenants and contractors to portal homes', () => {
    expect(postRegisterPath('tenant', false, '/workspace')).toBe('/workspace/portals/tenant')
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
