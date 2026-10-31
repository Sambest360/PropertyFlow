import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Admin dashboard scoping: a super admin gets platform-wide figures, an agency
 * admin only their own agency (every query bound to their client id), and every
 * other role 403 — at the function level and over HTTP with demo actor headers.
 */
const AG_A = '11111111-1111-4111-8111-111111111111'
const ADMIN_A_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const state = vi.hoisted(() => ({
  userEnabled: null as unknown,
  agencyEnabled: null as unknown,
  agencyOfUser: 'agency-a' as string | null,
}))
const query = vi.fn()
vi.mock('./db.js', () => ({ query: (...a: unknown[]) => query(...a), databaseConfigured: true }))
vi.mock('./entityMap.js', () => ({
  resolveUuid: async (type: string, id: string) => {
    if (type === 'agency') return id === 'agency-a' ? AG_A : null
    if (type === 'user') return id === 'admin-a' ? ADMIN_A_UUID : null
    return null
  },
  staticFrontendId: () => null,
}))
vi.mock('./scopeGate.js', () => ({
  enrichActor: async (a: { role: string; agencyId: string | null }) =>
    a.role === 'super_admin' ? a : { ...a, agencyId: a.agencyId ?? state.agencyOfUser },
  agencyFeForClient: async (id: string) => (id === AG_A ? 'agency-a' : null),
}))
vi.mock('./requestActor.js', async () => {
  const { parseDemoActor } = await import('./actor.js')
  return { resolveRequestActor: async (c: Parameters<typeof parseDemoActor>[0]) => parseDemoActor(c, null) }
})

import { buildDashboard, listAccessPeople, resolveDashboardViewer } from './adminDashboard'
import { registerAdminDashboardRoutes } from './adminDashboardRoutes'
import type { DemoActor } from './actor'

const deps = { commit: () => 'abc1234', authMode: () => 'session' }
const actor = (role: string, userId = 'admin-a', agencyId: string | null = null) =>
  ({ role, userId, agencyId }) as unknown as DemoActor

beforeEach(() => {
  state.userEnabled = null
  state.agencyEnabled = null
  state.agencyOfUser = 'agency-a'
  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (sql.includes("settings->'enabledPermissions' AS enabled") && sql.includes('FROM clients WHERE id')) {
      return [{ name: 'Agency A', enabled: state.agencyEnabled, version: 2 }]
    }
    if (sql.includes("metadata->'enabledPermissions' AS enabled") && sql.includes('FROM users WHERE id')) {
      return [{ enabled: state.userEnabled, version: 2 }]
    }
    if (sql.includes('to_regclass')) return [{ t: null }]
    return []
  })
})

/** Every SQL statement sent, with its parameters. */
const calls = () => query.mock.calls.map(([sql, params]) => ({ sql: String(sql), params: (params ?? []) as unknown[] }))
/** Statements that aggregate business tables (not the viewer's own permission lookups). */
const aggregateCalls = () =>
  calls().filter((c) => !c.sql.includes('LIMIT 1') && c.sql !== 'SELECT 1' && !c.sql.includes('to_regclass'))

describe('resolveDashboardViewer', () => {
  it('gives a super admin platform scope and every section', async () => {
    const v = await resolveDashboardViewer(actor('super_admin', 'sa-1'))
    expect(v.scope.kind).toBe('platform')
    expect(v.scope.clientUuid).toBeNull()
    expect(v.sections).toEqual(expect.arrayContaining(['agencies', 'health', 'payments', 'access', 'people']))
  })

  it('gives an agency admin their own agency and no platform sections', async () => {
    for (const role of ['client_admin', 'agent_admin']) {
      const v = await resolveDashboardViewer(actor(role))
      expect(v.scope).toMatchObject({ kind: 'agency', clientUuid: AG_A, agencyId: 'agency-a', agencyName: 'Agency A' })
      expect(v.sections).not.toContain('agencies')
      expect(v.sections).not.toContain('health')
      expect(v.sections).toContain('payments')
    }
  })

  it('ignores an agency id the actor did not come with (scope follows the account)', async () => {
    state.agencyOfUser = 'agency-a'
    const v = await resolveDashboardViewer(actor('agent_admin', 'admin-a', null))
    expect(v.scope.clientUuid).toBe(AG_A)
  })

  it.each(['ground_agent', 'agent', 'landlord', 'tenant', 'contractor'])('refuses %s with 403', async (role) => {
    await expect(resolveDashboardViewer(actor(role))).rejects.toMatchObject({ status: 403, code: 'DASHBOARD_FORBIDDEN' })
  })

  it('refuses an agency admin with no agency', async () => {
    state.agencyOfUser = null
    await expect(resolveDashboardViewer(actor('client_admin'))).rejects.toMatchObject({ status: 403, code: 'NO_AGENCY' })
  })

  it('drops sections whose permission was switched off for this user', async () => {
    // agent_admin defaults minus payments.view / payments.manage
    const { rolePermissions } = await import('../src/lib/permissions')
    state.userEnabled = rolePermissions.agent_admin.filter((p) => p !== 'payments.view' && p !== 'payments.manage')
    const v = await resolveDashboardViewer(actor('agent_admin'))
    expect(v.sections).not.toContain('payments')
    expect(v.sections).toContain('leads')
  })

  it('drops sections whose module the agency has switched off', async () => {
    const { DEFAULT_AGENCY_PERMISSIONS } = await import('../src/lib/permissions')
    state.agencyEnabled = DEFAULT_AGENCY_PERMISSIONS.filter((p) => !p.startsWith('maintenance.'))
    const v = await resolveDashboardViewer(actor('client_admin'))
    expect(v.sections).not.toContain('maintenance')
  })
})

