// @vitest-environment happy-dom
/**
 * Slice A client tests (plan §5.4, addendum1 MUST 5 / SHOULD 6, addendum2
 * notes 4 and 5). Real AppStoreProvider in happy-dom with a stubbed fetch that
 * records each /api/persist body and can refuse a payment id with a coded
 * response (as the Slice A server does). Harness copied from
 * AppStore.checkout.c1.test.tsx. No server, no DB, no PayFast.
 *
 *  - TB-entry / TB-entry-2: every approval entry row the store persists is a
 *    Deposit, First Month Rent or Sale Deposit, Due, with the applicationId and
 *    partyUserId = the applicant, and no reference, paidAt or method (the
 *    ground-agent exception shape), on both approve paths
 *    (persistApprovedApplication and the side_effects.payments loop).
 *  - TB-entry-repair: after the applicant repair, the payment rows carry the
 *    repaired applicant as partyUserId.
 *  - Rent cycle: a 409 PAYMENT_TERMINAL on a row the rent cycle swept is quiet
 *    (no toast) but still refreshes; updatePayment's 409 on the same row toasts.
 *  - PAYMENT_AGENCY_MISMATCH really refreshes ("Your page has been refreshed").
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
import type { Application, PaymentRecord } from '../types/domain'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Store = ReturnType<typeof useStore>
type Op = { resource: string; action: string; id: string; seq: number; data: Record<string, unknown> | null }
const ops: Op[] = []
let seq = 0
let refusePayments = false
/** payment id -> coded refusal the stub returns for its upserts. */
const refuse = new Map<string, { status: number; code: string }>()
let root: Root | null = null
let host: HTMLElement | null = null
let store: Store | null = null
let timeoutSpy: ReturnType<typeof vi.spyOn> | null = null

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
  refuse.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/api/persist')) {
        const body = init?.body ? JSON.parse(String(init.body)) : null
        const list = Array.isArray(body?.ops) ? body.ops : [body]
        for (const op of list) ops.push({ resource: op.resource, action: op.action, id: op.id, seq: ++seq, data: op.data ?? null })
        const hit = list.find((op: { resource: string; id: string }) => op.resource === 'payment' && refuse.has(op.id))
        if (hit) {
          const r = refuse.get(hit.id)!
          return fakeResponse(r.status, { error: 'persist_failed', code: r.code, message: 'refused by test' })
        }
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
  timeoutSpy = null
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


const ENTRY_TYPES = ['Deposit', 'First Month Rent', 'Sale Deposit']
const paymentUpserts = () => ops.filter((o) => o.resource === 'payment' && o.action === 'upsert')
function expectEntryShape(appId: string, applicant: string) {
  const rows = paymentUpserts()
  expect(rows.length).toBeGreaterThan(0)
  for (const o of rows) {
    const d = o.data ?? {}
    expect({
      typeOk: ENTRY_TYPES.includes(String(d.type)),
      status: d.status,
      applicationId: d.applicationId,
      partyUserId: d.partyUserId,
      reference: d.reference ?? null,
      paidAt: d.paidAt ?? null,
      method: d.method ?? null,
    }).toEqual({ typeOk: true, status: 'Due', applicationId: appId, partyUserId: applicant, reference: null, paidAt: null, method: null })
  }
}

describe('Slice A TB-entry / TB-entry-2: approval entry rows match the ground-agent exception', () => {
  for (const [name, run] of callers) {
    it(`${name}: every persisted payment row is an entry row for the applicant`, async () => {
      const appId = await mountWithApprovableApp()
      let result: Result | null = null
      await act(async () => {
        result = await run(appId)
      })
      await settle()
      expect((result as unknown as Result).status).toBe('SUCCESS')
      expectEntryShape(appId, 'u-applicant')
    })
  }
})

describe('Slice A TB-entry-repair: rows carry the repaired applicant', () => {
  it('approveApplication with no applicantUserId but a matching user email: the payment rows carry that user as partyUserId', async () => {
    const appId = await mountWithApprovableApp()
    let userId = ''
    await act(async () => {
      const created = store!.createUser({
        agencyId: 'ag-1', name: 'Applicant A', email: 'a@test.example', role: 'tenant', active: true,
      } as unknown as Parameters<Store['createUser']>[0]) as unknown as { id?: string } | undefined
      userId = created?.id ?? store!.state.users.find((u) => u.email === 'a@test.example')?.id ?? ''
      store!.updateApplication(appId, { applicantUserId: null } as unknown as Partial<Application>)
    })
    await settle()
    for (let i = 0; i < 2; i++) await act(async () => root!.render(<AppStoreProvider><Capture /></AppStoreProvider>))
    expect(userId).not.toBe('')
    ops.length = 0
    let result: Result | null = null
    await act(async () => {
      result = (await store!.approveApplication(appId, { actorUserId: 'u-staff' })) as unknown as Result
    })
    await settle()
    expect((result as unknown as Result).status).toBe('SUCCESS')
    expectEntryShape(appId, userId)
  })
})

