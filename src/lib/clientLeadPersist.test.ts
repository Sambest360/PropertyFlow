import { describe, expect, it } from 'vitest'
import { clientMayPersistLead } from './clientLeadPersist'

/**
 * T3 (spec r4): a guest or tenant (or any portal user) never sends a lead to
 * /api/persist from the listing page. The server refuses it (403 "not on the
 * portal allow-list" / "enquiries are create-only"), which toasted
 * "Change not saved" and reloaded the page under the user.
 */
describe('T3 clientMayPersistLead', () => {
  it.each([null, undefined, '', 'guest', 'tenant', 'landlord', 'contractor'])('%s may not', (role) => {
    expect(clientMayPersistLead(role)).toBe(false)
  })
  it.each(['super_admin', 'client_admin', 'agent_admin', 'ground_agent', 'agent'])('%s may', (role) => {
    expect(clientMayPersistLead(role)).toBe(true)
  })
})
