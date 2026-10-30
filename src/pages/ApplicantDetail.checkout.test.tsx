// @vitest-environment happy-dom
/**
 * open-checkout-real, page wiring on the staff applicant page (Jim C1, C2, A1):
 * after Approve, the flash card shows the LIVE store rows of this application,
 * restricted to the ids the approval persisted (checkout.payment_ids) and to
 * the application's own agency; the Pay button carries the exact on-behalf
 * label and needs payments.manage. Staff are not offered OPEN_CHECKOUT by the
 * lifecycle hub (it is a portal.tenant action), so Approve is the staff path.
 * Store and auth stubbed; fetch is stubbed (rejects) so nothing leaves the test.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Application, PaymentRecord } from '../types/domain'
import { buildDocumentChecklist } from '../lib/workflow'
import { AGENT_PAY_LABEL } from '../lib/payfast/applicationCheckout'

const STAFF = { id: 'u-staff', role: 'agent_admin', name: 'Staff', email: 's@test.example', agencyId: 'ag-1' }
const mock = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  perms: new Set<string>(),
  approveResult: null as unknown,
}))

vi.mock('../context/AppStore', () => ({
  useStore: () =>
    new Proxy(
      {
        state: mock.state,
        advanceApplicationWorkflow: async () => mock.approveResult,
        patchApplicationStatus: async () => mock.approveResult,
      } as Record<string, unknown>,
      {
        get: (t, k: string) => (k in t ? t[k] : vi.fn(async () => ({}))),
      },
    ),
  usePublicProperties: () => [],
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: STAFF,
    authReady: true,
    isAuthenticated: true,
    loginInFlight: false,
    // Every permission the page asks for, except the ones a test removes.
    has: (p: string) => !mock.perms.has(`-${p}`),
    hasAny: () => true,
  }),
  usePropertyScope: () => ({ dealVisible: () => true, role: 'agent_admin' }),
}))

import ApplicantDetail from './ApplicantDetail'
import { SuiteAlertProvider } from '../components/alerts/SuiteAlert'

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
    workflowStatus: 'application_submitted',
    stage: 'Application submitted',
    progress: 20,
    submittedAt: '2026-10-01',
    updatedAt: '2026-10-02',
    documents: buildDocumentChecklist('Rental').map((d) =>
      d.key === 'id' || d.key === 'address' || d.key === 'fica'
        ? { ...d, status: 'verified' as const }
        : { ...d, status: 'uploaded' as const },
    ),
    screening: { status: 'passed', provider: 'mock' },
    creditCheck: 'Passed',
    creditConsent: true,
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
  mock.state = new Proxy({ applications: [app()], payments } as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : []),
  })
}

beforeEach(() => {
  mock.perms = new Set()
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
      <SuiteAlertProvider>
        <MemoryRouter initialEntries={['/workspace/sales/applications/APP-1']}>
          <Routes>
            <Route path="/workspace/sales/applications/:id" element={<ApplicantDetail />} />
          </Routes>
        </MemoryRouter>
      </SuiteAlertProvider>,
    )
  })
}

function approveSuccess(paymentIds: string[]) {
  return {
    status: 'SUCCESS',
    httpStatus: 200,
    application: { ...app(), workflowStatus: 'conditionally_approved', stage: 'Awaiting Payment' },
    previous_status: 'application_submitted',
    api_status: 'APPROVED',
    display_metadata: {},
    actions: [],
    side_effects: { lease: null, payments: [], unit_id: null, unit_status: null, cancelled_viewing_ids: [], cancelled_slot_ids: [], booking_collisions: [] },
    checkout: { provider: 'payfast', payment_id: paymentIds[0], payment_ids: paymentIds, amount_zar: 0 },
    invoice: null,
    layout: { headline: 'Application approved — checkout ready', success_state: 'APPROVED_CHECKOUT', badges: [], next_step_copy: 'x' },
  }
}

async function approve() {
  const b = Array.from(host.querySelectorAll('button')).find((x) => /^Approve/.test(x.textContent?.trim() ?? ''))
  expect(b, 'Approve action').toBeTruthy()
  await act(async () => {
    b!.click()
  })
  // Approve asks for confirmation first.
  const confirm = Array.from(document.querySelectorAll('[role="dialog"] button, [role="alertdialog"] button')).find((x) =>
    /^(confirm|continue|approve|yes)/i.test(x.textContent?.trim() ?? ''),
  )
  if (confirm) {
    await act(async () => {
      ;(confirm as HTMLButtonElement).click()
    })
  }
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

const flashCard = () => host.querySelector('[data-testid="checkout-row-PAY-dep"]')?.closest('ul')?.parentElement ?? null

describe('applicant page: approve flash pays only persisted, same-agency rows', () => {
  it('C1/C2/A1: rows the approval saved, own agency, exact on-behalf label with payments.manage', async () => {
    seed([
      pay({ id: 'PAY-dep', type: 'Deposit', amount: 37000 }),
      pay({ id: 'PAY-rent', type: 'First Month Rent', amount: 18500 }),
      pay({ id: 'PAY-stale', type: 'Deposit', amount: 1 }),
      pay({ id: 'PAY-other-agency', agencyId: 'ag-2' }),
      pay({ id: 'PAY-other-app', applicationId: 'APP-2' }),
    ])
    mock.approveResult = approveSuccess(['PAY-dep', 'PAY-rent', 'PAY-other-agency'])
    render()
    await approve()
    const card = flashCard()
    expect(card, 'checkout card in the approve flash').not.toBeNull()
    const buttons = Array.from(card!.querySelectorAll('button'))
    expect(buttons.map((b) => b.textContent?.trim())).toEqual([AGENT_PAY_LABEL, AGENT_PAY_LABEL])
    expect(card!.querySelector('[data-testid="pay-PAY-dep"]')).not.toBeNull()
    expect(card!.querySelector('[data-testid="pay-PAY-rent"]')).not.toBeNull()
    // C1: a Due row this approval did not persist is never offered.
    expect(host.querySelector('[data-testid="checkout-row-PAY-stale"]')).toBeNull()
    // C2: same agency only, this application only.
    expect(host.querySelector('[data-testid="checkout-row-PAY-other-agency"]')).toBeNull()
    expect(host.querySelector('[data-testid="checkout-row-PAY-other-app"]')).toBeNull()
    expect(card!.innerHTML.toLowerCase()).not.toMatch(/payfast\.co|oppwa|<form/)
    // Other panels probe /api/screening|esign/provider (answered by the stub); nothing reaches payments.
    expect(fetchSpy.mock.calls.map((c) => String((c as unknown[])[0])).filter((u) => /payfast|payment/i.test(u))).toEqual([])
  })

  it('A1: without payments.manage the rows are listed but there is no Pay button', async () => {
    mock.perms.add('-payments.manage')
    seed([pay({ id: 'PAY-dep' })])
    mock.approveResult = approveSuccess(['PAY-dep'])
    render()
    await approve()
    const card = flashCard()
    expect(card).not.toBeNull()
    expect(card!.querySelectorAll('button')).toHaveLength(0)
    expect(card!.textContent).toContain('The applicant pays from their portal')
  })
})
