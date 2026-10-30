/**
 * Admin reversal / reopen / history client (spec-admin-reversal.md v1.3,
 * Step 1). Its own error map (9.3): the person sees a plain sentence, never
 * a code. The server re-checks every rule.
 */
import { actorHeaders } from './actorAuth'
import { authHeaders } from './authClient'

const API_BASE = (import.meta.env?.VITE_API_BASE as string | undefined) || ''

export type ReverseReasonKind = 'WRONG_ROW' | 'PAYMENT_BOUNCED' | 'NOT_RECEIVED' | 'OTHER'
export type ReopenReasonKind = 'CANCELLED_BY_MISTAKE' | 'STILL_OWED' | 'OTHER'

export const REVERSE_REASON_OPTIONS: ReadonlyArray<{ value: ReverseReasonKind; label: string }> = [
  { value: 'WRONG_ROW', label: 'Wrong payment row' },
  { value: 'PAYMENT_BOUNCED', label: 'Payment bounced' },
  { value: 'NOT_RECEIVED', label: 'Money not received' },
  { value: 'OTHER', label: 'Other' },
]
export const REOPEN_REASON_OPTIONS: ReadonlyArray<{ value: ReopenReasonKind; label: string }> = [
  { value: 'CANCELLED_BY_MISTAKE', label: 'Cancelled by mistake' },
  { value: 'STILL_OWED', label: 'Still owed' },
  { value: 'OTHER', label: 'Other' },
]

export const REASON_MIN_LENGTH = 10

/** 9.3 error sentences. */
export const REVERSAL_ERROR_SENTENCES: Readonly<Record<string, string>> = {
  PAYMENT_REVERSAL_PERMISSION_REQUIRED: 'Only an agency principal or office admin can do this.',
  PAYMENT_NOT_FOUND: 'This payment could not be found.',
  PAYMENT_REVERSAL_REASON_REQUIRED: 'Add a reason of at least 10 characters.',
  PAYMENT_REVERSAL_REASON_KIND_INVALID: 'Pick a reason from the list.',
  PAYMENT_NOT_PAID: 'This payment is no longer marked paid. Refresh to see it.',
  PAYMENT_NOT_CANCELLED: 'This payment is no longer cancelled. Refresh to see it.',
  PAYMENT_STALE: 'Someone changed this payment. Refresh and try again.',
  PAYMENT_REVERSAL_BALANCE_PAID: 'The balance of this payment was also recorded as paid. Reverse that payment first.',
  PAYMENT_REOPEN_DUPLICATE_ROW: 'Another payment already covers this. Open it instead of reopening this one.',
  PAYMENT_REVERSAL_ACK_REQUIRED: 'Tick the box to confirm you understand the owner statement will change.',
  PAYMENT_REVERSAL_TICKET_REQUIRED: 'Add the support ticket reference.',
  PAYMENT_PERMISSION_REQUIRED: 'You do not have permission to see this payment history.',
}

const FALLBACK_SENTENCE = 'Something went wrong. Try again.'

export function reversalErrorSentence(code: string | null | undefined): string {
  return (code && REVERSAL_ERROR_SENTENCES[code]) || FALLBACK_SENTENCE
}

export type ReversalPaymentView = {
  id: string
  status: string
  amount: number
  paidAmount: number | null
  paidAt: string | null
  method: string | null
  reference: string | null
  dueDate: string
  updatedAt: string
}

export type ReversalOutcome =
  | { ok: true; payment: ReversalPaymentView; auditEventId: string }
  | { ok: false; status: number; code: string | null; message: string; otherPayments?: string[] }

export type ReverseRequest = {
  reasonKind: ReverseReasonKind
  reason: string
  expectedUpdatedAt: string
  requestId: string
  clearReference?: boolean
  acknowledgeEarlierMonth?: boolean
  supportTicketRef?: string
}
export type ReopenRequest = {
  reasonKind: ReopenReasonKind
  reason: string
  expectedUpdatedAt: string
  requestId: string
  supportTicketRef?: string
}

export type HistoryEntry = {
  id: string
  type: string
  createdAt: string
  actorName: string | null
  reasonKind: string | null
  reason: string | null
  referenceLast4: string | null
}

/** A uuid made when the dialog opens: a double click sends the same one (spec 8). */
export function newRequestId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c?.randomUUID) return c.randomUUID()
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16))
  hex[12] = '4'
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)
  const s = hex.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

type Fetcher = typeof fetch

async function send(path: string, init: RequestInit, fetcher: Fetcher): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetcher(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...actorHeaders(), ...authHeaders() },
    credentials: 'include',
  })
  const body = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
  return { status: res.status, body }
}

