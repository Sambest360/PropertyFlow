/**
 * T3 / Jim C6: a behavioural pin (not a source scan) that guest and tenant
 * Register interest and apply make **0 calls to /api/persist**.
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
import { clientMayPersistLead } from '../lib/clientLeadPersist'

type Store = ReturnType<typeof useStore>
const calls: string[] = []

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
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url)
      calls.push(u)
      if (u.includes('/api/public/listing-enquiry')) {
        return fakeResponse(201, { leadId: 'LD-guest-1700000000000-abc123', bookingId: null, stage: 'New Lead' })
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
    store.createLead({ ...leadBase, persist: clientMayPersistLead('agent_admin') })
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
      if (!result.ok) return
      store.recordGuestEnquiry({
        lead: { ...leadBase, id: result.leadId, stage: result.stage, notes: '' },
        viewing: null,
      })
      await settle()
      expect(calls.filter((u) => u.includes('/api/public/listing-enquiry'))).toHaveLength(1)
      expect(persistCalls()).toEqual([])
    })

    it(`${role}: apply's lead (persist gated by role) makes 0 /api/persist calls`, async () => {
      const store = mountStore()
      store.createLead({
        ...leadBase,
        stage: 'Application Submitted',
        notes: '',
        persist: clientMayPersistLead(role === 'guest' ? null : role),
      })
      await settle()
      expect(persistCalls()).toEqual([])
    })
  }
})
