import { describe, expect, it, vi } from 'vitest'
import type { Context } from 'hono'

vi.mock('./db.js', () => ({ query: vi.fn() }))
vi.mock('./entityMap.js', () => ({ resolveUuid: vi.fn() }))
vi.mock('./auth.js', () => ({
  resolveSessionUser: vi.fn(async () => ({
    id: 'uuid-tenant',
    frontendId: 'u-tenant',
    email: 'tenant@test',
    role: 'tenant',
    agencyId: 'ag-1',
    active: true,
  })),
  actorFromSession: vi.fn((s: { frontendId: string; role: string; agencyId: string | null }) => ({
    userId: s.frontendId,
    role: s.role,
    agencyId: s.agencyId,
  })),
}))

function mockContext(headers: Record<string, string>): Context {
  return {
    req: {
      header: (name: string) => headers[name] ?? headers[name.toLowerCase()],
      method: 'GET',
      url: 'http://127.0.0.1:8787/api/bootstrap',
    },
  } as unknown as Context
}

describe('resolveRequestActor', () => {
  it('ignores spoofed X-User-Id when a non–super-admin session is present', async () => {
    const prev = { ...process.env }
    process.env.NODE_ENV = 'production'
    process.env.ALLOW_DEMO_ACTOR = '1'
    const { resolveRequestActor } = await import('./requestActor.js')
    const actor = await resolveRequestActor(
      mockContext({
        'X-User-Id': 'u-super',
        'X-Role': 'super_admin',
        'X-Agency-Id': 'ag-evil',
      }),
      null,
    )
    expect(actor).toEqual({ userId: 'u-tenant', role: 'tenant', agencyId: 'ag-1' })
    process.env = prev
  })
})
