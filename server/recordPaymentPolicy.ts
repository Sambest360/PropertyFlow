/**
 * A2 record-a-payment rules (addendum + Jim P-1–P-17). Runs inside the
 * payment transaction from enforcePaymentWritePolicy and again from
 * upsertPayment so a direct handlePersist call cannot skip them.
 *
 * Does not change paymentReversal.ts behaviour; dateSast is a read-only import.
 */
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import { dateSast } from './paymentReversal.js'
import { paymentError, requestedPaymentStatus, toCents } from './paymentWritePolicy.js'
import type { StoredPayment } from './paymentWritePolicy.js'

export const MARK_PAID_METHODS = ['EFT', 'CASH', 'CARD_AT_OFFICE', 'OTHER'] as const
export type MarkPaidMethod = (typeof MARK_PAID_METHODS)[number]

export const RECEIVED_DATE_PICKS = ['Paid early', 'Captured late from statement'] as const

const DB_TO_FE_TYPE: Record<string, string> = {
  DEPOSIT: 'Deposit',
  FIRST_MONTH_RENT: 'First Month Rent',
  RENT: 'Rent',
  SALE_DEPOSIT: 'Sale Deposit',
  COMMISSION: 'Commission',
  REFUND: 'Refund',
  OTHER: 'Other',
}
const DB_TO_FE_STATUS: Record<string, string> = {
  DUE: 'Due',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled',
}

const trimmed = (v: unknown) => (v == null ? '' : String(v).trim())
const present = (d: Record<string, unknown>, k: string) => d[k] != null && d[k] !== ''

export function normalizeMarkPaidMethod(raw: unknown): string {
  const s = trimmed(raw).toUpperCase().replace(/\s+/g, '_')
  // Q-R1 + Angela: legacy PAY_METHOD labels and underscore variants → closed codes.
  if (s === 'CARD_AT_THE_OFFICE' || s === 'CARD') return 'CARD_AT_OFFICE'
  if (s === 'DEBIT_ORDER' || s === 'INSTANT_EFT') return 'EFT'
  if (s === 'CHEQUE') return 'OTHER'
  return s
}

export function isMarkPaidMethod(raw: unknown): raw is MarkPaidMethod {
  return (MARK_PAID_METHODS as readonly string[]).includes(normalizeMarkPaidMethod(raw))
}

function isRealYmd(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function isValidYymmdd(s: string): boolean {
  if (!/^\d{6}$/.test(s)) return false
  const yy = Number(s.slice(0, 2))
  const mm = Number(s.slice(2, 4))
  const dd = Number(s.slice(4, 6))
  if (mm < 1 || mm > 12 || dd < 1) return false
  const leap = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const dim = [0, 31, leap(2000 + yy) || leap(1900 + yy) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return dd <= dim[mm]
}

export function isIdShapedDigits(digits: string): boolean {
  return digits.length === 13 && isValidYymmdd(digits.slice(0, 6)) && (digits[11] === '8' || digits[11] === '9')
}

export function isLuhn(num: string): boolean {
  const d = num.replace(/\D/g, '')
  let sum = 0
  let alt = false
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i])
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return d.length > 0 && sum % 10 === 0
}

function hasCardNumber(text: string): boolean {
  const stripped = text.replace(/[\s-]/g, '')
  const runs = stripped.match(/\d{13,19}/g) ?? []
  for (const run of runs) {
    if (isIdShapedDigits(run)) continue
    if (isLuhn(run)) return true
  }
  return false
}

function hasControls(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 32 || c === 127) return true
  }
  return false
}

function atMostTwoDecimals(v: unknown): boolean {
  const s = typeof v === 'number' ? String(v) : trimmed(v)
  return /^-?\d+(\.\d{1,2})?$/.test(s)
}

export function receivedDateReasonValue(raw: unknown): string | null {
  const s = trimmed(raw)
  if (!s) return null
  if (s.length > 500) return null
  if ((RECEIVED_DATE_PICKS as readonly string[]).includes(s)) return s
  if (s === 'Other') return null
  if (s.startsWith('Other:')) return s.slice('Other:'.length).trim() ? s : null
  return null
}

export function todaySast(now = new Date()): string {
  return dateSast(now)
}

function createdAtSast(stored: StoredPayment | null): string {
  if (!stored?.created_at) return todaySast()
  return dateSast(stored.created_at instanceof Date ? stored.created_at : new Date(stored.created_at))
}

