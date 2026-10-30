// @vitest-environment happy-dom
/**
 * Slice A TC-modal (plan §5.4, addendum2 note 1, Jim MUST 9): the mark-paid
 * modal asks for an EFT reference or a note, says so, shows the stored
 * reference, and keeps Save off until the server rule would pass:
 *   trimmed reference non-empty, OR trimmed notes non-empty and different
 *   from the trimmed stored notes (a re-sent dunning note is not enough).
 * Rendered in happy-dom; lookups and the attachments field are stubbed.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PaymentRecord } from '../../types/domain'

vi.mock('../../hooks/useLookupOptions', () => ({ useLookupOptions: () => [] }))
vi.mock('./PaymentAttachmentsField', () => ({ PaymentAttachmentsField: () => null }))

import { MarkPaymentPaidModal } from './MarkPaymentPaidModal'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
})

const DUNNING = 'Dunning notice sent 2026-10-28'
function pay(o: Partial<PaymentRecord>): PaymentRecord {
  return {
    id: 'PAY-slaM1', agencyId: 'ag-1', propertyId: 'PR-1', applicationId: null, tenancyId: 'T-1', partyName: 'Tenant',
    partyUserId: 'u-t', type: 'Rent', amount: 10000, status: 'Overdue', dueDate: '2026-10-01', paidAt: null, method: null,
    landlordVisible: true, ...o,
  } as PaymentRecord
}

async function mount(payment: PaymentRecord, onConfirm = vi.fn()) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(<MarkPaymentPaidModal open payment={payment} actorName="Staff" onClose={() => {}} onConfirm={onConfirm} />)
  })
  return onConfirm
}
const saveButton = () => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Mark paid') as HTMLButtonElement
const field = (labelText: string) => {
  const label = Array.from(document.querySelectorAll('label')).find((l) => l.textContent?.includes(labelText))
  return label?.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | undefined
}
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('Slice A TC-modal: mark paid needs an EFT reference or a note', () => {
  it('labels the field "EFT reference or note (required)" with the cash hint', async () => {
    await mount(pay({}))
    const text = document.body.textContent ?? ''
    expect(text).toContain('EFT reference or note (required)')
    expect(text).toContain('This stays on the payment record. For cash, type the receipt number as a note.')
  })

  it('shows the stored reference and allows Save with it', async () => {
    await mount(pay({ reference: 'EFT-SLA-20' }))
    expect(field('EFT reference or note')?.value).toBe('EFT-SLA-20')
    expect(saveButton().disabled).toBe(false)
  })

  it('keeps Save disabled with no reference and only the stored dunning note (even with extra spaces)', async () => {
    const onConfirm = await mount(pay({ notes: DUNNING }))
    expect(saveButton().disabled).toBe(true)
    await type(field('Notes')!, `${DUNNING}   `)
    await type(field('EFT reference or note')!, '   ')
    expect(saveButton().disabled).toBe(true)
    await act(async () => saveButton().click())
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('enables Save once a reference is typed, or a new note (cash receipt) is typed', async () => {
    await mount(pay({ notes: DUNNING }))
    await type(field('EFT reference or note')!, 'EFT-SLA-21')
    expect(saveButton().disabled).toBe(false)
    await type(field('EFT reference or note')!, '')
    expect(saveButton().disabled).toBe(true)
    await type(field('Notes')!, 'Cash, receipt no. 456')
    expect(saveButton().disabled).toBe(false)
  })
})