describe('buildDashboard scoping', () => {
  it('super admin: aggregates run unscoped ($1 = null) and include agencies + health', async () => {
    const v = await resolveDashboardViewer(actor('super_admin', 'sa-1'))
    query.mockClear()
    const out = await buildDashboard(v, deps)
    expect(out.scope.kind).toBe('platform')
    expect(out.agencies).toEqual([])
    expect(out.health?.commit).toBe('abc1234')
    for (const c of aggregateCalls()) {
      if (c.params.length) expect(c.params[0]).toBeNull()
    }
    expect(calls().some((c) => c.sql.includes('FROM clients c'))).toBe(true)
  })

  it('agency admin: every aggregate is bound to their client id; no agency table, health or impersonation rows', async () => {
    const v = await resolveDashboardViewer(actor('client_admin'))
    query.mockClear()
    const out = await buildDashboard(v, deps)
    expect(out.scope).toEqual({ kind: 'agency', agencyId: 'agency-a', agencyName: 'Agency A' })
    expect(out.agencies).toBeUndefined()
    expect(out.health).toBeUndefined()
    expect(out.kpis.agencies).toBeUndefined()
    const agg = aggregateCalls()
    expect(agg.length).toBeGreaterThan(5)
    for (const c of agg) {
      expect(c.params[0], c.sql.slice(0, 80)).toBe(AG_A)
      expect(c.sql).toMatch(/\$1::uuid IS NULL OR [a-z]+\.?client_id = \$1::uuid|\$1::uuid IS NULL OR client_id = \$1::uuid/)
    }
    // Only the platform-wide queries read every agency: none of them ran.
    expect(calls().some((c) => c.sql.includes('FROM clients c'))).toBe(false)
    expect(calls().some((c) => c.sql.includes('FROM clients GROUP BY status'))).toBe(false)
    const feed = calls().find((c) => c.sql.includes('FROM event_log e'))
    expect(feed?.params[1]).not.toContain('impersonation')
  })

  it('a restricted section is neither queried nor returned', async () => {
    const { rolePermissions } = await import('../src/lib/permissions')
    state.userEnabled = rolePermissions.agent_admin.filter((p) => p !== 'payments.view' && p !== 'payments.manage')
    const v = await resolveDashboardViewer(actor('agent_admin'))
    query.mockClear()
    const out = await buildDashboard(v, deps)
    expect(out.kpis.payments).toBeUndefined()
    expect(calls().some((c) => c.sql.includes('FROM payments p'))).toBe(false)
    expect(out.trends.every((t) => t.payments === null && t.paymentsAmount === null)).toBe(true)
  })
})

describe('listAccessPeople', () => {
  it('agency admin: only their agency', async () => {
    const v = await resolveDashboardViewer(actor('agent_admin'))
    query.mockClear()
    await listAccessPeople(v)
    const c = calls().find((x) => x.sql.includes('FROM users u LEFT JOIN clients cl'))
    expect(c?.params[0]).toBe(AG_A)
  })

  it('403 when the viewer cannot manage users', async () => {
    const { rolePermissions } = await import('../src/lib/permissions')
    state.userEnabled = rolePermissions.agent_admin.filter((p) => p !== 'users.manage')
    const v = await resolveDashboardViewer(actor('agent_admin'))
    await expect(listAccessPeople(v)).rejects.toMatchObject({ status: 403 })
  })
})

describe('HTTP', () => {
  const app = new Hono()
  registerAdminDashboardRoutes(app, deps)
  const get = (path: string, headers: Record<string, string> = {}) => app.request(path, { headers })

  it('401 without an actor', async () => {
    expect((await get('/api/admin/dashboard')).status).toBe(401)
  })

  it('200 platform scope for a super admin', async () => {
    const res = await get('/api/admin/dashboard', { 'X-User-Id': 'sa-1', 'X-Role': 'super_admin' })
    expect(res.status).toBe(200)
    expect((await res.json()).scope.kind).toBe('platform')
  })

  it('200 own-agency scope for an agency admin, even when another agency id is sent', async () => {
    state.agencyOfUser = 'agency-a'
    const res = await get('/api/admin/dashboard', { 'X-User-Id': 'admin-a', 'X-Role': 'client_admin', 'X-Agency-Id': 'agency-a' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.scope).toMatchObject({ kind: 'agency', agencyId: 'agency-a' })
    expect(body.agencies).toBeUndefined()
  })

  it('403 for an agency admin claiming an agency that does not resolve', async () => {
    const res = await get('/api/admin/dashboard', { 'X-User-Id': 'admin-a', 'X-Role': 'client_admin', 'X-Agency-Id': 'agency-zzz' })
    expect(res.status).toBe(403)
  })

  it.each(['ground_agent', 'agent', 'landlord', 'tenant', 'contractor'])('403 for %s on both endpoints', async (role) => {
    for (const path of ['/api/admin/dashboard', '/api/admin/access']) {
      const res = await get(path, { 'X-User-Id': 'u-1', 'X-Role': role, 'X-Agency-Id': 'agency-a' })
      expect(res.status).toBe(403)
    }
  })
})
