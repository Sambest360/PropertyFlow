// @vitest-environment happy-dom
/**
 * open-checkout-real, page wiring on the tenant application page (Jim C2, C3):
 * "Pay online" opens the card over the LIVE store rows of this application,
 * only rows whose partyUserId is the signed-in applicant; with no rows of
 * their own the page shows copy and no Pay button. Store and auth stubbed;
 * fetch is a tripwire (nothing is clicked through to the server here).
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Application, PaymentRecord } from '../../types/domain'
import { buildDocumentChecklist } from '../../lib/workflow'
import { TENANT_NO_ROWS_COPY } from '../../lib/payfast/applicationCheckout'

const TENANT = { id: 'u-a', role: 'tenant', name: 'Applicant A', email: 'a@test.example', agencyId: 'ag-1' }

const mock = vi.hoisted(() => ({ state: {} as Record<string, unknown> }))

vi.mock('../../context/AppStore', () => ({
  useStore: () =>
    new Proxy(
      { state: mock.state, hydratedForUserId: 'u-a' } as Record<string, unknown>,
      { get: (t, k: string) => (k in t ? t[k] : vi.fn(async () => ({}))) },
    ),
  usePublicProperties: () => [],
}))
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: TENANT,
    authReady: true,
    isAuthenticated: true,
    loginInFlight: false,
    has: () => true,
    hasAny: () => true,
  }),
  usePropertyScope: () => ({ dealVisible: () => true, role: 'tenant' }),
}))

import TenantApplicationDetailPage from './TenantApplicationDetailPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function app(): Application {
  return {
    id: 'APP-1',
    agencyId: 'ag-1',
    propertyId: 'PR-1',
    unitId: null,
    agentId: null,
    applicantUserId: 'u-a',
    applicantName: 'Applicant A',
    email: 'a@test.example',
    phone: '0820000000',
    type: 'Rental',
    workflowStatus: 'deposit_invoice_sent',
    stage: 'Awaiting Payment',
    progress: 50,
    submittedAt: '2026-10-01',
    updatedAt: '2026-10-02',
    documents: buildDocumentChecklist('Rental'),
    creditCheck: 'Pending',
  } as unknown as Application
}

function pay(o: Partial<PaymentRecord>): PaymentRecord {
  return {
    id: 'PAY-x',
    agencyId: 'ag-1',
    propertyId: 'PR-1',
    applicationId: 'APP-1',
    tenancyId: null,
    partyName: 'Applicant A',
    partyUserId: 'u-a',
    type: 'Deposit',
    amount: 37000,
    status: 'Due',
    dueDate: '2026-11-04',
    paidAt: null,
    method: null,
    landlordVisible: true,
    ...o,
  }
}

let host: HTMLElement
let root: Root
const fetchSpy = vi.fn(async () => {
  throw new Error('no network in this test')
})

function seed(payments: PaymentRecord[]) {
  // Any state collection the page does not care about reads as an empty list.
  mock.state = new Proxy({ applications: [app()], payments } as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : []),
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchSpy)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

function render() {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/workspace/portals/tenant/applications/APP-1?tab=payments']}>
        <Routes>
          <Route path="/workspace/portals/tenant/applications/:id" element={<TenantApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )
  })
}

function clickPayOnline() {
  const b = Array.from(host.querySelectorAll('button')).find((x) => x.textContent?.trim() === 'Pay online')
  expect(b, 'Pay online button').toBeTruthy()
  act(() => b!.click())
}

describe('tenant application page: open checkout uses live, own rows only', () => {
  it('C2: lists and offers Pay only on rows raised against the signed-in applicant', () => {
    seed([
      pay({ id: 'PAY-dep', type: 'Deposit', amount: 37000 }),
      pay({ id: 'PAY-rent', type: 'First Month Rent', amount: 18500 }),
      pay({ id: 'PAY-cosigner', type: 'Deposit', partyUserId: 'u-other', amount: 999 }),
      pay({ id: 'PAY-other-app', applicationId: 'APP-2' }),
    ])
    render()
    expect(host.querySelector('[data-testid="tenant-checkout"]')).toBeNull()
    clickPayOnline()
    const card = host.querySelector('[data-testid="tenant-checkout"]')!
    expect(card).not.toBeNull()
    expect(card.querySelector('[data-testid="pay-PAY-dep"]')).not.toBeNull()
    expect(card.querySelector('[data-testid="pay-PAY-rent"]')).not.toBeNull()
    expect(card.querySelector('[data-testid="checkout-row-PAY-cosigner"]')).toBeNull()
    expect(card.querySelector('[data-testid="checkout-row-PAY-other-app"]')).toBeNull()
    expect(card.innerHTML.toLowerCase()).not.toMatch(/payfast\.co|oppwa|<form/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('C3: rows exist on the application but none are the applicant\'s: copy, no Pay button, nothing invented', () => {
    seed([pay({ id: 'PAY-cosigner', partyUserId: 'u-other' })])
    render()
    clickPayOnline()
    const card = host.querySelector('[data-testid="tenant-checkout"]')!
    expect(card.textContent).toContain(TENANT_NO_ROWS_COPY)
    expect(card.querySelectorAll('button')).toHaveLength(0)
    expect(card.innerHTML).not.toMatch(/PAY-checkout-/)
  })
})