function outcome(status: number, body: Record<string, unknown>): ReversalOutcome {
  if (status >= 200 && status < 300 && body.ok === true && body.payment && typeof body.auditEventId === 'string') {
    return { ok: true, payment: body.payment as ReversalPaymentView, auditEventId: body.auditEventId }
  }
  const code = typeof body.code === 'string' ? body.code : null
  return {
    ok: false,
    status,
    code,
    message: reversalErrorSentence(code),
    ...(Array.isArray(body.otherPayments) ? { otherPayments: body.otherPayments.filter((x): x is string => typeof x === 'string') } : {}),
  }
}

async function post(path: string, payload: Record<string, unknown>, fetcher: Fetcher): Promise<ReversalOutcome> {
  try {
    const { status, body } = await send(path, { method: 'POST', body: JSON.stringify(payload) }, fetcher)
    return outcome(status, body)
  } catch {
    return { ok: false, status: 0, code: null, message: FALLBACK_SENTENCE }
  }
}

export function reversePayment(paymentId: string, req: ReverseRequest, fetcher: Fetcher = fetch): Promise<ReversalOutcome> {
  return post(`/api/payments/${encodeURIComponent(paymentId)}/reverse`, { ...req }, fetcher)
}

export function reopenPayment(paymentId: string, req: ReopenRequest, fetcher: Fetcher = fetch): Promise<ReversalOutcome> {
  return post(`/api/payments/${encodeURIComponent(paymentId)}/reopen`, { ...req }, fetcher)
}

export async function fetchPaymentHistory(
  paymentId: string,
  fetcher: Fetcher = fetch,
): Promise<{ ok: true; history: HistoryEntry[] } | { ok: false; status: number; code: string | null; message: string }> {
  try {
    const { status, body } = await send(`/api/payments/${encodeURIComponent(paymentId)}/history`, { method: 'GET' }, fetcher)
    if (status === 200 && body.ok === true && Array.isArray(body.history)) return { ok: true, history: body.history as HistoryEntry[] }
    const code = typeof body.code === 'string' ? body.code : null
    return { ok: false, status, code, message: reversalErrorSentence(code) }
  } catch {
    return { ok: false, status: 0, code: null, message: FALLBACK_SENTENCE }
  }
}

const HISTORY_VERB: Record<string, string> = {
  payment_reversed_by_admin: 'Reversed',
  payment_reopened: 'Reopened',
  payment_marked_paid: 'Marked paid',
  payment_cancelled_by_staff: 'Cancelled',
  payment_amount_changed: 'Amount changed',
  payment_cancelled_by_reversal: 'Cancelled by a reversal',
}

/** 9.4: "Reversed by <name> on <date>: <reason>"; the reference shows as "…<last 4>". */
export function historyLine(e: HistoryEntry): string {
  const verb = HISTORY_VERB[e.type] ?? 'Changed'
  const date = e.createdAt.slice(0, 10)
  const who = e.actorName || 'an admin'
  const reason = e.reason ? `: ${e.reason}` : ''
  const ref = e.referenceLast4 ? ` (reference …${e.referenceLast4})` : ''
  return `${verb} by ${who} on ${date}${reason}${ref}`
}

/** Client-side form check (the server re-checks): returns the sentence to show, or null when the form can be sent. */
export function reversalFormProblem(f: {
  reasonKind: string | null
  reason: string
  needsAck: boolean
  acknowledged: boolean
  needsTicket: boolean
  ticket: string
}): string | null {
  if (!f.reasonKind) return REVERSAL_ERROR_SENTENCES.PAYMENT_REVERSAL_REASON_KIND_INVALID!
  if (f.reason.trim().length < REASON_MIN_LENGTH) return REVERSAL_ERROR_SENTENCES.PAYMENT_REVERSAL_REASON_REQUIRED!
  if (f.needsTicket) {
    const t = f.ticket.trim()
    if (t.length < 5 || t.length > 120) return REVERSAL_ERROR_SENTENCES.PAYMENT_REVERSAL_TICKET_REQUIRED!
  }
  if (f.needsAck && !f.acknowledged) return REVERSAL_ERROR_SENTENCES.PAYMENT_REVERSAL_ACK_REQUIRED!
  return null
}

/** Client hint only (the server decides in SAST): the received date (YYYY-MM-DD) is in an earlier month than today. */
export function paidInEarlierMonth(paidAt: string | null | undefined, today: Date = new Date()): boolean {
  if (!paidAt || !/^\d{4}-\d{2}/.test(paidAt)) return false
  const now = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit' })
    .format(today)
    .slice(0, 7)
  return paidAt.slice(0, 7) < now
}
