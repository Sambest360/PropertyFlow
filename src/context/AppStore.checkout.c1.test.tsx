// @vitest-environment happy-dom
/**
 * open-checkout-real Jim C1: every store path that can hand a checkout to the
 * UI must only point at ledger rows that were durably saved BEFORE it reports
 * SUCCESS, and a failed save must never come back as SUCCESS.
 *
 * Drives the real AppStoreProvider (mounted in a DOM so state updates run) for
 * the three AppStore callers of the pure patchApplicationStatus:
 *   approveApplication          (AppStore.tsx:5181, PropertyDetail approve)
 *   advanceApplicationWorkflow  (AppStore.tsx:5597, effect 'approve')
 *   patchApplicationStatus      (AppStore.tsx:5864, ApplicantDetail.tsx:376)
 * The network is a stubbed global fetch that records each /api/persist op and
 * can refuse payment upserts. No server, no DB, no PayFast.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
import { buildDocumentChecklist } from '../lib/workflow'
import type { Application } from '../types/domain'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Store = ReturnType<typeof useStore>
type Op = { resource: string; action: string; id: string; seq: number }
const ops: Op[] = []
let seq = 0
let refusePayments = false
let root: Root | null = null
let host: HTMLElement | null = null
let store: Store | null = null

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

beforeEach(() => {
  ops.length = 0
  seq = 0
  refusePayments = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/api/persist')) {
        const body = init?.body ? JSON.parse(String(init.body)) : null
        const list = Array.isArray(body?.ops) ? body.ops : [body]
        for (const op of list) ops.push({ resource: op.resource, action: op.action, id: op.id, seq: ++seq })
        if (refusePayments && list.some((op: { resource: string }) => op.resource === 'payment')) {
          return fakeResponse(500, { error: 'refused by test' })
        }
        return fakeResponse(200, { ok: true })
      }
      return fakeResponse(200, { ok: true })
    }),
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  store = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function settle() {
  for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)) })
}

function Capture() {
  store = useStore()
  return null
}

/** Mount the store and seed one rentable listing + an approvable application. */
async function mountWithApprovableApp(): Promise<string> {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root!.render(<AppStoreProvider><Capture /></AppStoreProvider>))
  await settle() // let the (stubbed, empty) bootstrap finish before seeding
  let propertyId = ''
  await act(async () => {
    const p = store!.createProperty({
      agencyId: 'ag-1',
      landlordId: 'u-landlord',
      agentId: null,
      unitId: null,
      title: 'C1 listing',
      type: 'Apartment',
      status: 'Published',
      listingMode: 'rent',
      rent: 18500,
      price: null,
      city: 'Cape Town',
      suburb: 'CBD',
      beds: 2,
      baths: 1,
      parking: 1,
      area: 80,
      amenities: [],
      featured: false,
    } as unknown as Parameters<Store['createProperty']>[0])
    propertyId = p.id
  })
  await settle()
  let appId = ''
  await act(async () => {
    const created = await store!.createApplication({
      agencyId: 'ag-1',
      propertyId,
      agentId: null,
      applicantUserId: 'u-applicant',
      applicantName: 'Applicant A',
      email: 'a@test.example',
      phone: '0820000000',
      type: 'Rental',
      skipGuards: true,
    })
    if (!('id' in created)) throw new Error('createApplication failed')
    appId = (created as Application).id
  })
  await settle()
  await act(async () => {
    store!.updateApplication(appId, {
      documents: buildDocumentChecklist('Rental').map((d) =>
        d.key === 'id' || d.key === 'address' || d.key === 'fica'
          ? { ...d, status: 'verified' as const }
          : { ...d, status: 'uploaded' as const },
      ),
      screening: { status: 'passed', provider: 'mock' } as Application['screening'],
      creditCheck: 'Passed',
      creditConsent: true,
    })
  })
  await settle()
  // React only runs a setState updater synchronously ("eager state") when the
  // provider fiber has no pending lanes on either copy. The store's approve
  // paths read the updater's result right after setState, as they do in the
  // browser once the page is idle. Re-rendering from the root clears the stale
  // lanes the seeding updates left behind so the store is idle like a page.
  for (let i = 0; i < 2; i++) {
    await act(async () => root!.render(<AppStoreProvider><Capture /></AppStoreProvider>))
  }
  ops.length = 0
  return appId
}

type Result = Awaited<ReturnType<Store['patchApplicationStatus']>>

const callers: Array<[string, (appId: string) => Promise<Result>]> = [
  ['approveApplication (:5181)', (id) => store!.approveApplication(id, { actorUserId: 'u-staff' }) as Promise<Result>],
  [
    'advanceApplicationWorkflow effect approve (:5597)',
    (id) =>
      store!.advanceApplicationWorkflow({
        applicationId: id,
        actorUserId: 'u-staff',
        targetStatus: 'conditionally_approved',
      }) as Promise<Result>,
  ],
  [
    'patchApplicationStatus (:5864, ApplicantDetail.tsx:376)',
    (id) =>
      store!.patchApplicationStatus({
        applicationId: id,
        actorUserId: 'u-staff',
        request: { status: 'APPROVED', payment_provider: 'auto' },
      }),
  ],
]

describe('C1: a checkout only ever points at saved ledger rows', () => {
  for (const [name, run] of callers) {
    it(`${name}: SUCCESS checkout ids are payment rows already upserted`, async () => {
      const appId = await mountWithApprovableApp()
      let result: Result | null = null
      await act(async () => {
        result = await run(appId)
      })
      const r = result as unknown as Result
      expect(r.status).toBe('SUCCESS')
      if (r.status !== 'SUCCESS') return
      expect(r.checkout).not.toBeNull()
      const savedPaymentIds = ops.filter((o) => o.resource === 'payment' && o.action === 'upsert').map((o) => o.id)
      const c = r.checkout as unknown as { payment_id: string; payment_ids?: string[] }
      const ids = c.payment_ids ?? [c.payment_id]
      expect(ids.length).toBeGreaterThan(0)
      expect(savedPaymentIds).toContain(c.payment_id)
      for (const id of ids) expect(savedPaymentIds).toContain(id)
      expect(r.invoice?.id && savedPaymentIds.includes(r.invoice.id)).toBe(true)
      // The live store rows the card reads are exactly those saved rows.
      const live = store!.state.payments.filter((p) => p.applicationId === appId && p.status === 'Due')
      expect(live.map((p) => p.id).sort()).toEqual([...ids].sort())
    })

    it(`${name}: a refused payment save returns ERROR PERSIST_FAILED, never SUCCESS`, async () => {
      const appId = await mountWithApprovableApp()
      refusePayments = true
      let result: Result | null = null
      await act(async () => {
        result = await run(appId)
      })
      const r = result as unknown as Result
      expect(r.status).toBe('ERROR')
      if (r.status === 'ERROR') expect(r.code).toBe('PERSIST_FAILED')
    })
  }
})
