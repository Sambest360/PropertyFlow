// @vitest-environment happy-dom
/**
 * open-checkout-real Jim addendum A3: the PayFast return / cancel page.
 *  - return before the ITN lands: "Payment received, confirming" + do-not-pay-again
 *  - return after the row is Paid: the existing received copy
 *  - cancel: "No payment was taken", neutral (not green) icon, link back to the
 *    application's payments (tenant → ?tab=payments, staff → applicant page,
 *    otherwise the payments list)
 *  - the live refresh is wired for real (refreshSessionData), not a dead import
 * Store, auth and router are stubbed; fetch is a tripwire (nothing may call out).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaymentRecord } from '../../types/domain'

const storeMock = vi.hoisted(() => ({
  payments: [] as unknown[],
  refreshSessionData: vi.fn(async () => {}),
}))
const authMock = vi.hoisted(() => ({ user: null as null | { id: string; role: string } }))

vi.mock('../../context/AppStore', () => ({
  useStore: () => ({
    state: { payments: storeMock.payments },
    refreshSessionData: storeMock.refreshSessionData,
  }),
}))
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: authMock.user }),
}))

import PayfastResultPage from './PayfastResultPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function row(over: Partial<PaymentRecord>): PaymentRecord {
  return {
    id: 'PAY-dep',
    agencyId: 'ag-1',
    applicationId: 'APP-1',
    tenancyId: null,
    partyUserId: 'u-tenant',
    type: 'Deposit',
    amount: 37000,
    status: 'Due',
    dueDate: '2026-11-01',
    paidAt: null,
    reference: 'DEP-APP-1',
    ...over,
  } as PaymentRecord
}

let host: HTMLElement
let root: Root
const fetchSpy = vi.fn(async () => {
  throw new Error('no network in this test')
})

beforeEach(() => {
  vi.useFakeTimers()
  storeMock.payments = []
  storeMock.refreshSessionData.mockClear()
  authMock.user = null
  fetchSpy.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function render(path: string, cancelled = false) {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <PayfastResultPage cancelled={cancelled} />
      </MemoryRouter>,
    )
  })
}

const text = () => host.textContent ?? ''

describe('A3 return before the ITN (row still Due)', () => {
  it('says received + confirming and warns not to pay again', () => {
    storeMock.payments = [row({ status: 'Due' })]
    authMock.user = { id: 'u-tenant', role: 'tenant' }
    render('/payfast/return?ref=PAY-dep')
    expect(text()).toContain('Payment received, confirming')
    expect(text()).toContain('If you paid, do not pay again; confirmation can take a few minutes')
    expect(text()).not.toContain('No payment was taken')
  })

  it('really refreshes the ledger from the server while waiting (refreshSessionData)', async () => {
    storeMock.payments = [row({ status: 'Due' })]
    authMock.user = { id: 'u-tenant', role: 'tenant' }
    render('/payfast/return?ref=PAY-dep')
    expect(storeMock.refreshSessionData).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(storeMock.refreshSessionData).toHaveBeenCalled()
    expect(storeMock.refreshSessionData.mock.calls[0]).toEqual([expect.objectContaining({ force: true })])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('has no dead useLiveSync dynamic import left in the page', () => {
    const src = readFileSync(join(__dirname, 'PayfastResultPage.tsx'), 'utf8')
    expect(src).not.toMatch(/import\(['"][^'"]*useLiveSync['"]\)/)
  })
})

describe('A3 return after the row is Paid', () => {
  it('shows the existing received copy and stops refreshing', async () => {
    storeMock.payments = [row({ status: 'Paid', paidAt: '2026-10-30T10:00:00Z' })]
    authMock.user = { id: 'u-tenant', role: 'tenant' }
    render('/payfast/return?ref=PAY-dep')
    expect(text()).toContain('Payment received')
    expect(text()).toContain('PayFast confirmed the transaction')
    expect(text()).not.toContain('confirming')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(storeMock.refreshSessionData).not.toHaveBeenCalled()
  })
})

describe('A3 cancel', () => {
  it('says no payment was taken, with a neutral (not green) icon, and never refreshes', async () => {
    storeMock.payments = [row({ status: 'Due' })]
    authMock.user = { id: 'u-tenant', role: 'tenant' }
    render('/payfast/cancel?ref=PAY-dep', true)
    expect(text()).toContain('No payment was taken')
    expect(text()).not.toContain('Payment received')
    const icon = host.querySelector('[data-testid="payfast-result-icon"]')
    expect(icon).not.toBeNull()
    expect(icon!.className).not.toMatch(/green/)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(storeMock.refreshSessionData).not.toHaveBeenCalled()
  })

  it('tenant: links back to their application payments tab', () => {
    storeMock.payments = [row({ status: 'Due' })]
    authMock.user = { id: 'u-tenant', role: 'tenant' }
    render('/payfast/cancel?ref=PAY-dep', true)
    const a = host.querySelector('a[data-testid="payfast-back-to-application"]')
    expect(a?.getAttribute('href')).toBe('/workspace/portals/tenant/applications/APP-1?tab=payments')
  })

  it('staff: links back to the applicant page', () => {
    storeMock.payments = [row({ status: 'Due' })]
    authMock.user = { id: 'u-agent', role: 'agent_admin' }
    render('/payfast/cancel?ref=PAY-dep', true)
    const a = host.querySelector('a[data-testid="payfast-back-to-application"]')
    expect(a?.getAttribute('href')).toBe('/workspace/sales/applications/APP-1')
  })

  it('unknown payment (or no application on it): falls back to the payments list', () => {
    storeMock.payments = []
    authMock.user = { id: 'u-agent', role: 'agent_admin' }
    render('/payfast/cancel?ref=PAY-missing', true)
    const a = host.querySelector('a[data-testid="payfast-back-to-application"]')
    expect(a?.getAttribute('href')).toBe('/workspace/operations/payments')

    act(() => root.unmount())
    root = createRoot(host)
    storeMock.payments = [row({ status: 'Due', applicationId: null })]
    render('/payfast/cancel?ref=PAY-dep', true)
    const b = host.querySelector('a[data-testid="payfast-back-to-application"]')
    expect(b?.getAttribute('href')).toBe('/workspace/operations/payments')
  })
})
