import { describe, expect, it } from 'vitest'
import { hideDeletedUsersForActor } from './deletedUsers'

const data = {
  users: [
    { id: 'u1', name: 'Alice' },
    { id: 'u2', name: 'Deleted user', deletedAt: '2026-10-01T00:00:00.000Z' },
  ],
  payments: [{ id: 'p1', tenantId: 'u2' }],
}

describe('hideDeletedUsersForActor', () => {
  it('hides deleted users from every role except super admin', () => {
    for (const role of ['client_admin', 'agent_admin', 'agent', 'ground_agent', 'tenant', 'landlord', 'contractor', null]) {
      const out = hideDeletedUsersForActor(data, role)
      expect(out.users.map((u) => u.id)).toEqual(['u1'])
      expect(out.payments).toEqual(data.payments)
    }
  })
  it('keeps deleted users for a super admin', () => {
    expect(hideDeletedUsersForActor(data, 'super_admin').users).toHaveLength(2)
  })
})