export type MarkPaidPlan = {
  markingPaid: true
  method: MarkPaidMethod
  paidAtYmd: string
  paidAmountCents: number
  amountCents: number
  receivedDateDefaulted: boolean
  receivedDateReason: string | null
  referenceKind: 'BANK_REFERENCE' | 'RECEIPT_NUMBER' | 'CARD_SLIP' | 'NOTE_ONLY'
  referenceSource: 'TYPED' | 'STORED' | 'NONE'
  reference: string | null
  referenceMasked: boolean
  auditReference: string | null
  noteTyped: boolean
  notesToStore: string | null
  sharedReferenceCount: number
  duplicateReferenceConfirmed: boolean
  duplicateReferenceReason: string | null
  createBalance: boolean
  shortfallReason: string | null
  originalAmountCents: number
  balanceCents: number
  amountReason: string | null
}

export type RecordPaymentPlan = MarkPaidPlan | { markingPaid: false }

function pickReferenceKind(method: MarkPaidMethod, hasRef: boolean): MarkPaidPlan['referenceKind'] {
  if (!hasRef) return 'NOTE_ONLY'
  if (method === 'CASH') return 'RECEIPT_NUMBER'
  if (method === 'CARD_AT_OFFICE') return 'CARD_SLIP'
  return 'BANK_REFERENCE'
}

type DupRow = {
  id: string
  frontend_id: string | null
  payment_type: string
  status: string
  due_date: string
  amount: string
  paid_at_sast: string | null
  application_id: string | null
  lease_id: string | null
  party_user_id: string | null
}

function isRelatedMatch(
  stored: StoredPayment | null,
  other: DupRow,
  ourAmountCents: number,
  ourReceivedDate: string,
): boolean {
  if (stored?.application_id && other.application_id && stored.application_id === other.application_id) return true
  const sameLease = Boolean(stored?.lease_id && other.lease_id && stored.lease_id === other.lease_id)
  const sameParty = Boolean(stored?.party_user_id && other.party_user_id && stored.party_user_id === other.party_user_id)
  if (!sameLease && !sameParty) return false
  const amountDiffers = toCents(other.amount) !== ourAmountCents
  const dateDiffers = (other.paid_at_sast ?? null) !== ourReceivedDate
  return amountDiffers || dateDiffers
}

async function resolveClientId(stored: StoredPayment | null, data: Record<string, unknown>): Promise<string | null> {
  if (stored?.client_id) return stored.client_id
  const raw = (data.agencyId ?? data.clientId) as string | undefined
  if (!raw) return null
  return (await resolveUuid('agency', String(raw))) ?? (String(raw).match(/^[0-9a-f-]{36}$/i) ? String(raw) : null)
}

export async function rowIsTenantReported(stored: StoredPayment | null): Promise<boolean> {
  if (!stored?.id) return false
  const atts = Array.isArray(stored.attachments) ? (stored.attachments as Array<Record<string, unknown>>) : []
  if (atts.some((a) => a?.uploadedByRole === 'tenant')) return true
  const rows = await query<{ n: string }>(
    `SELECT 1::text AS n FROM event_log WHERE event_type = 'payment_proof_reported' AND subject_id = $1::uuid LIMIT 1`,
    [stored.id],
  )
  return rows.length > 0
}

/**
 * Enforce every A2 mark-paid rule and return the values the writer should store
 * and the audit allow-list keys it should write. No-ops when the save is not
 * a move to PAID.
 */
