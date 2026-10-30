/**
 * Application checkout rules (open-checkout-real).
 *
 * Everything here works on LIVE ledger rows from the store. Nothing builds a
 * payment id or an amount: the Pay buttons send only a persisted payment row
 * id to `POST /api/payfast/create`, and the server reads the amount from that
 * ledger row, signs the fields and checks who may pay (super_admin, the row's
 * party_user_id, or same-agency staff). No PayFast host, merchant key or
 * signature exists in the browser.
 */
import type { PaymentRecord } from '../../types/domain'
import type { PayfastCheckoutOptions, PayfastCheckoutResult } from './checkout'

/** Jim addendum A1: exact label on the staff button. Shown only with payments.manage. */
export const AGENT_PAY_LABEL = 'Pay on behalf of applicant (applicant pays on this screen)'

/**
 * PURCHASE rule: sale deposits are paid by EFT to the conveyancing / trust
 * details in the agreement. Flip this ONE switch (Michael) to allow paying a
 * Sale Deposit row online through PayFast as well.
 */
export const SALE_DEPOSIT_ONLINE_PAY_ENABLED = false
export const SALE_DEPOSIT_EFT_COPY = 'Pay by EFT to the details in your agreement'

/** Staff without payments.manage, or no open row the staff member may pay. */
export const APPLICANT_PAYS_COPY = 'The applicant pays from their portal.'
/** Tenant page when this application has no ledger rows for the applicant yet. */
export const TENANT_NO_ROWS_COPY =
  'No payment is due on this application yet. When your agency raises the deposit it appears here; you can also pay by EFT and record your reference.'
/** Staff page when this application has no ledger rows yet. */
export const AGENT_NO_ROWS_COPY =
  'No payment rows exist for this application yet, so there is nothing to pay online. The applicant pays from their portal once the deposit is raised.'

export type LedgerViewer = { mode: 'agent' } | { mode: 'tenant'; userId: string }

const TYPE_ORDER: Record<string, number> = {
  Deposit: 0,
  'Sale Deposit': 0,
  'First Month Rent': 1,
  Rent: 2,
}

export function isOpenRow(p: Pick<PaymentRecord, 'status'>): boolean {
  return p.status === 'Due' || p.status === 'Overdue'
}

/**
 * The rows the checkout card shows for one application, deposit first.
 * - only rows of `applicationId` (a null applicationId never matches)
 * - tenant: only rows whose partyUserId is the signed-in user (the server
 *   would answer 403 payment_not_yours for anything else)
 * - persistedDueIds (approve flash): open rows not in that list are dropped,
 *   so a row the store did not durably save is never offered; settled rows
 *   (Paid / Cancelled) stay listed as history
 */
export function applicationLedgerRows(
  all: readonly PaymentRecord[],
  opts: { applicationId: string; viewer: LedgerViewer; persistedDueIds?: readonly string[] | null },
): PaymentRecord[] {
  const { applicationId, viewer, persistedDueIds } = opts
  if (!applicationId) return []
  const saved = persistedDueIds ? new Set(persistedDueIds) : null
  const rows = all.filter((p) => {
    if (!p.applicationId || p.applicationId !== applicationId) return false
    if (viewer.mode === 'tenant') {
      if (!viewer.userId || !p.partyUserId || p.partyUserId !== viewer.userId) return false
    }
    if (saved && isOpenRow(p) && !saved.has(p.id)) return false
    return true
  })
  return rows
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const ra = TYPE_ORDER[a.p.type] ?? 3
      const rb = TYPE_ORDER[b.p.type] ?? 3
      return ra - rb || a.i - b.i
    })
    .map((x) => x.p)
}

export function isPayableOnline(
  p: Pick<PaymentRecord, 'status' | 'type'>,
  saleDepositOnline: boolean = SALE_DEPOSIT_ONLINE_PAY_ENABLED,
): boolean {
  if (!isOpenRow(p)) return false
  if (p.type === 'Sale Deposit' && !saleDepositOnline) return false
  return true
}

/** A4: the sum of the open rows shown (ledger amounts, no fees). */
export function outstandingTotal(rows: readonly PaymentRecord[]): number {
  return rows.filter(isOpenRow).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
}

export function paymentTypeLabel(type: PaymentRecord['type']): string {
  const s = String(type).toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const STATUS_WORD: Record<PaymentRecord['status'], string> = {
  Due: 'due',
  Overdue: 'overdue',
  Paid: 'paid',
  Cancelled: 'cancelled',
}

/** A2: "Deposit paid", "First month rent due", … */
export function rowStateLabel(p: Pick<PaymentRecord, 'type' | 'status'>): string {
  return `${paymentTypeLabel(p.type)} ${STATUS_WORD[p.status] ?? String(p.status).toLowerCase()}`
}

/** C8: the only option the client sends. No amount, no payer fields. */
export function checkoutItemName(p: Pick<PaymentRecord, 'type'>): string {
  return `Lekaya · ${p.type}`
}

export type StartCheckout = (paymentId: string, opts: PayfastCheckoutOptions) => Promise<PayfastCheckoutResult>

const START_FAILED = 'We could not start the PayFast checkout. Please try again or pay via EFT.'

/**
 * C4: per-row lock, taken synchronously, so a double click makes exactly one
 * POST. Returns null when the row is already starting (or has started and the
 * browser is navigating to PayFast). A failure unlocks the row for a retry.
 */
export function createCheckoutLauncher(start: StartCheckout) {
  const locked = new Set<string>()
  return async function launch(p: PaymentRecord): Promise<PayfastCheckoutResult | null> {
    if (locked.has(p.id)) return null
    locked.add(p.id)
    let result: PayfastCheckoutResult
    try {
      result = await start(p.id, { itemName: checkoutItemName(p) })
    } catch {
      result = { ok: false, error: 'start_failed', userMessage: START_FAILED }
    }
    if (!result || result.ok !== true) {
      locked.delete(p.id)
      return { ok: false, error: result?.error, userMessage: result?.userMessage || START_FAILED }
    }
    return result
  }
}
