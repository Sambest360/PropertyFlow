import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from 'hono'

/** Users-row lookup answer for the current test (ADM-2); null = no row. */
const target: { row: { staff: boolean } | null; throws: boolean } = { row: null, throws: false }
const session: { platformTier: string | undefined } = { platformTier: 'administrator' }

vi.mock('./db.js', () => ({
  query: vi.fn(async (sql: string) => {
    if (/FROM users/.test(sql)) {
      if (target.throws) throw new Error('db down')
      return target.row ? [target.row] : []
    }
    return []
  }),
}))
vi.mock('./entityMap.js', () => ({
  resolveUuid: vi.fn(async (_type: string, fe: string) => {
    if (/^[0-9a-f-]{36}$/i.test(fe)) return fe
    return fe === 'u-full' || fe === 'u-other-adm' || fe === 'u-tenant' || fe === 'u-x' ? `00000000-0000-4000-8000-${fe.length.toString().padStart(12, '0')}` : null
  }),
}))
vi.mock('./auth.js', () => ({
  resolveSessionUser: vi.fn(async () => ({
    id: 'uuid-adm',
    frontendId: 'u-adm',
    email: 'adm@test',
    role: 'super_admin',
    agencyId: null,
    active: true,
    platformTier: session.platformTier,
  })),
  actorFromSession: vi.fn((s: { frontendId: string; role: string; agencyId: string | null; platformTier?: string }) => ({
    userId: s.frontendId,
    role: s.role,
    agencyId: s.agencyId,
    platformTier: s.platformTier,
  })),
}))

function ctx(headers: Record<string, string>): Context {
  return {
    req: {
      header: (name: string) => headers[name] ?? headers[name.toLowerCase()],
      method: 'GET',
      url: 'http://127.0.0.1:8787/api/bootstrap',
    },
  } as unknown as Context
}

const SELF = { userId: 'u-adm', role: 'super_admin', agencyId: null, platformTier: 'administrator' }

beforeEach(() => {
  target.row = null
  target.throws = false
  session.platformTier = 'administrator'
})

describe('resolveRequestActor: Administrator', () => {
  it('cannot view as a super admin (acts as themselves)', async () => {
    const { resolveRequestActor } = await import('./requestActor.js')
    const actor = await resolveRequestActor(ctx({ 'X-User-Id': 'u-full', 'X-Role': 'super_admin' }), null)
    expect(actor).toEqual({ userId: 'u-adm', role: 'super_admin', agencyId: null, platformTier: 'administrator' })
  })
  it('keeps the tier on their own requests', async () => {
    const { resolveRequestActor } = await import('./requestActor.js')
    const actor = await resolveRequestActor(ctx({ 'X-User-Id': 'u-adm', 'X-Role': 'super_admin' }), null)
    expect(actor?.platformTier).toBe('administrator')
  })
})

describe('resolveRequestActor: Administrator cannot impersonate platform staff by lying in X-Role (ADM-2)', () => {
  it('a. owner FE id + X-Role tenant, row SUPER_ADMIN -> acts as self', async () => {
    target.row = { staff: true }
    const { resolveRequestActor } = await import('./requestActor.js')
    expect(await resolveRequestActor(ctx({ 'X-User-Id': 'u-full', 'X-Role': 'tenant' }), null)).toEqual(SELF)
  })
  it("b. owner's raw UUID + X-Role tenant -> acts as self", async () => {
    target.row = { staff: true }
    const { resolveRequestActor } = await import('./requestActor.js')
    const actor = await resolveRequestActor(ctx({ 'X-User-Id': '0a0a0a0a-0000-4000-8000-000000000001', 'X-Role': 'tenant' }), null)
    expect(actor).toEqual(SELF)
  })
  it('c. ordinary END_USER row -> impersonated actor unchanged (legit view-as)', async () => {
    target.row = { staff: false }
    const { resolveRequestActor } = await import('./requestActor.js')
    const actor = await resolveRequestActor(ctx({ 'X-User-Id': 'u-tenant', 'X-Role': 'tenant', 'X-Agency-Id': 'ag-1' }), null)
    expect(actor).toMatchObject({ userId: 'u-tenant', role: 'tenant', agencyId: 'ag-1' })
  })
  it('d. another Administrator (SUPER_ADMIN + platform_tier) -> acts as self', async () => {
    target.row = { staff: true }
    const { resolveRequestActor } = await import('./requestActor.js')
    expect(await resolveRequestActor(ctx({ 'X-User-Id': 'u-other-adm', 'X-Role': 'agent_admin' }), null)).toEqual(SELF)
  })
  it('e. the lookup throws -> fails closed, acts as self', async () => {
    target.throws = true
    const { resolveRequestActor } = await import('./requestActor.js')
    expect(await resolveRequestActor(ctx({ 'X-User-Id': 'u-full', 'X-Role': 'tenant' }), null)).toEqual(SELF)
  })
  it('f. full super admin (no tier) view-as is unchanged', async () => {
    session.platformTier = undefined
    target.row = { staff: true }
    const { resolveRequestActor } = await import('./requestActor.js')
    const actor = await resolveRequestActor(ctx({ 'X-User-Id': 'u-x', 'X-Role': 'tenant' }), null)
    expect(actor).toMatchObject({ userId: 'u-x', role: 'tenant' })
  })
})