export async function enforceRecordPaymentRules(
  stored: StoredPayment | null,
  data: Record<string, unknown>,
): Promise<RecordPaymentPlan> {
  const next = requestedPaymentStatus(data) ?? stored?.status ?? 'DUE'
  if (next !== 'PAID' || stored?.status === 'PAID') return { markingPaid: false }

  if (present(data, 'paidAmount')) {
    if (!atMostTwoDecimals(data.paidAmount) || !Number.isFinite(Number(data.paidAmount)) || Number(data.paidAmount) <= 0) {
      throw paymentError(400, 'PAYMENT_AMOUNT_REQUIRED', 'Bad request: paid amount must be a finite number greater than 0')
    }
  }
  const storedCents = toCents(stored?.amount ?? data.amount) ?? 0
  const paidAmountCents = present(data, 'paidAmount') ? toCents(data.paidAmount) : storedCents
  if (paidAmountCents == null || paidAmountCents <= 0) {
    throw paymentError(400, 'PAYMENT_AMOUNT_REQUIRED', 'Bad request: paid amount must be a finite number greater than 0')
  }
  const amountReason = trimmed(data.amountChangeReason)
  if (amountReason.length > 500) {
    throw paymentError(400, 'PAYMENT_REFERENCE_INVALID', 'Bad request: reasons must be 500 characters or fewer')
  }
  if (paidAmountCents !== storedCents && !amountReason) {
    throw paymentError(400, 'PAYMENT_AMOUNT_REASON_REQUIRED', 'Bad request: give a reason for changing the amount')
  }

  const createBalance = paidAmountCents < storedCents && data.createBalanceForShortfall === true
  const shortfallReason = trimmed(data.shortfallReason)
  if (shortfallReason.length > 500) {
    throw paymentError(400, 'PAYMENT_REFERENCE_INVALID', 'Bad request: reasons must be 500 characters or fewer')
  }
  if (paidAmountCents < storedCents && !createBalance && !shortfallReason) {
    throw paymentError(400, 'PAYMENT_AMOUNT_REASON_REQUIRED', 'Bad request: give a reason for the shortfall')
  }

  let paidAtYmd: string
  let receivedDateDefaulted = false
  if (!present(data, 'paidAt')) {
    paidAtYmd = todaySast()
    receivedDateDefaulted = true
  } else {
    const raw = trimmed(data.paidAt)
    if (!isRealYmd(raw) || raw < '2000-01-01') {
      throw paymentError(400, 'PAYMENT_RECEIVED_DATE_INVALID', 'Bad request: enter the date the money was received')
    }
    if (raw > todaySast()) {
      throw paymentError(400, 'PAYMENT_RECEIVED_DATE_FUTURE', 'Bad request: the date received cannot be in the future')
    }
    paidAtYmd = raw
  }
  let receivedDateReason: string | null = null
  if (paidAtYmd < createdAtSast(stored)) {
    receivedDateReason = receivedDateReasonValue(data.receivedDateReason)
    if (!receivedDateReason) {
      throw paymentError(
        400,
        'PAYMENT_RECEIVED_DATE_REASON_REQUIRED',
        'Bad request: this date is before this payment was added to the system',
      )
    }
  }

  const methodNorm = normalizeMarkPaidMethod(data.method)
  if (!isMarkPaidMethod(methodNorm)) {
    throw paymentError(400, 'PAYMENT_METHOD_INVALID', 'Bad request: choose EFT, Cash, Card at the office or Other')
  }
  const method = methodNorm

  const typedRef = trimmed(data.reference)
  const storedRef = trimmed(stored?.reference)
  const typedNotes = trimmed(data.notes)
  const storedNotes = trimmed(stored?.notes)
  const noteTyped = Boolean(typedNotes && typedNotes !== storedNotes)
  if (typedNotes.length > 2000) {
    throw paymentError(400, 'PAYMENT_REFERENCE_INVALID', 'Bad request: the note is too long')
  }
  if (typedRef.length > 120 || hasControls(typedRef)) {
    throw paymentError(400, 'PAYMENT_REFERENCE_INVALID', 'Bad request: the reference is too long or has line breaks')
  }

  const freshCashRef = Boolean(typedRef && typedRef !== storedRef)
  let reference: string | null = null
  let referenceSource: MarkPaidPlan['referenceSource'] = 'NONE'
  if (method === 'CASH') {
    if (freshCashRef) {
      reference = typedRef
      referenceSource = 'TYPED'
    } else if (storedRef) {
      // Q-R4: stored ref is not CASH evidence, but never wipe it when note-only.
      reference = storedRef
      referenceSource = 'STORED'
    }
  } else if (typedRef) {
    reference = typedRef
    referenceSource = 'TYPED'
  } else if (storedRef) {
    reference = storedRef
    referenceSource = 'STORED'
  }

  if (method === 'OTHER' && !noteTyped) {
    throw paymentError(400, 'PAYMENT_METHOD_NOTE_REQUIRED', 'Bad request: for Other, add a note saying how it was paid')
  }
  if (method === 'CASH' && !freshCashRef && !noteTyped) {
    throw paymentError(400, 'PAYMENT_PAID_REFERENCE_REQUIRED', 'Bad request: add the reference or a note to mark this paid')
  }
  if (method !== 'OTHER' && method !== 'CASH' && !reference && !noteTyped) {
    throw paymentError(400, 'PAYMENT_PAID_REFERENCE_REQUIRED', 'Bad request: add the reference or a note to mark this paid')
  }

  const refForGuard = reference ?? ''
  const noteForGuard = noteTyped ? typedNotes : ''
  if (hasCardNumber(refForGuard) || hasCardNumber(noteForGuard)) {
    throw paymentError(
      400,
      'PAYMENT_CARD_NUMBER_REFUSED',
      'This looks like a card number. Do not save card numbers. Type the slip number or only the last 4 digits.',
    )
  }

  const digits = (reference ?? '').replace(/[\s-]/g, '')
  const referenceMasked = Boolean(reference && isIdShapedDigits(digits))
  const auditReference = referenceMasked ? digits.slice(-4) : reference

  const clientId = await resolveClientId(stored, data)
  const norm = reference ? reference.toLowerCase().replace(/\s+/g, ' ').trim() : ''
  let sharedReferenceCount = 0
  const duplicateReferenceConfirmed = data.confirmDuplicateReference === true
  const duplicateReferenceReason = trimmed(data.duplicateReferenceReason) || null
  if (duplicateReferenceReason && duplicateReferenceReason.length > 500) {
    throw paymentError(400, 'PAYMENT_REFERENCE_INVALID', 'Bad request: reasons must be 500 characters or fewer')
  }
  if (norm && clientId) {
    await query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`payref:${clientId}:${norm}`])
    const others = await query<DupRow>(
      `SELECT p.id::text AS id, m.frontend_id, p.payment_type, p.status, p.due_date::text AS due_date,
              p.amount::text AS amount,
              to_char((p.paid_at AT TIME ZONE 'Africa/Johannesburg')::date, 'YYYY-MM-DD') AS paid_at_sast,
              p.application_id::text AS application_id, p.lease_id::text AS lease_id,
              p.party_user_id::text AS party_user_id
         FROM payments p
         LEFT JOIN entity_id_map m ON m.backend_id = p.id AND m.entity_type = 'payment'
        WHERE p.client_id = $1::uuid
          AND p.status <> 'CANCELLED'
          AND ($2::uuid IS NULL OR p.id <> $2::uuid)
          AND lower(regexp_replace(btrim(COALESCE(p.reference, '')), '\\s+', ' ', 'g')) = $3`,
      [clientId, stored?.id ?? null, norm],
    )
    sharedReferenceCount = others.length
    const unrelated = others.filter((o) => !isRelatedMatch(stored, o, storedCents, paidAtYmd))
    if (unrelated.length && !duplicateReferenceConfirmed) {
      console.info('[payments] duplicate-reference-prompt count=' + sharedReferenceCount)
      throw paymentError(
        409,
        'PAYMENT_REFERENCE_DUPLICATE',
        'This reference is already on another payment in your agency. Check it, then confirm to save.',
        {
          sharedReferenceCount,
          otherPayments: unrelated.slice(0, 5).map((o) => ({
            id: o.frontend_id ?? o.id,
            type: DB_TO_FE_TYPE[o.payment_type] ?? o.payment_type,
            status: DB_TO_FE_STATUS[o.status] ?? o.status,
            dueDate: o.due_date,
          })),
        },
      )
    }
  }

  return {
    markingPaid: true,
    method,
    paidAtYmd,
    paidAmountCents,
    amountCents: createBalance ? paidAmountCents : storedCents,
    receivedDateDefaulted,
    receivedDateReason,
    referenceKind: pickReferenceKind(method, Boolean(reference)),
    referenceSource,
    reference,
    referenceMasked,
    auditReference,
    noteTyped,
    notesToStore: typedNotes || stored?.notes || null,
    sharedReferenceCount,
    duplicateReferenceConfirmed,
    duplicateReferenceReason,
    createBalance,
    shortfallReason: createBalance ? null : shortfallReason || null,
    originalAmountCents: storedCents,
    balanceCents: createBalance ? storedCents - paidAmountCents : 0,
    amountReason: paidAmountCents !== storedCents ? amountReason : null,
  }
}

