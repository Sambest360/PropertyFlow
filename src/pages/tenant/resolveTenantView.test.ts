import { describe, expect, it } from 'vitest'

/** Mirror of TenantPortal.resolveTenantView for deep-link routing (FW-29). */
function resolveTenantView(pathname: string): string {
  if (pathname.includes('/applications')) return 'applications'
  if (pathname.includes('/maintenance')) return 'maintenance'
  if (pathname.includes('/messages')) return 'messages'
  if (pathname.includes('/complaints')) return 'complaints'
  if (pathname.includes('/viewings')) return 'viewings'
  if (pathname.includes('/leases')) return 'leases'
  if (pathname.includes('/payments')) return 'payments'
  return 'home'
}

describe('tenant portal deep links', () => {
  it('maps leases and payments paths', () => {
    expect(resolveTenantView('/workspace/portals/tenant/leases')).toBe('leases')
    expect(resolveTenantView('/workspace/portals/tenant/payments')).toBe('payments')
  })
})
