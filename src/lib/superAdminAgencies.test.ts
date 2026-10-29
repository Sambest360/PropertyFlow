import { describe, expect, it, vi } from 'vitest'

/**
 * The super admin's Agencies page lists exactly the clients rows bootstrap
 * returns: both live agencies (century 21 and a landlord portfolio) show,
 * and an agency cached from an earlier load that the database no longer has
 * does not linger. Other roles keep merging (marketplace agencies).
 */
vi.mock('./api/config', async (orig) => ({
  ...(await orig<typeof import('./api/config')>()),
  isApiEnabled: true,
}))

const agency = (id: string, name: string) => ({
  id,
  name,
  slug: id,
  city: '',
  status: 'Active' as const,
  createdAt: '2026-10-15',
  enabledPermissions: null,
})

const boot = (role: string) => ({
  source: 'postgres' as const,
  fetchedAt: '2026-10-26T00:00:00Z',
  scoped: false,
  actor: { userId: 'u-acce2ada', role, agencyId: role === 'super_admin' ? null : 'ag-14gu4m' },
  agencies: [agency('ag-14gu4m', 'century 21'), agency('ag-ll-1e4f2b11', 'Amos Miller Portfolio')],
  ...Object.fromEntries(
    ['users', 'properties', 'buildings', 'units', 'leads', 'applications', 'tenancies', 'viewings', 'viewingSlots', 'payments', 'propertyDocuments', 'tickets', 'threads', 'messages', 'notifications', 'suiteAlerts', 'activities', 'propertyEvents', 'invoices', 'agencyContractors'].map((k) => [k, []]),
  ),
})

describe('super admin agencies after bootstrap', () => {
  it('shows both agencies and drops a cached one the database no longer returns', async () => {
    const { applyPostgresBootstrap, defaultStateFor } = await import('../context/AppStore')
    const base = { ...defaultStateFor(true), agencies: [{ ...agency('ag-horizon', 'Horizon Realty'), enabledPermissions: [] }] }
    const next = applyPostgresBootstrap(base as never, boot('super_admin') as never)
    expect(next.agencies.map((a) => a.name).sort()).toEqual(['Amos Miller Portfolio', 'century 21'])
    expect(next.agencies.every((a) => (a.enabledPermissions?.length ?? 0) > 0)).toBe(true)
  })

  it('keeps merging for other roles', async () => {
    const { applyPostgresBootstrap, defaultStateFor } = await import('../context/AppStore')
    const base = { ...defaultStateFor(true), agencies: [{ ...agency('ag-cape', 'Algoa Bay Estates'), enabledPermissions: [] }] }
    const next = applyPostgresBootstrap(base as never, boot('agent_admin') as never)
    expect(next.agencies.map((a) => a.id)).toContain('ag-cape')
  })
})