/** Seed one DUE payment in the past (so the rent cycle sweeps it to Overdue). */
async function mountWithDuePayment(): Promise<PaymentRecord> {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root!.render(<AppStoreProvider><Capture /></AppStoreProvider>))
  await settle()
  let payment: PaymentRecord | null = null
  await act(async () => {
    payment = store!.createPayment({
      agencyId: 'ag-1', propertyId: 'PR-sla-1', applicationId: null, tenancyId: 'T-sla-1', partyName: 'Tenant', partyUserId: 'u-tenant',
      type: 'Rent', amount: 10000, status: 'Due', dueDate: '2026-09-01', landlordVisible: true,
    } as unknown as Parameters<Store['createPayment']>[0]) as unknown as PaymentRecord
  })
  await settle()
  for (let i = 0; i < 2; i++) await act(async () => root!.render(<AppStoreProvider><Capture /></AppStoreProvider>))
  ops.length = 0
  return payment!
}
const refusedToasts = () => (store!.toasts ?? []).filter((t) => t.title === 'Change not saved')
function spyRefresh() {
  timeoutSpy = vi.spyOn(window, 'setTimeout')
}
const refreshScheduled = () => (timeoutSpy?.mock.calls ?? []).some((c) => c[1] === 1500)

describe('Slice A rent cycle: a 409 on a swept row is quiet but refreshes; updatePayment\'s 409 toasts', () => {
  it('runRentCycle: a 409 PAYMENT_TERMINAL on the Overdue sweep shows no toast and still schedules the refresh', async () => {
    const p = await mountWithDuePayment()
    refuse.set(p.id, { status: 409, code: 'PAYMENT_TERMINAL' })
    spyRefresh()
    await act(async () => {
      store!.runRentCycle('2026-10-30')
    })
    await settle()
    expect({ swept: paymentUpserts().map((o) => [o.id, o.data?.status]), toasts: refusedToasts().length, refresh: refreshScheduled() }).toEqual({
      swept: [[p.id, 'Overdue']], toasts: 0, refresh: true,
    })
  })

  it('updatePayment: the same 409 PAYMENT_TERMINAL toasts the plain sentence and schedules the refresh', async () => {
    const p = await mountWithDuePayment()
    refuse.set(p.id, { status: 409, code: 'PAYMENT_TERMINAL' })
    spyRefresh()
    await act(async () => {
      store!.updatePayment(p.id, { notes: 'edit' })
    })
    await settle()
    expect({ toasts: refusedToasts().map((t) => t.body), refresh: refreshScheduled() }).toEqual({
      toasts: ["This payment is already marked paid and can't be edited here. Ask an admin to correct it."], refresh: true,
    })
  })

  it('a rent-cycle 409 does not silence a later updatePayment 409 on the same row', async () => {
    const p = await mountWithDuePayment()
    refuse.set(p.id, { status: 409, code: 'PAYMENT_TERMINAL' })
    await act(async () => {
      store!.runRentCycle('2026-10-30')
    })
    await settle()
    await act(async () => {
      store!.updatePayment(p.id, { notes: 'edit' })
    })
    await settle()
    expect(refusedToasts().length).toBe(1)
  })
})

describe('Slice A note 5: PAYMENT_AGENCY_MISMATCH really refreshes', () => {
  it('a 403 PAYMENT_AGENCY_MISMATCH toasts its sentence and schedules the bootstrap refresh', async () => {
    const p = await mountWithDuePayment()
    refuse.set(p.id, { status: 403, code: 'PAYMENT_AGENCY_MISMATCH' })
    spyRefresh()
    await act(async () => {
      store!.updatePayment(p.id, { notes: 'edit' })
    })
    await settle()
    expect({ toasts: refusedToasts().map((t) => t.body), refresh: refreshScheduled() }).toEqual({
      toasts: ["This payment belongs to another agency or property and can't be saved here. Your page has been refreshed."], refresh: true,
    })
  })
})
