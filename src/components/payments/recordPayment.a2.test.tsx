// @vitest-environment happy-dom
/**
 * A2 client tests: T-R17 (reported badge; tenant sees no Mark paid),
 * T-R18 (modal default date is local at 00:30 SAST), and P-14
 * (confirm-tenant copy, empty required date, read-only tenant proof).
 */
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PaymentAttachment, PaymentRecord } from '../../types/domain'
import { persistRefusalMessage } from '../../lib/api/persistRefusal'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../hooks/useLookupOptions', () => ({ useLookupOptions: () => [] }))
vi.mock('./PaymentAttachmentsField', () => ({
  PaymentAttachmentsField: () => null,
  PaymentAttachmentsList: ({ attachments }: { attachments?: Array<{ name?: string }> }) => (
    <div>{attachments?.map((a) => a.name).join(' ')}</div>
  ),
}))

import { MarkPaymentPaidModal } from './MarkPaymentPaidModal'
import type { MarkPaymentPaidDetails } from './types'
import { PaymentDetailHeader } from '../payment-detail/PaymentDetailHeader'
import { TenantApplicationPaymentsPanel } from '../tenant/TenantApplicationPaymentsPanel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
  vi.useRealTimers()
})

const TENANT_SLIP: PaymentAttachment = {
  id: 'att-tenant-1',
  name: 'tenant-slip.png',
  kind: 'image',
  mimeType: 'image/png',
  dataUrl: 'data:image/png;base64,aaa',
  uploadedAt: '2026-11-01T10:00:00.000Z',
  uploadedByName: 'Tenant',
  uploadedByRole: 'tenant',
} as PaymentAttachment

function pay(o: Partial<PaymentRecord> & { tenantProofReported?: boolean } = {}): PaymentRecord {
  return {
    id: 'PAY-a2r-ui',
    agencyId: 'ag-1',
    propertyId: 'PR-1',
    applicationId: null,
    tenancyId: 'T-1',
    partyName: 'Tenant',
    partyUserId: 'u-t',
    type: 'Rent',
    amount: 10000,
    status: 'Due',
    dueDate: '2026-11-01',
    paidAt: null,
    method: null,
    landlordVisible: true,
    ...o,
  } as PaymentRecord
}

async function render(node: ReactNode) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(<MemoryRouter>{node}</MemoryRouter>)
  })
}

async function mountModal(payment: PaymentRecord, onConfirm: ((d: MarkPaymentPaidDetails) => unknown) | ReturnType<typeof vi.fn> = vi.fn()) {
  await render(
    <MarkPaymentPaidModal
      open
      payment={payment}
      actorName="Staff"
      onClose={() => {}}
      onConfirm={onConfirm as (d: MarkPaymentPaidDetails) => void}
    />,
  )
  return onConfirm as ReturnType<typeof vi.fn>
}

const field = (labelText: string) => {
  const label = Array.from(document.querySelectorAll('label')).find((l) => l.textContent?.includes(labelText))
  return label?.querySelector('input, textarea, select') as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | undefined
}

describe('T-R18 / P-14: mark-paid and confirm-tenant modal', () => {
  it('T-R18: the default Date received is the local date at 00:30 SAST, not the UTC date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-06T00:30:00+02:00'))
    await mountModal(pay({}))
    const text = document.body.textContent ?? ''
    expect(text).toContain('Date received')
    expect(text).not.toContain('Paid on')
    expect(field('Date received')?.value).toBe('2026-11-06')
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-11-05')
  })

  it('P-14: confirming a tenant report uses the confirm copy, an empty required date, and read-only tenant proof', async () => {
    await mountModal(
      pay({
        reference: 'TENANT-EFT-99',
        attachments: [TENANT_SLIP],
        tenantProofReported: true,
      } as PaymentRecord),
    )
    const text = document.body.textContent ?? ''
    expect(text).toContain('Confirm tenant payment')
    expect(text).toContain('Confirm only after the money shows on your bank statement.')
    expect(text).toContain('The date the money reached your account, from your statement')
    expect(text).toContain('TENANT-EFT-99')
    expect(text).toContain('tenant-slip.png')
    expect(text).toContain('This stays on the payment record. For cash, type the receipt number as a note.')
    expect(field('Date received')?.value).toBe('')
  })
})

