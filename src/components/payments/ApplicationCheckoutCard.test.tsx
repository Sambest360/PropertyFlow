// @vitest-environment happy-dom
/**
 * Application payments without online checkout: rows are listed with their
 * state; the tenant uploads proof of payment on open rows; staff see no Pay
 * button and no PayFast form.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaymentRecord } from '../../types/domain'
import { ApplicationCheckoutCard } from './ApplicationCheckoutCard'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const pay = (o: Partial<PaymentRecord>): PaymentRecord =>
  ({
    id: 'P1', agencyId: 'ag', propertyId: 'pr', applicationId: 'A1', tenancyId: null, partyName: 'T', partyUserId: 'u',
    type: 'Deposit', amount: 10000, status: 'Due', dueDate: '2026-11-10', paidAt: null, method: null, landlordVisible: true, ...o,
  }) as PaymentRecord

let host: HTMLElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('ApplicationCheckoutCard (proof of payment)', () => {
  it('tenant: open rows offer Upload proof of payment; paid rows do not', () => {
    const onSubmitProof = vi.fn()
    act(() => root.render(<ApplicationCheckoutCard mode="tenant" rows={[pay({ id: 'D' }), pay({ id: 'R', type: 'First Month Rent', status: 'Paid' })]} onSubmitProof={onSubmitProof} />))
    expect(host.querySelector('[data-testid="proof-D"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="proof-R"]')).toBeNull()
    expect(host.innerHTML.toLowerCase()).not.toMatch(/payfast|<form/)
  })

  it('staff: rows listed, no buttons, proof already uploaded is flagged', () => {
    act(() => root.render(<ApplicationCheckoutCard mode="agent" rows={[pay({ id: 'D', attachments: [{ name: 'pop.pdf' } as never] })]} />))
    expect(host.querySelectorAll('button')).toHaveLength(0)
    expect(host.textContent).toContain('Proof uploaded')
  })
})
