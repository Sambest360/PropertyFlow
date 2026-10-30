/**
 * T3 / Jim C6 + Angela B1: a behavioural pin (not a source scan).
 * - Register interest (guest and tenant) makes **0 calls to /api/persist**:
 *   the public route already created that lead, and a second save of an
 *   EXISTING lead is what the server refuses (tenant: 403 "enquiries are
 *   create-only"; guest: 401, no actor), the original bug.
 * - Apply: a tenant's "Application Submitted" lead is a NEW lead and IS saved
 *   (exactly one /api/persist upsert of a fresh id; the real portal policy
 *   allows it, see server/portalWritePolicy.test.ts "T3 B1"). A guest,
 *   landlord or contractor keeps it local (the server refuses those).
 *
 * Drives the real AppStoreProvider (rendered once with renderToStaticMarkup,
 * store captured through useStore) and the real submitListingEnquiry client.
 * The network is a stubbed global fetch that records every URL. The only
 * stubs are the write gate (forced open, so a persist WOULD go out) and
 * the API config (API mode on). A staff createLead is the positive control:
 * it proves the harness sees an /api/persist call when one is made, so the
 * zeros below are not vacuous.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../lib/api/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api/config')>()),
  isApiEnabled: true,
}))
vi.mock('../lib/auth/writeGate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth/writeGate')>()),
  canPersistWrites: () => true,
  assertCanPersistWrites: () => true,
}))

import { AppStoreProvider, useStore } from './AppStore'
import { submitListingEnquiry } from '../lib/api/listingEnquiryApi'
import { clientMayCreateLead } from '../lib/clientLeadPersist'
import { applyLeadInput } from '../lib/listingEnquirySubmit'
import { shouldRecordEnquiryLocally } from '../lib/listingEnquiryOutcome'

type Store = ReturnType<typeof useStore>
const calls: string[] = []
const bodies: Array<{ url: string; body: unknown }> = []

function fakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone() {
      return fakeResponse(status, body)
    },
  } as unknown as Response
}

function mountStore(): Store {
  let store: Store | null = null
  function Capture() {
    store = useStore()
    return null
  }
  renderToStaticMarkup(
    <AppStoreProvider>
      <Capture />
    </AppStoreProvider>,
  )
  if (!store) throw new Error('store not captured')
  return store
}

async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5))
}

const persistCalls = () => calls.filter((u) => u.includes('/api/persist'))
const ENQUIRY_LEAD = 'LD-guest-1700000000000-abc123'

const leadBase = {
  agencyId: 'agency-1',
  propertyId: 'PR-1011',
  agentId: 'u-james',
  name: 'Kelly Test',
  email: 'kelly@example.com',
  phone: '0820000000',
  channel: 'Web Form' as const,
  type: 'Rent' as const,
  value: 6500,
}

beforeEach(() => {
  calls.length = 0
  bodies.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      calls.push(u)
      if (u.includes('/api/persist')) bodies.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (u.includes('/api/public/listing-enquiry')) {
        return fakeResponse(201, { leadId: ENQUIRY_LEAD, bookingId: null, stage: 'New Lead' })
      }
      if (u.includes('/api/persist')) return fakeResponse(200, { ok: true })
      return fakeResponse(200, { ok: true })
    }),
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('T3 C6: 0 /api/persist calls (behavioural)', () => {
  it('control: a staff createLead does reach /api/persist (the harness can see one)', async () => {
    const store = mountStore()
    store.createLead({ ...leadBase, persist: clientMayCreateLead('agent_admin') })
    await settle()
    expect(persistCalls().length).toBeGreaterThan(0)
  })

  for (const role of ['guest', 'tenant'] as const) {
    it(`${role}: Register interest saves via the public route only; 0 /api/persist calls`, async () => {
      const store = mountStore()
      const result = await submitListingEnquiry({
        propertyId: 'PR-1011',
        action: 'lead',
        firstName: 'Kelly',
        lastName: 'Test',
        email: 'kelly@example.com',
        phone: '0820000000',
      })
      expect(result.ok).toBe(true)
      if (!shouldRecordEnquiryLocally(result)) throw new Error('enquiry not saved')
      store.recordGuestEnquiry({
        lead: { ...leadBase, id: result.leadId, stage: result.stage, notes: '' },
        viewing: null,
      })
      await settle()
      expect(calls.filter((u) => u.includes('/api/public/listing-enquiry'))).toHaveLength(1)
      expect(persistCalls()).toEqual([])
    })

  }

  const listing = { id: 'PR-1011', agencyId: 'agency-1', agentId: 'u-james', listingMode: 'rent' as const, value: 6500 }
  const contact = { name: 'Tess Tenant', email: 'tess@example.com', phone: '0820000000', notes: '' }

  it("tenant: apply saves its NEW lead once (B1), a fresh id, never the enquiry's lead", async () => {
    const store = mountStore()
    const lead = store.createLead(applyLeadInput({ listing, contact, role: 'tenant' }))
    await settle()
    expect(persistCalls()).toHaveLength(1)
    const op = bodies[0]?.body as { resource: string; action: string; id: string; data: Record<string, unknown> }
    const ops = Array.isArray((op as unknown as { ops?: unknown[] }).ops)
      ? ((op as unknown as { ops: typeof op[] }).ops)
      : [op]
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ resource: 'lead', action: 'upsert', id: lead.id })
    expect(ops[0].id).toMatch(/^LD-/)
    expect(ops[0].id).not.toBe(ENQUIRY_LEAD)
    expect(ops[0].data).toMatchObject({ stage: 'Application Submitted', propertyId: 'PR-1011' })
    // The client-only switch is not sent to the server as lead data.
    expect('persist' in ops[0].data).toBe(false)
    expect('persist' in lead).toBe(false)
  })

  for (const role of [null, 'landlord', 'contractor'] as const) {
    it(`${role ?? 'guest'}: apply keeps its lead local: 0 /api/persist calls`, async () => {
      const store = mountStore()
      store.createLead(applyLeadInput({ listing, contact, role }))
      await settle()
      expect(persistCalls()).toEqual([])
    })
  }
})