describe('T-R17: reported badge to staff and tenant; tenant sees no Mark paid', () => {
  it('shows the reported badge and Confirm payment to staff, not Mark paid', async () => {
    await render(
      <PaymentDetailHeader
        payment={pay({ attachments: [TENANT_SLIP], tenantProofReported: true } as PaymentRecord)}
        property={null}
        canMaintain
        canSelfPay={false}
        onMarkPaid={() => {}}
        onCancel={() => {}}
        onRemove={() => {}}
      />,
    )
    const text = document.body.textContent ?? ''
    expect(text).toContain('Reported by tenant, not confirmed')
    expect(text).toContain('Confirm payment')
    expect(text).not.toContain('Mark paid')
  })

  it('shows the reported badge to the tenant and does not offer Mark paid', async () => {
    await render(
      <PaymentDetailHeader
        payment={pay({ attachments: [TENANT_SLIP], tenantProofReported: true } as PaymentRecord)}
        property={null}
        canMaintain={false}
        canSelfPay
        onMarkPaid={() => {}}
        onPayOnline={() => {}}
        onCancel={() => {}}
        onRemove={() => {}}
      />,
    )
    const text = document.body.textContent ?? ''
    expect(text).toContain('Reported by tenant, not confirmed')
    expect(text).toContain('Upload proof of payment')
    expect(text).not.toContain('Mark paid')
    expect(text).not.toContain('Confirm payment')
  })

  it('replaces Awaiting verification with Reported by tenant, not confirmed on the tenant application panel', async () => {
    await render(
      <TenantApplicationPaymentsPanel
        payments={[pay({ reference: 'TENANT-EFT-99', attachments: [TENANT_SLIP], tenantProofReported: true } as PaymentRecord)]}
        onSubmitProof={() => {}}
      />,
    )
    const text = document.body.textContent ?? ''
    expect(text).toContain('Reported by tenant, not confirmed')
    expect(text).not.toContain('Awaiting verification')
  })
})

describe('A2 persistRefusal copy', () => {
  const refusal = (code: string) =>
    persistRefusalMessage({ resource: 'payment', id: 'PAY-1', action: 'upsert', status: 400, code, message: 'x' })

  it('uses the addendum sentences for the new mark-paid codes', () => {
    expect(refusal('PAYMENT_RECEIVED_DATE_FUTURE')).toBe('The date received cannot be in the future.')
    expect(refusal('PAYMENT_RECEIVED_DATE_INVALID')).toBe('Enter the date the money was received.')
    expect(refusal('PAYMENT_RECEIVED_DATE_REASON_REQUIRED')).toBe(
      'This date is before this payment was added to the system. Add a short reason.',
    )
    expect(refusal('PAYMENT_METHOD_INVALID')).toBe('Choose EFT, Cash, Card at the office or Other.')
    expect(refusal('PAYMENT_METHOD_NOTE_REQUIRED')).toBe('For Other, add a note saying how it was paid.')
    expect(refusal('PAYMENT_REFERENCE_INVALID')).toBe('The reference is too long or has line breaks. Keep it to 120 characters.')
    expect(refusal('PAYMENT_CARD_NUMBER_REFUSED')).toBe(
      'This looks like a card number. Do not save card numbers. Type the slip number or only the last 4 digits.',
    )
    expect(refusal('PAYMENT_REFERENCE_DUPLICATE')).toBe(
      'This reference is already on another payment in your agency. Check it, then confirm to save.',
    )
  })
})



function firstCallDetails(fn: ReturnType<typeof vi.fn>): MarkPaymentPaidDetails {
  const calls = fn.mock.calls as unknown as MarkPaymentPaidDetails[][]
  return calls[0]![0]!
}
function lastCallDetails(fn: ReturnType<typeof vi.fn>): MarkPaymentPaidDetails {
  const calls = fn.mock.calls as unknown as MarkPaymentPaidDetails[][]
  return calls[calls.length - 1]![0]!
}

const saveButton = () =>
  Array.from(document.querySelectorAll('button')).find((b) => /^(Mark paid|Confirm payment)$/.test(b.textContent?.trim() ?? '')) as
    | HTMLButtonElement
    | undefined

