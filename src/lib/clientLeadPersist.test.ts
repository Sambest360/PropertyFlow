import { describe, expect, it } from 'vitest'
import { clientMayCreateLead } from './clientLeadPersist'

/**
 * T3 B1 (Angela, Michael's ruling): who may send a NEW lead (a fresh
 * uid('LD'), e.g. the apply path) to /api/persist from the listing page.
 * Matches the real portal policy (server/portalWritePolicy.ts 'lead' case,
 * pinned in server/portalWritePolicy.test.ts "T3 B1"): staff yes; a tenant
 * creating a new lead yes; a landlord / contractor is refused ("not on the
 * portal allow-list"); a guest has no actor (401). Re-saving an EXISTING lead
 * (the enquiry the public route already created) is never done from the page.
 */
describe('T3 clientMayCreateLead', () => {
  it.each([null, undefined, '', 'guest', 'landlord', 'contractor'])('%s may not', (role) => {
    expect(clientMayCreateLead(role)).toBe(false)
  })
  it.each(['tenant', 'super_admin', 'client_admin', 'agent_admin', 'ground_agent', 'agent'])('%s may', (role) => {
    expect(clientMayCreateLead(role)).toBe(true)
  })
})
