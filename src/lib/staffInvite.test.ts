import { describe, expect, it, vi } from 'vitest'
import { inviteStaff, rolesInviterMayOffer } from './staffInvite'

describe('rolesInviterMayOffer', () => {
  it('never offers super admin', () => {
    for (const role of ['super_admin', 'client_admin', 'agent_admin', 'ground_agent', 'agent'] as const) {
      expect(rolesInviterMayOffer(role)).not.toContain('super_admin')
    }
  })

  it('offers only roles at or below the inviter', () => {
    expect(rolesInviterMayOffer('super_admin')).toEqual([
      'client_admin',
      'agent_admin',
      'ground_agent',
      'agent',
    ])
    expect(rolesInviterMayOffer('client_admin')).toEqual([
      'client_admin',
      'agent_admin',
      'ground_agent',
      'agent',
    ])
    expect(rolesInviterMayOffer('agent_admin')).toEqual(['agent_admin', 'ground_agent', 'agent'])
    expect(rolesInviterMayOffer('ground_agent')).toEqual(['ground_agent', 'agent'])
    expect(rolesInviterMayOffer('agent')).toEqual(['agent'])
    expect(rolesInviterMayOffer('landlord')).toEqual([])
    expect(rolesInviterMayOffer('tenant')).toEqual([])
  })
})

describe('inviteStaff', () => {
  it('posts email, role, and agency_id with the bearer token', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ user_id: 'user-42' }), { status: 200 }))
    const result = await inviteStaff(
      {
        email: ' new.agent@agency.co.za ',
        role: 'ground_agent',
        agencyId: 'ag-horizon',
        inviterRole: 'client_admin',
      },
      {
        fetchImpl,
        getAccessToken: async () => 'session-token',
        apiBase: '',
      },
    )

    expect(result).toEqual({ user_id: 'user-42' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/invite')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer session-token',
    })
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'new.agent@agency.co.za',
      role: 'ground_agent',
      agency_id: 'ag-horizon',
    })
  })

  it('does not call the endpoint for super admin or a role above the inviter', async () => {
    const fetchImpl = vi.fn()
    const deps = { fetchImpl, getAccessToken: async () => 'tok', apiBase: '' }

    await expect(
      inviteStaff(
        { email: 'a@b.co', role: 'super_admin', agencyId: 'ag-1', inviterRole: 'super_admin' },
        deps,
      ),
    ).rejects.toThrow(/cannot invite/i)

    await expect(
      inviteStaff(
        { email: 'a@b.co', role: 'client_admin', agencyId: 'ag-1', inviterRole: 'ground_agent' },
        deps,
      ),
    ).rejects.toThrow(/cannot invite/i)

    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