async function typeField(labelText: string, value: string) {
  const el = field(labelText)
  if (!el) throw new Error(`missing field ${labelText}`)
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function setCheckbox(labelIncludes: string, checked: boolean) {
  const label = Array.from(document.querySelectorAll('label')).find((l) => l.textContent?.includes(labelIncludes))
  const box = label?.querySelector('input[type="checkbox"]') as HTMLInputElement | undefined
  if (!box) throw new Error(`missing checkbox ${labelIncludes}`)
  if (box.checked === checked) return
  await act(async () => {
    box.click()
  })
}

describe('Q5 / R7 shortfall tick (default ON; unticked needs reason)', () => {
  it('defaults the balance tick ON for a short payment and submits the balance-row path', async () => {
    const onConfirm = vi.fn(async () => true)
    await mountModal(pay({ amount: 10000, reference: 'EFT-SHORT' }), onConfirm)
    await typeField('Amount received', '7000')
    await typeField('Why does the amount differ?', 'Partial')
    const label = Array.from(document.querySelectorAll('label')).find((l) =>
      l.textContent?.includes('Create a payment for the balance'),
    )
    const box = label?.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(box?.checked).toBe(true)
    expect(document.body.textContent).not.toContain('Shortfall reason')
    expect(saveButton()?.disabled).toBe(false)
    await act(async () => {
      saveButton()!.click()
    })
    expect(onConfirm).toHaveBeenCalled()
    const details = firstCallDetails(onConfirm)
    expect(details.createBalanceForShortfall).toBe(true)
    expect(details.shortfallReason).toBeUndefined()
    expect(details.paidAmount).toBe(7000)
  })

  it('unticked short payment requires and sends shortfallReason (no balance flag)', async () => {
    const onConfirm = vi.fn(async () => true)
    await mountModal(pay({ amount: 10000, reference: 'EFT-SHORT' }), onConfirm)
    await typeField('Amount received', '7000')
    await typeField('Why does the amount differ?', 'Partial')
    await setCheckbox('Create a payment for the balance', false)
    expect(saveButton()?.disabled).toBe(true)
    await typeField('Shortfall reason', 'Tenant paid what they could')
    expect(saveButton()?.disabled).toBe(false)
    await act(async () => {
      saveButton()!.click()
    })
    const details = firstCallDetails(onConfirm)
    expect(details.createBalanceForShortfall).toBeUndefined()
    expect(details.shortfallReason).toBe('Tenant paid what they could')
  })

  it('default-shortfall (tick on) does not require a shortfall reason', async () => {
    await mountModal(pay({ amount: 10000, reference: 'EFT-SHORT' }))
    await typeField('Amount received', '7000')
    await typeField('Why does the amount differ?', 'Partial')
    expect(saveButton()?.disabled).toBe(false)
  })
})

describe('Q-R1 mark-paid method picker is the four closed labels', () => {
  it('offers only EFT / Cash / Card at the office / Other, and preselects EFT for Debit order', async () => {
    await mountModal(pay({ method: 'Debit order', reference: 'EFT-1' }))
    const select = field('Method') as HTMLSelectElement
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value)
    expect(options).toEqual(['EFT', 'Cash', 'Card at the office', 'Other'])
    expect(select.value).toBe('EFT')
    expect(options).not.toContain('Debit order')
    expect(options).not.toContain('Card')
    expect(options).not.toContain('Instant EFT')
    expect(options).not.toContain('Cheque')
  })

  it('preselects Card at the office for Card', async () => {
    await mountModal(pay({ method: 'Card', reference: 'EFT-1' }))
    expect((field('Method') as HTMLSelectElement).value).toBe('Card at the office')
  })

  it('preselects Other for Cheque', async () => {
    await mountModal(pay({ method: 'Cheque', reference: 'EFT-1' }))
    expect((field('Method') as HTMLSelectElement).value).toBe('Other')
  })
})

describe('§8 duplicate-reference confirm UI', () => {
  it('lists otherPayments and sends confirmDuplicateReference after Yes, this reference is correct', async () => {
    const onConfirm = vi.fn(async (details: { confirmDuplicateReference?: boolean }) => {
      if (details.confirmDuplicateReference) return true
      return {
        ok: false as const,
        code: 'PAYMENT_REFERENCE_DUPLICATE' as const,
        message: 'This reference is already on another payment in your agency. Check it, then confirm to save.',
        sharedReferenceCount: 1,
        otherPayments: [{ id: 'PAY-other', type: 'Rent', status: 'Paid', dueDate: '2026-10-01' }],
      }
    })
    await mountModal(pay({ reference: 'DUP-REF-1' }), onConfirm)
    expect(saveButton()?.disabled).toBe(false)
    await act(async () => {
      saveButton()!.click()
    })
    // flush microtasks from async onConfirm
    await act(async () => {
      await Promise.resolve()
    })
    const text = document.body.textContent ?? ''
    expect(text).toContain('Yes, this reference is correct')
    expect(text).toContain('PAY-other')
    expect(text).toContain('Rent')
    expect(firstCallDetails(onConfirm).confirmDuplicateReference).toBeUndefined()

    await setCheckbox('Yes, this reference is correct', true)
    await act(async () => {
      saveButton()!.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(onConfirm.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(lastCallDetails(onConfirm).confirmDuplicateReference).toBe(true)
  })
})
