import { beforeEach, describe, expect, it, vi } from 'vitest'

const inserts: unknown[][] = []
const links: Record<string, string[]> = {}
const roles: Record<string, string> = {}
vi.mock('./db.js', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith('INSERT INTO notifications')) {
      inserts.push(params)
      return []
    }
    if (sql.startsWith('SELECT role FROM users')) {
      const r = roles[String(params[0])]
      return r ? [{ role: r }] : []
    }
    if (sql.startsWith('SELECT client_id FROM users')) return (links[String(params[0])] ?? []).map((c) => ({ client_id: c }))
    return []
  },
}))
vi.mock('./entityMap.js', () => ({
  resolveUuid: async (_t: string, ref: string) => ({ tenant: U.tenant, agent: U.agent, other: U.other, admin: U.admin })[ref] ?? null,
  ensureUuid: async () => '99999999-9999-9999-9999-999999999999',
}))

const U = {
  tenant: '11111111-1111-1111-1111-111111111111',
  agent: '22222222-2222-2222-2222-222222222222',
  other: '33333333-3333-3333-3333-333333333333',
  admin: '44444444-4444-4444-4444-444444444444',
}

beforeEach(() => {
  inserts.length = 0
  links[U.tenant] = ['agency-a']
  links[U.agent] = ['agency-a']
  links[U.other] = ['agency-b']
  links[U.admin] = []
  roles[U.tenant] = 'END_USER'
  roles[U.agent] = 'GROUND_AGENT'
  roles[U.other] = 'GROUND_AGENT'
  roles[U.admin] = 'SUPER_ADMIN'
})

describe('dispatchNotifications', () => {
  it('delivers to people linked through an agency and the platform team, refuses strangers', async () => {
    const { dispatchNotifications } = await import('./notificationDispatch.js')
    const r = await dispatchNotifications({ userId: 'tenant', role: 'tenant', agencyId: null } as never, [
      { id: 'N-1', userId: 'agent', title: 'New application', body: 'x', resource: 'applicant' },
      { id: 'N-2', userId: 'other', title: 'Spam', body: 'x' },
      { id: 'N-3', userId: 'admin', title: 'Help', body: 'x' },
      { id: 'N-4', userId: 'agent', title: '' },
    ])
    expect(r).toEqual({ delivered: 2, refused: 2 })
    expect(inserts.map((p) => p[2])).toEqual([U.agent, U.admin])
  })

  it('lets a super admin notify anyone', async () => {
    const { dispatchNotifications } = await import('./notificationDispatch.js')
    const r = await dispatchNotifications({ userId: 'admin', role: 'super_admin', agencyId: null } as never, [
      { userId: 'other', title: 'Platform notice', body: 'x' },
    ])
    expect(r.delivered).toBe(1)
  })
})
