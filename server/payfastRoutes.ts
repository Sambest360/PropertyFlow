/**
 * PayFast checkout routes (sandbox-first).
 *
 * POST /api/payfast/create
 *   body: { paymentId, paymentDbId?, amountCents?, itemName?, itemDescription?,
 *           payer?, subscription? }
 *   → { ok, processUrl, fields } — fields include the server-computed
 *     signature. The passphrase never leaves the server.
 *
 * POST /api/payfast/itn
 *   PayFast server-to-server notification (form-encoded). Verifies source,
 *   signature, and ledger amount, then marks the payment PAID (idempotent)
 *   and emits a notification row. Always answers 200 once verified so PayFast
 *   stops retrying; non-verified requests get 400.
 */
import type { Context } from 'hono'
import { query, withTransaction } from './db.js'
import { resolveUuid } from './entityMap.js'
import {
  buildCheckoutFields,
  payfastConfigFromEnv,
  verifyItn,
  type PayfastConfig,
} from './payfast.js'

/** Server-side failure log — never leaks internals to the HTTP response. */
function logPayfastFailure(kind: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[payfast] ${kind}: ${message}`)
}

type Json = Record<string, unknown>

function config(): PayfastConfig | null {
  return payfastConfigFromEnv()
}

function absoluteOrigin(c: Context): string {
  const configured = process.env.PAYFAST_PUBLIC_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  const url = new URL(c.req.url)
  const proto = c.req.header('x-forwarded-proto') ?? url.protocol.replace(':', '')
  return `${proto}://${url.host}`
}

/** Look up the payments row for a FE payment id (accepting the raw uuid too). */
async function loadPayment(paymentId: string): Promise<{
  id: string
  uuid: string
  amount: number
  status: string
  paymentType: string
  partyName: string
  partyUserId: string | null
  clientUuid: string | null
  propertyFeId: string | null
} | null> {
  const uuid = await resolveUuid('payment', paymentId)
  if (!uuid) return null
  const rows = await query<{
    id: string
    amount: string | number
    status: string
    payment_type: string
    party_name: string
    party_user_id: string | null
    client_id: string | null
    unit_id: string | null
  }>(
    `SELECT id::text, amount, status, payment_type, party_name, party_user_id, client_id::text, unit_id::text
     FROM payments WHERE id = $1::uuid LIMIT 1`,
    [uuid],
  )
  const row = rows[0]
  if (!row) return null
  const unitRows = row.unit_id
    ? await query<{ frontend_id: string }>(
        `SELECT frontend_id FROM entity_id_map WHERE backend_id = $1::uuid AND entity_type IN ('property','unit') LIMIT 1`,
        [row.unit_id],
      )
    : []
  return {
    id: paymentId,
    uuid: row.id,
    amount: Number(row.amount),
    status: row.status,
    paymentType: row.payment_type,
    partyName: row.party_name,
    partyUserId: row.party_user_id,
    clientUuid: row.client_id,
    propertyFeId: unitRows[0]?.frontend_id ?? null,
  }
}

export async function payfastCreate(c: Context) {
  try {
    const cfg = config()
    if (!cfg) {
      return c.json({ ok: false, error: 'payfast_not_configured' }, 503)
    }
    const body = (await c.req.json().catch(() => ({}))) as Json
    const paymentId = typeof body.paymentId === 'string' ? body.paymentId : ''
    if (!paymentId) {
      return c.json({ ok: false, error: 'paymentId required' }, 400)
    }
    const payment = await loadPayment(paymentId)
    if (!payment) {
      return c.json({ ok: false, error: 'payment_not_found' }, 404)
    }
    if (payment.status === 'PAID') {
      return c.json({ ok: false, error: 'payment_already_paid' }, 409)
    }
    if (payment.status === 'CANCELLED') {
      return c.json({ ok: false, error: 'payment_cancelled' }, 409)
    }
    const clientAmountCents = Math.round(Number(body.amountCents) * (Number.isFinite(Number(body.amountCents)) ? 1 : 0))
    const amountCents =
      Number.isFinite(clientAmountCents) && clientAmountCents > 0
        ? clientAmountCents
        : Math.round(payment.amount * 100)
    const itemName =
      typeof body.itemName === 'string' && body.itemName.trim()
        ? body.itemName.trim()
        : `PropertyFlow · ${payment.paymentType} · ${payment.partyName}`
    const itemDescription = typeof body.itemDescription === 'string' ? body.itemDescription : undefined
    const payerRaw = (body.payer ?? {}) as Json
    const payer = {
      firstName: typeof payerRaw.firstName === 'string' ? payerRaw.firstName : undefined,
      lastName: typeof payerRaw.lastName === 'string' ? payerRaw.lastName : undefined,
      email: typeof payerRaw.email === 'string' ? payerRaw.email : undefined,
    }
    const origin = absoluteOrigin(c)
    const fields = buildCheckoutFields(cfg, {
      paymentId,
      amountCents,
      itemName,
      itemDescription,
      payer,
      returnUrl: `${origin}/payfast/return?ref=${encodeURIComponent(paymentId)}`,
      cancelUrl: `${origin}/payfast/cancel?ref=${encodeURIComponent(paymentId)}`,
      notifyUrl: `${origin}/api/payfast/itn`,
      ...(body.subscription && typeof body.subscription === 'object'
        ? { subscription: body.subscription as { cycles: string; frequency: 3 | 4 | 5 | 6 | 7 } }
        : {}),
    })
    return c.json({ ok: true, processUrl: cfg.processUrl ?? 'https://sandbox.payfast.co.za/eng/process', fields })
  } catch (err) {
    logPayfastFailure('payfast_create_error', err)
    return c.json({ ok: false, error: 'payfast_create_failed' }, 500)
  }
}

