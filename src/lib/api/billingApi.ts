/** Lekaya subscription billing (server/billingRoutes.ts). */
import type { PaymentAttachment } from '../../types/domain'
import type { AgencyBillingSettings, InvoiceLine, SaasInvoiceDraft } from '../saasPricing'
import { authHeaders } from './authClient'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init.headers ?? {}) },
  })
  const body = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw new Error(body.message || 'Something went wrong. Please try again.')
  return body
}

export type BillingAttachment = { id: string; name: string; mimeType: string; dataUrl: string; uploadedAt: string; uploadedByName?: string | null }

export type SaasInvoice = {
  id: string
  number: string
  agencyId: string
  agencyName: string
  period: string
  periodLabel: string
  issuedAt: string
  dueDate: string
  tierId: string | null
  propertyCount: number
  advertisedCount: number
  lines: InvoiceLine[]
  subtotal: number
  vat: number
  total: number
  amountPaid: number
  balance: number
  status: 'UNPAID' | 'PART_PAID' | 'PAID' | 'OVERDUE' | 'VOID'
  payments: Array<{ id: string; amount: number; paidOn: string; method: string; reference: string; note: string; attachments: BillingAttachment[]; recordedBy: string; recordedAt: string }>
  proofs: Array<{ id: string; reference: string; note: string; attachments: BillingAttachment[]; uploadedBy: string; at: string }>
}

export type AgencyBillingRow = {
  agencyId: string
  clientId: string
  name: string
  status: string
  settings: AgencyBillingSettings
  draft: SaasInvoiceDraft
  balance: number
  overdueCount: number
}

export const STATUS_LABEL: Record<SaasInvoice['status'], string> = {
  UNPAID: 'Unpaid',
  PART_PAID: 'Part paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  VOID: 'Cancelled',
}

export function statusTone(s: SaasInvoice['status']): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  return s === 'PAID' ? 'success' : s === 'OVERDUE' ? 'danger' : s === 'VOID' ? 'neutral' : s === 'PART_PAID' ? 'info' : 'warning'
}

const toUpload = (files: PaymentAttachment[]) =>
  files.map((f) => ({ id: f.id, name: f.name, dataUrl: f.dataUrl, uploadedByName: f.uploadedByName }))

export const billingApi = {
  invoices: () => call<{ invoices: SaasInvoice[] }>('/api/billing/invoices').then((r) => r.invoices),
  invoice: (id: string) => call<{ invoice: SaasInvoice }>(`/api/billing/invoices/${encodeURIComponent(id)}`).then((r) => r.invoice),
  agencies: () => call<{ agencies: AgencyBillingRow[] }>('/api/billing/agencies').then((r) => r.agencies),
  run: (agencyId?: string) => call<{ created: number; skipped: number }>('/api/billing/run', { method: 'POST', body: JSON.stringify({ agencyId }) }),
  saveSettings: (agencyId: string, settings: AgencyBillingSettings) =>
    call<{ settings: AgencyBillingSettings }>(`/api/billing/agencies/${encodeURIComponent(agencyId)}/settings`, { method: 'PUT', body: JSON.stringify(settings) }),
  recordPayment: (id: string, input: { amount: number; paidOn: string; method: string; reference: string; note: string; attachments: PaymentAttachment[] }) =>
    call<{ invoice: SaasInvoice }>(`/api/billing/invoices/${encodeURIComponent(id)}/payments`, {
      method: 'POST',
      body: JSON.stringify({ ...input, attachments: toUpload(input.attachments) }),
    }).then((r) => r.invoice),
  submitProof: (id: string, input: { reference: string; note?: string; attachments: PaymentAttachment[] }) =>
    call<{ invoice: SaasInvoice }>(`/api/billing/invoices/${encodeURIComponent(id)}/proof`, {
      method: 'POST',
      body: JSON.stringify({ reference: input.reference, note: input.note, attachments: toUpload(input.attachments) }),
    }).then((r) => r.invoice),
  void: (id: string) => call<{ invoice: SaasInvoice }>(`/api/billing/invoices/${encodeURIComponent(id)}/void`, { method: 'POST', body: '{}' }).then((r) => r.invoice),
}

export const formatRand = (n: number) => `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
