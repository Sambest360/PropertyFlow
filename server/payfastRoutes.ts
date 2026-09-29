/**
 * PayFast checkout routes (sandbox-first).
 *
 * POST /api/payfast/create
 *   Auth: session cookie `pf_session` or `Authorization: Bearer <session>`.
 *   Anonymous callers get 401. The caller must be the payment party, a
 *   platform super-admin, or agency staff for the payment's agency.
 *   Request JSON:
 *     {
 *       paymentId: string,          // required, frontend or ledger id
 *       amountCents?: number,       // ignored — amount always comes from payments.amount
 *       itemName?: string,
 *       itemDescription?: string,
 *       payer?: { firstName?: string, lastName?: string, email?: string },
 *       subscription?: { cycles: string, frequency: 3|4|5|6|7 }
 *     }
 *   Response 200 JSON:
 *     {
 *       ok: true,
 *       processUrl: string,         // PayFast hosted action URL (sandbox or live)
 *       fields: {                    // post these as application/x-www-form-urlencoded
 *         merchant_id, merchant_key, return_url, cancel_url, notify_url,
 *         m_payment_id, amount, item_name, signature, ...payer fields
 *       }
 *     }
 *   The passphrase is used only to compute `signature` and is never included
 *   in `fields` or any other response property. `amount` is the ledger amount.
 *   Errors: 400 paymentId required | payment_amount_invalid,
 *           401 unauthorized, 403 forbidden, 404 payment_not_found,
 *           409 payment_already_paid | payment_cancelled,
 *           503 payfast_not_configured, 500 payfast_create_failed.
 *
 * POST /api/payfast/itn
 *   PayFast server-to-server notification (form-encoded). The source IP is
 *   only the platform-set address (`x-real-ip` by default). X-Forwarded-For,
 *   Forwarded, X-Client-IP, and every other caller forwarding header are
 *   ignored. With PAYFAST_ITN_LOCAL=1 the address comes from the secret-gated
 *   harness header or PAYFAST_ITN_PLATFORM_IP, and a normal request cannot
 *   set it. Signature is required in sandbox and live. merchant_id must match
 *   PAYFAST_MERCHANT_ID. amount_gross must match the ledger payment.
 *   The body is posted to PAYFAST_VALIDATE_URL (sandbox or live by default).
 *   PAYFAST_VALIDATE_STUB=1 with local mode skips that call and uses the
 *   secret-gated stub header instead. The payment is marked PAID only when
 *   the result is exactly VALID. A duplicate ITN for a payment that is
 *   already terminal does not credit again.
 *   Verified requests answer 200 so PayFast stops retrying; rejected
 *   requests get 400 and the ledger is left unchanged.
 */
import type { Context } from 'hono'
import { query, withTransaction } from './db.js'
import { resolveUuid } from './entityMap.js'
import { resolveSessionUser } from './auth.js'
import { sendPaymentReceipt } from './mailtrap.js'
import {
  buildCheckoutFields,
  amountToCents,
  checkoutAmountCents,
  clientIpSettingsFromEnv,
  confirmItnWithPayfast,
  extraItnIpsFromEnv,
  payfastConfigFromEnv,
  resolveItnClientIp,
  validatePlanFromEnv,
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
    const session = await resolveSessionUser(c)
    if (!session) return c.json({ ok: false, error: 'unauthorized' }, 401)
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
    const agencyFe = payment.clientUuid
      ? (
          await query<{ frontend_id: string | null }>(
            `SELECT COALESCE(settings->>'frontend_id', id::text) AS frontend_id
             FROM clients WHERE id = $1::uuid LIMIT 1`,
            [payment.clientUuid],
          )
        )[0]?.frontend_id ?? null
      : null
    const isParty = payment.partyUserId != null && payment.partyUserId === session.id
    const isPlatform = session.role === 'super_admin'
    const isAgencyStaff =
      agencyFe != null &&
      agencyFe === session.agencyId &&
      (session.role === 'client_admin' || session.role === 'agent_admin' || session.role === 'ground_agent')
    if (!isParty && !isPlatform && !isAgencyStaff) {
      return c.json({ ok: false, error: 'forbidden' }, 403)
    }
    const amountCents = checkoutAmountCents(payment.amount, body.amountCents)
    if (amountCents <= 0) {
      return c.json({ ok: false, error: 'payment_amount_invalid' }, 400)
    }
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
    const sourceIp = resolveItnClientIp((name) => c.req.header(name), clientIpSettingsFromEnv())
    const verdict = verifyItn(body, cfg, {
      sourceIp,
      allowedIps: extraItnIpsFromEnv(),
      expectedPaymentId: expected?.id,
      expectedAmountCents: expected ? amountToCents(expected.amount) : undefined,
    })
    if (!verdict.ok) {
      const kind = /merchant_id/i.test(verdict.reason)
        ? 'payfast_itn_merchant_mismatch'
        : 'payfast_itn_rejected'
      logPayfastFailure(kind, new Error(verdict.reason))
      return c.text('ITN rejected', 400)
    }
    if (!expected) {
      logPayfastFailure('payfast_itn_unknown_payment', new Error(body.m_payment_id ?? ''))
      return c.text('ITN rejected', 400)
    }
    const readHeader = (name: string) => c.req.header(name)
    const plan = validatePlanFromEnv(readHeader)
    let confirmation: { valid: boolean; responseText: string }
    try {
      if (plan.kind === 'stub') {
        if (plan.result === 'ERROR') throw new Error('validate stub error')
        confirmation = { valid: plan.result === 'VALID', responseText: plan.result }
      } else {
        confirmation = await confirmItnWithPayfast(body, plan.url)
      }
    } catch (validateErr) {
      logPayfastFailure('payfast_itn_validate_failed', validateErr)
      return c.text('ITN rejected', 400)
    }
    if (!confirmation.valid) {
      logPayfastFailure(
        'payfast_itn_validate_invalid',
        new Error(confirmation.responseText || 'INVALID'),
      )
      return c.text('ITN rejected', 400)
    }
    const paid = verdict.status === 'COMPLETE'
    let transitioned = false
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
        // Already terminal — idempotent no-op (PayFast retries ITNs). No second credit.
        return
      }
      transitioned = true
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
    // Receipt email only on the transition that marked the row paid.
    if (paid && transitioned && expected.partyUserId) {
      void (async () => {
        try {
          const payer = await query<{ email: string; first_name: string }>(
            `SELECT email, first_name FROM users WHERE id = $1::uuid LIMIT 1`,
            [expected.partyUserId],
          )
          // query() returns the row array directly.
          const email = payer[0]?.email
          if (email) {
            await sendPaymentReceipt({
              email,
              payerName: payer[0]?.first_name,
              paymentId: expected.id,
              amountDisplay: `R${expected.amount.toFixed(2)}`,
              status: verdict.status,
            })
          }
        } catch (emailErr) {
          console.error('[payfast] receipt email failed:', emailErr instanceof Error ? emailErr.message : emailErr)
        }
      })()
    }
    return c.text('ITN accepted', 200)
  } catch (err) {
    logPayfastFailure('payfast_itn_error', err)
    return c.text('ITN error', 500)
  }
}