export async function payfastItn(c: Context) {
  try {
    const cfg = config()
    if (!cfg) return c.text('PayFast not configured', 503)
    const body: Record<string, string> = {}
    const contentType = c.req.header('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const json = (await c.req.json().catch(() => ({}))) as Json
      for (const [k, v] of Object.entries(json)) body[k] = String(v ?? '')
    } else {
      const form = await c.req.parseBody()
      for (const [k, v] of Object.entries(form)) {
        if (typeof v === 'string') body[k] = v
      }
    }
    const expected = await loadPayment(body.m_payment_id ?? '')
    const verdict = verifyItn(body, cfg, {
      sourceIp:
        c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
        c.req.header('x-real-ip') ??
        // Hono/node: connection info not standardized; sandbox testing uses null.
        null,
      expectedPaymentId: expected?.id,
      expectedAmountCents: expected ? Math.round(expected.amount * 100) : undefined,
    })
    if (!verdict.ok) {
      logPayfastFailure('payfast_itn_rejected', new Error(verdict.reason))
      return c.text('ITN rejected', 400)
    }
    if (!expected) {
      // Valid signature for an unknown payment — accept but do nothing.
      logPayfastFailure('payfast_itn_unknown_payment', new Error(body.m_payment_id ?? ''))
      return c.text('ITN accepted', 200)
    }
    const paid = verdict.status === 'COMPLETE'
    await withTransaction(async (client) => {
      // Idempotent transition: only flip DUE/OVERDUE → terminal state.
      const res = await client.query(
        `UPDATE payments
         SET status = $2::text,
             paid_at = CASE WHEN $5::boolean THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
             paid_amount = CASE WHEN $5::boolean THEN COALESCE(paid_amount, amount) ELSE paid_amount END,
             method = CASE WHEN $5::boolean THEN COALESCE(method, 'PayFast') ELSE method END,
             reference = CASE WHEN $5::boolean THEN COALESCE(reference, $3) ELSE reference END,
             notes = CASE WHEN $5::boolean THEN COALESCE(notes, $4) ELSE notes END,
             updated_at = NOW()
         WHERE id = $1::uuid AND status::text IN ('DUE', 'OVERDUE')`,
        [
          expected.uuid,
          paid ? 'PAID' : 'CANCELLED',
          `PF-${verdict.raw.pf_payment_id ?? ''}`,
          `PayFast sandbox ITN · pf_payment_id ${verdict.raw.pf_payment_id ?? ''} · ${verdict.status}`,
          paid,
        ],
      )
      if (res.rowCount === 0) {
        // Already terminal — idempotent no-op (PayFast retries ITNs).
        return
      }
      if (!expected.partyUserId) {
        // Ledger settled; no party user to notify (notifications.user_id is NOT NULL).
        return
      }
      await client.query(
        `INSERT INTO notifications (
           id, client_id, user_id, title, body, link_path, resource_type, action_type
         ) VALUES (
           gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, '/workspace/operations/payments', 'payment', 'updated'
         )`,
        [
          expected.clientUuid,
          expected.partyUserId,
          paid ? 'Payment received via PayFast' : 'PayFast payment cancelled',
          `${expected.paymentType} of R${(expected.amount).toFixed(2)} for ${expected.partyName} — ${paid ? 'settled' : 'cancelled'} via PayFast.`,
        ],
      )
    })
    return c.text('ITN accepted', 200)
  } catch (err) {
    logPayfastFailure('payfast_itn_error', err)
    return c.text('ITN error', 500)
  }
}
