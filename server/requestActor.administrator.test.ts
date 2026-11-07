import { describe, expect, it, vi } from 'vitest'
import type { Context } from 'hono'

vi.mock('./db.js', () => ({ query: vi.fn(async () => []) }))
vi.mock('./entityMap.js', () => ({ resolveUuid: vi.fn(async () => null) }))
vi.mock('./auth.js', () => ({
  resolveSessionUser: vi.fn(async () => ({
    id: 'uuid-adm',
    frontendId: 'u-adm',
    email: 'adm@test',
    role: 'super_admin',
    agencyId: null,
    active: true,
    platformTier: 'administrator',
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