export function markPaidAuditPayload(
  plan: MarkPaidPlan,
  extras: {
    previousStatus: string | null
    recordedByRole: string
    confirmedTenantReport: boolean
    impersonatedUserId?: string | null
    balancePaymentId?: string | null
  },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    previousStatus: extras.previousStatus,
    amountCents: plan.amountCents,
    paidAmountCents: plan.paidAmountCents,
    method: plan.method,
    receivedDate: plan.paidAtYmd,
    referenceKind: plan.referenceKind,
    referenceSource: plan.referenceSource,
    reference: plan.auditReference,
    noteTyped: plan.noteTyped,
    confirmedTenantReport: extras.confirmedTenantReport,
    sharedReferenceCount: plan.sharedReferenceCount,
    duplicateReferenceConfirmed: plan.duplicateReferenceConfirmed,
    recordedByRole: extras.recordedByRole,
  }
  if (plan.amountReason) payload.amountReason = plan.amountReason
  if (plan.receivedDateDefaulted) payload.receivedDateDefaulted = true
  if (plan.receivedDateReason) payload.receivedDateReason = plan.receivedDateReason
  if (plan.duplicateReferenceReason) payload.duplicateReferenceReason = plan.duplicateReferenceReason
  if (plan.referenceMasked) payload.referenceMasked = true
  if (plan.createBalance) {
    payload.originalAmountCents = plan.originalAmountCents
    payload.balanceCents = plan.balanceCents
    if (extras.balancePaymentId) payload.balancePaymentId = extras.balancePaymentId
  }
  if (plan.shortfallReason) payload.shortfallReason = plan.shortfallReason
  if (extras.impersonatedUserId) payload.impersonatedUserId = extras.impersonatedUserId
  return payload
}
