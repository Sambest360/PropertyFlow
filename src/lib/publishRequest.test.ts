import { describe, expect, it, vi } from 'vitest'
import type { AppUser } from '../types/domain'
import { agencyAdminsFor, publishRequestMessage, requestListingPublish } from './publishRequest'

const u = (id: string, role: string, agencyId: string | null, active = true) =>
  ({ id, name: id, role, agencyId, active }) as unknown as AppUser

const users = [
  u('adm-1', 'client_admin', 'ag-1'),
  u('adm-2', 'agent_admin', 'ag-1'),
  u('adm-off', 'agent_admin', 'ag-1', false),
  u('adm-other', 'client_admin', 'ag-2'),
  u('intern', 'agent', 'ag-1'),
]

describe('requestListingPublish', () => {
  it("notifies only the listing agency's active admins", () => {
    expect(agencyAdminsFor('ag-1', users).map((a) => a.id)).toEqual(['adm-1', 'adm-2'])
    const notify = vi.fn()
    const count = requestListingPublish({
      property: { id: 'PR-9', title: 'Fernglen house', agencyId: 'ag-1' },
      requester: users[4],
      users,
      notify,
    })
    expect(count).toBe(2)
    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify.mock.calls[0][0]).toMatchObject({ userId: 'adm-1', link: '/workspace/properties/PR-9' })
  })

  it('tells the agent when no admin can be notified', () => {
    expect(publishRequestMessage(0).title).toBe('Saved as a draft')
    expect(publishRequestMessage(2).body).toMatch(/notified your agency admins/)
  })
})
