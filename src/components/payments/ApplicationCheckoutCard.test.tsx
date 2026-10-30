// @vitest-environment happy-dom
/**
 * open-checkout-real: the application checkout card, rendered in a DOM.
 * Plan T3/T4 + Jim C3, C4, C8 + addendum A1, A2, A4, PURCHASE.
 * fetch is stubbed and HTMLFormElement.submit is spied: no network, no PayFast.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaymentRecord } from '../../types/domain'
import { ApplicationCheckoutCard } from './ApplicationCheckoutCard'
import { AGENT_PAY_LABEL, SALE_DEPOSIT_EFT_COPY } from '../../lib/payfast/applicationCheckout'
import { formatZAR } from '../../data/seed'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PROCESS_URL = 'https://process.example.invalid/eng/process'
let root: Root | null = null
let host: HTMLElement | null = null
let submitted: HTMLFormElement[] = []
let fetchMock: ReturnType<typeof vi.fn>

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
const DEP = pay({ id: 'PAY-dep', type: 'Deposit', amount: 37000 })
const RENT = pay({ id: 'PAY-rent', type: 'First Month Rent', amount: 18500 })

function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

beforeEach(() => {
  submitted = []
  vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
    submitted.push(this)
  })
  fetchMock = vi.fn(async () => res(200, { ok: true, processUrl: PROCESS_URL, fields: { m_payment_id: 'x' } }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function mount(el: React.ReactElement) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(el))
  return host
}
const buttons = () => Array.from(host!.querySelectorAll('button')) as HTMLButtonElement[]
const btn = (id: string) => host!.querySelector(`[data-testid="pay-${id}"]`) as HTMLButtonElement | null
async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

describe('ApplicationCheckoutCard: what it shows', () => {
  it('C3: zero rows renders nothing at all', () => {
    const h = mount(<ApplicationCheckoutCard rows={[]} mode="tenant" canPay />)
    expect(h.innerHTML).toBe('')
  })

  it('A2: lists every row with its state; Pay only on Due/Overdue rows', () => {
    const paid = pay({ id: 'PAY-paid', type: 'Deposit', status: 'Paid' })
    const over = pay({ id: 'PAY-over', type: 'First Month Rent', status: 'Overdue', amount: 18500 })
    const h = mount(<ApplicationCheckoutCard rows={[paid, over]} mode="tenant" canPay />)
    expect(h.textContent).toContain('Deposit paid')
    expect(h.textContent).toContain('First month rent overdue')
    expect(btn('PAY-paid')).toBeNull()
    expect(btn('PAY-over')).not.toBeNull()
    expect(buttons()).toHaveLength(1)
  })

  it('Paid/Cancelled only: rows listed, no Pay button', () => {
    mount(
      <ApplicationCheckoutCard
        rows={[pay({ id: 'a', status: 'Paid' }), pay({ id: 'b', status: 'Cancelled' })]}
        mode="tenant"
        canPay
      />,
    )
    expect(buttons()).toHaveLength(0)
  })

  it('tenant: two due rows give two buttons labelled by type and amount, deposit first; A4 total', () => {
    const h = mount(<ApplicationCheckoutCard rows={[DEP, RENT]} mode="tenant" canPay />)
    const b = buttons()
    expect(b.map((x) => x.textContent?.trim())).toEqual([
      `Pay deposit · ${formatZAR(37000)}`,
      `Pay first month rent · ${formatZAR(18500)}`,
    ])
    expect(h.textContent).toContain(formatZAR(37000 + 18500))
    expect(h.textContent?.toLowerCase()).not.toMatch(/fee|surcharge/)
  })

  it('A1 agent: exact on-behalf label on each button; type and amount on the row', () => {
    const h = mount(<ApplicationCheckoutCard rows={[DEP, RENT]} mode="agent" canPay />)
    expect(buttons().map((x) => x.textContent?.trim())).toEqual([AGENT_PAY_LABEL, AGENT_PAY_LABEL])
    expect(btn('PAY-dep')!.getAttribute('aria-label')).toContain('Deposit')
    expect(btn('PAY-rent')!.getAttribute('aria-label')).toContain('First month rent')
    expect(h.textContent).toContain('Deposit due')
    expect(h.textContent).toContain(formatZAR(37000))
  })

  it('A1 agent without payments.manage (canPay false): rows listed, no Pay button, applicant-pays copy', () => {
    const h = mount(<ApplicationCheckoutCard rows={[DEP, RENT]} mode="agent" canPay={false} />)
    expect(buttons()).toHaveLength(0)
    expect(h.textContent).toContain('The applicant pays from their portal')
  })

  it('PURCHASE: a Sale Deposit row shows the EFT line, not a Pay button', () => {
    const sale = pay({ id: 'PAY-sale', type: 'Sale Deposit', amount: 200000 })
    const h = mount(<ApplicationCheckoutCard rows={[sale]} mode="tenant" canPay />)
    expect(btn('PAY-sale')).toBeNull()
    expect(h.textContent).toContain(SALE_DEPOSIT_EFT_COPY)
  })

  it('markup has no PayFast host, no href and no form before a click', () => {
    const h = mount(<ApplicationCheckoutCard rows={[DEP, RENT]} mode="tenant" canPay />)
    expect(h.innerHTML.toLowerCase()).not.toMatch(/payfast\.co|oppwa|href=|<form/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('ApplicationCheckoutCard: what a click does', () => {
  it('C4: a double click sends ONE POST for that row, with paymentId and no amount (C8)', async () => {
    let release!: (r: Response) => void
    fetchMock.mockImplementation(() => new Promise<Response>((r) => (release = r)))
    mount(<ApplicationCheckoutCard rows={[DEP, RENT]} mode="tenant" canPay />)
    act(() => {
      btn('PAY-dep')!.click()
      btn('PAY-dep')!.click()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/payfast/create')
    const body = JSON.parse(String(init.body))
    expect(body).toEqual({ paymentId: 'PAY-dep', itemName: 'Lekaya · Deposit' })
    expect('amountCents' in body).toBe(false)
    expect('payer' in body).toBe(false)
    // Busy on the clicked button; the other Pay button is held while one checkout opens.
    expect(btn('PAY-dep')!.disabled).toBe(true)
    expect(btn('PAY-dep')!.getAttribute('aria-busy')).toBe('true')
    expect(btn('PAY-rent')!.disabled).toBe(true)
    expect(btn('PAY-rent')!.getAttribute('aria-busy')).toBe(null)
    btn('PAY-rent')!.click()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    release(res(200, { ok: true, processUrl: PROCESS_URL, fields: { m_payment_id: 'PAY-dep' } }))
    await flush()
    expect(submitted).toHaveLength(1)
    expect(submitted[0].action).toBe(PROCESS_URL)
  })

  const failures: Array<[string, () => Promise<Response>, string]> = [
    ['403', async () => res(403, { ok: false, error: 'payment_not_yours' }), 'You can only pay your own payments.'],
    ['409', async () => res(409, { ok: false, error: 'payment_already_paid' }), 'This payment is already marked paid.'],
    ['network error', async () => { throw new TypeError('Failed to fetch') }, 'We could not reach the payment server. Check your connection and try again.'],
  ]
  for (const [name, impl, message] of failures) {
    it(`C4 ${name}: shows the mapped message, never submits, button usable again`, async () => {
      fetchMock.mockImplementation(impl)
      const h = mount(<ApplicationCheckoutCard rows={[DEP, RENT]} mode="tenant" canPay />)
      act(() => btn('PAY-dep')!.click())
      await flush()
      expect(submitted).toHaveLength(0)
      expect(document.querySelectorAll('form')).toHaveLength(0)
      const alert = h.querySelector('[data-testid="checkout-row-PAY-dep"] [role="alert"]')
      expect(alert?.textContent).toBe(message)
      expect(btn('PAY-dep')!.disabled).toBe(false)
      expect(btn('PAY-rent')!.disabled).toBe(false)
    })
  }
})
