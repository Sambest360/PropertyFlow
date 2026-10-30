import { describe, expect, it } from 'vitest'
import {
  allRestricted,
  isRestrictedPermission,
  normalizeStoredPermissions,
  PERMISSIONS_VERSION,
  rolePermissions,
} from '../src/lib/permissions'
import type { Permission, Role } from '../src/types/domain'
import { assertNotRestricted, COLLECTION_PERMISSIONS, stripRestrictedCollections, WRITE_PERMISSION } from './permissionGate'

const ROLES = Object.keys(rolePermissions) as Role[]
const payload = () => Object.fromEntries(Object.keys(COLLECTION_PERMISSIONS).map((k) => [k, [{ id: `${k}-1` }]]))

describe('per-user permission restrictions', () => {
  it('a user on their role defaults keeps every collection and every write', async () => {
    for (const role of ROLES) {
      const defaults = [...rolePermissions[role]]
      const p = payload()
      expect(stripRestrictedCollections(p, role, defaults), role).toBe(p)
      expect(stripRestrictedCollections(p, role, null), role).toBe(p)
      for (const perm of Object.values(WRITE_PERMISSION)) {
        await expect(assertNotRestricted({ role, userId: 'u-x' }, perm, defaults), `${role} ${perm}`).resolves.toBeUndefined()
      }
    }
  })

  it('switching off a permission strips its data and refuses its writes', async () => {
    const list = rolePermissions.ground_agent.filter((p) => p !== 'payments.view' && p !== 'leads.manage')
    const out = stripRestrictedCollections(payload(), 'ground_agent', list) as Record<string, unknown[]>
    expect(out.payments).toEqual([])
    expect(out.leads).toHaveLength(1) // leads.view still held
    expect(out.tickets).toHaveLength(1)
    await expect(assertNotRestricted({ role: 'ground_agent', userId: 'u-x' }, 'leads.manage', list)).rejects.toMatchObject({
      status: 403,
      code: 'PERMISSION_RESTRICTED',
    })
    await expect(assertNotRestricted({ role: 'ground_agent', userId: 'u-x' }, 'maintenance.manage', list)).resolves.toBeUndefined()
  })

  it('a tenant switched off from faults loses tickets; super admins are never restricted', () => {
    const tenant = rolePermissions.tenant.filter((p) => !p.startsWith('maintenance.'))
    expect((stripRestrictedCollections(payload(), 'tenant', tenant) as Record<string, unknown[]>).tickets).toEqual([])
    expect(isRestrictedPermission('super_admin', 'payments.view', ['assets.view'])).toBe(false)
  })

  it('a permission the role never had is not a restriction; an extra one granted counts as held', () => {
    expect(isRestrictedPermission('tenant', 'trust.view', ['portal.tenant'])).toBe(false)
    // agent_admin's defaults lack leads.manage: never "restricted"
    expect(isRestrictedPermission('agent_admin', 'leads.manage', ['leads.view'])).toBe(false)
    // granted occupants.view keeps tenancies even with everything else off
    expect(allRestricted('ground_agent', ['occupants.view'], ['occupants.view'])).toBe(false)
  })
})

describe('permission catalogue version 2', () => {
  it('lists saved before version 2 gain the new permissions their old ones implied', () => {
    const old = normalizeStoredPermissions(['leads.view', 'users.manage', 'applications.view'], undefined)!
    expect(old).toEqual(expect.arrayContaining(['escalations.view', 'billing.view', 'screening.run']))
    const noLeads = normalizeStoredPermissions(['assets.view'], 1)!
    expect(noLeads).not.toContain('escalations.view')
  })

  it('a list saved at version 2 is taken exactly as saved (a removed new permission stays removed)', () => {
    const saved: Permission[] = ['leads.view', 'users.manage']
    expect(normalizeStoredPermissions(saved, PERMISSIONS_VERSION)).toEqual(saved)
    expect(normalizeStoredPermissions([], 2)).toBeNull()
  })

  it('new permissions default to whoever could use those areas before', () => {
    for (const role of ['client_admin', 'agent_admin', 'ground_agent', 'agent'] as Role[]) {
      expect(rolePermissions[role], role).toEqual(expect.arrayContaining(['escalations.view', 'screening.run']))
    }
    expect(rolePermissions.agent_admin).toContain('billing.view')
    expect(rolePermissions.client_admin).toContain('billing.view')
    expect(rolePermissions.ground_agent).not.toContain('billing.view')
    for (const role of ['tenant', 'landlord', 'contractor'] as Role[]) {
      expect(rolePermissions[role]).not.toContain('escalations.view')
    }
  })
})
