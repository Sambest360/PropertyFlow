import { describe, expect, it } from 'vitest'
import {
  capabilityGroups,
  dashboardSectionRows,
  navPathsFor,
  pageRows,
  permissionReason,
  roleSubjects,
} from './accessMatrix'
import { rolePermissions } from './permissions'

describe('access matrix', () => {
  it('pages follow the real sidebar per role', () => {
    expect(navPathsFor({ role: 'super_admin' }).has('/workspace/admin/agencies')).toBe(true)
    expect(navPathsFor({ role: 'agent_admin' }).has('/workspace/admin/agencies')).toBe(false)
    expect(navPathsFor({ role: 'agent_admin' }).has('/workspace/operations/payments')).toBe(true)
    expect(navPathsFor({ role: 'tenant' }).has('/workspace/people/staff')).toBe(false)
    const rows = pageRows(roleSubjects())
    const agencies = rows.find((r) => r.path === '/workspace/admin/agencies')
    expect(agencies?.allowed).toMatchObject({ super_admin: true, client_admin: false, tenant: false })
  })

  it('dashboard sections match the server rule', () => {
    const rows = dashboardSectionRows(roleSubjects())
    const health = rows.find((r) => r.id === 'health')!
    expect(health.allowed).toMatchObject({ super_admin: true, client_admin: false, agent_admin: false })
    const payments = rows.find((r) => r.id === 'payments')!
    expect(payments.allowed).toMatchObject({ super_admin: true, agent_admin: true, ground_agent: false, tenant: false })
  })

  it('explains why a permission is denied for a person', () => {
    const userEnabled = rolePermissions.agent_admin.filter((p) => p !== 'payments.view')
    expect(permissionReason({ role: 'agent_admin', userEnabled }, 'payments.view')).toBe('restricted')
    expect(permissionReason({ role: 'agent_admin', agencyEnabled: ['leads.view'] }, 'payments.view')).toBe('agency-off')
    expect(permissionReason({ role: 'tenant' }, 'platform.manage')).toBe('not-in-role')
    expect(permissionReason({ role: 'super_admin', userEnabled: ['leads.view'] }, 'payments.view')).toBe('role')
  })

  it('covers every permission in the catalogue', () => {
    const listed = new Set(capabilityGroups().flatMap((g) => g.rows.flatMap((r) => r.permissions)))
    for (const p of rolePermissions.super_admin) expect(listed.has(p), p).toBe(true)
  })
})
